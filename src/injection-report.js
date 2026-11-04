/**
 * 「本轮注入」报告：这一轮模型实际看到了哪些提示词。
 *
 * 为什么放在宿主侧：注入的内容只有会话事件里有——系统提示（`system/message`）、每轮的
 * runtime-context 段落、人设提醒（`plugin:dsh-codex-ui`），而客户端拿不到稳定的读取接口。
 * 这里只读不写，返回给客户端渲染。
 */

/** 人设提醒消息的 source.kind，与 `persona-reminder.js` 保持一致。 */
const INJECTED_KIND = 'plugin:dsh-codex-ui';

export const INJECTION_REPORT_PATH = '/api/chatgpt-ui/injection-report';

function textOf(message) {
  const content = Array.isArray(message?.content) ? message.content : message?.message?.content;
  if (!Array.isArray(content)) return '';
  return content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
}

function sectionText(source) {
  return (source?.sections ?? []).map(section => ({
    name: String(section?.name ?? ''),
    text: typeof section?.text === 'string' ? section.text : '',
  }));
}

/**
 * 从会话事件里裁出「本轮」：最后一个 `turn/start` 之后的全部事件。
 * 一个会话刚建好、还没跑过轮次时返回空数组，报告仍然可用（只是内容为空）。
 */
export function turnSlice(events) {
  let index = -1;
  for (let cursor = events.length - 1; cursor >= 0; cursor -= 1) {
    if (events[cursor]?.type === 'turn/start') { index = cursor; break; }
  }
  return index < 0 ? [] : events.slice(index);
}

/**
 * 组装报告。
 *
 * 三个来源分开列，因为它们的「硬」程度不同：系统提示是模型必须遵守的硬设定；runtime-context
 * 段落是每轮挂上去的运行时事实；人设提醒只是一条消息，正文已经进了系统提示时它就只剩索引作用。
 */
export function buildInjectionReport(events) {
  const turn = turnSlice(events);
  let systemEvent;
  for (let cursor = events.length - 1; cursor >= 0; cursor -= 1) {
    if (events[cursor]?.type === 'system/message') { systemEvent = events[cursor]; break; }
  }
  const systemText = textOf(systemEvent?.data?.message);

  let contextEvent;
  for (let cursor = turn.length - 1; cursor >= 0; cursor -= 1) {
    const event = turn[cursor];
    if (event?.type === 'user/message' && event.data?.source?.kind === 'runtime-context') { contextEvent = event; break; }
  }

  let reminderEvent;
  for (let cursor = turn.length - 1; cursor >= 0; cursor -= 1) {
    const event = turn[cursor];
    if (event?.type === 'user/message' && event.data?.source?.kind === INJECTED_KIND) { reminderEvent = event; break; }
  }

  let headerEvent;
  for (let cursor = events.length - 1; cursor >= 0; cursor -= 1) {
    if (events[cursor]?.type === 'request/header') { headerEvent = events[cursor]; break; }
  }
  const tools = (headerEvent?.data?.header?.tools ?? []).map(tool => String(tool?.name ?? '')).filter(Boolean);

  const start = turn.find(event => event?.type === 'turn/start');
  const last = turn.length > 0 ? turn[turn.length - 1] : undefined;
  return {
    ok: true,
    turn: typeof start?.data?.turn === 'number' ? start.data.turn : null,
    at: typeof last?.time === 'number' ? new Date(last.time).toISOString() : null,
    system: {
      chars: systemText.length,
      text: systemText,
      hasPersonaSection: systemText.includes('人设（本会话生效'),
      at: systemEvent ? new Date(systemEvent.time).toISOString() : null,
    },
    sections: sectionText(contextEvent?.data?.source).map(section => ({ ...section, chars: section.text.length })),
    reminder: reminderEvent === undefined ? null : { chars: textOf(reminderEvent.data).length, text: textOf(reminderEvent.data) },
    tools,
    counts: {
      sections: sectionText(contextEvent?.data?.source).length,
      reminders: reminderEvent === undefined ? 0 : 1,
      tools: tools.length,
    },
  };
}

/** 注册报告路由。宿主没有 connection 服务时静默跳过——菜单项仍然可见，只是点了会报没有路由。 */
export function registerInjectionReport(ctx) {
  if (typeof ctx?.connection?.fetch?.register !== 'function') return;
  ctx.connection.fetch.register({
    path: INJECTION_REPORT_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try { envelope = await request.json(); } catch { return Response.json({ error: 'Invalid report request' }, { status: 400 }); }
      const sessionId = envelope?.payload?.sessionId;
      const reply = result => Response.json({ type: 'server-response', rpcId: envelope?.rpcId ?? '', result });
      if (typeof sessionId !== 'string' || sessionId.trim() === '') return reply({ ok: false, error: '缺少 sessionId' });
      try {
        const inspection = await ctx.sessionController.inspect(sessionId, request.signal);
        const report = buildInjectionReport(inspection?.events ?? []);
        // 同时给两种形状：`report` 直接铺平，`value` 里也放一份。宿主 RPC 有的方法按 `value`
        // 取值（人设那几条就是这样），铺平后两条路都能读到，客户端也就不用猜是哪一种。
        return reply({ ...report, probe: 'injection-report/v1', value: report });
      } catch (error) {
        return reply({ ok: false, error: String(error?.message ?? error) });
      }
    },
  });
}
