/**
 * 「帮我批准」这一档的实际执行者。
 *
 * 它替代的是原先那个实验性自动审查插件：那个插件在切换档位时会重建会话，把整个会话
 * 打进 inactive context，导致之后每一次工具调用都抛 `cannot get required service`。
 * 这里的做法不一样——档位是一个普通的静态 preset（配置在 cordis.patch.yml 里），
 * 切换它只是改沙箱与审批策略，本模块只在真正要执行调用时插一脚，不碰会话生命周期。
 *
 * 判定规则按用户的要求：审查者没有任何上下文，只看这一次调用的工具名和参数，回答
 * 「会不会伤到这台电脑」。无害直接放行，有害就把决定交还给用户。
 */

/** 静态 preset 的 key，必须与 cordis.patch.yml 里的配置项一致。 */
export const REVIEW_PRESET = 'review';

/** 一次调用参数最多塞多少字符给审查者，超出的截断——审查是判断题，不需要读完整个文件。 */
const ARG_BUDGET = 6000;

const REVIEW_SYSTEM = [
  '你是这台电脑上最后一道审批的替代者。你要判断的是一次即将执行的工具调用会不会对这台电脑造成伤害。',
  '你看不到任何对话历史，也不应该猜测调用者的意图。只根据工具名和参数判断这次操作实际会发生什么。',
  '',
  '判为无害（"harmful": false）：读取、查看、搜索、分析；在项目里新建或修改普通文件；运行测试、构建、',
  '格式化、lint；非破坏性的 git 操作（status、diff、log、add、commit）；安装或升级依赖；',
  '重启本会话所属的应用以便让改动生效；清理本次工作中自己产生的临时文件。',
  '',
  '判为有害（"harmful": true）：删除、覆盖或移动用户既有的数据且无法撤销；格式化磁盘或分区、',
  '批量修改文件权限；修改系统设置、注册表、服务、驱动、计划任务、开机启动项；关闭杀毒软件或防火墙；',
  '把密码、密钥、令牌或私人数据发送到外部；对生产环境做写操作；下载并执行来源不明的脚本；',
  '以及任何一旦执行就难以回滚、又不是被明确要求去做的事。',
  '',
  '拿不准就判有害。把决定交还给人，比替他冒险便宜得多。',
  '',
  '只输出一个 JSON 对象，不要输出任何其它文字，不要用代码块包裹：',
  '{"harmful":true,"reason":"一句中文，说清危险在哪"}',
  '{"harmful":false}',
].join('\n');

/** 把参数压成一段文本；对象循环引用、超大值都不能让审查本身失败。 */
function describeArguments(value) {
  if (value === undefined || value === null) return '(无参数)';
  let text;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (typeof text !== 'string') text = String(text);
  if (text.length > ARG_BUDGET) {
    text = `${text.slice(0, ARG_BUDGET)}\n…（参数过长，已截断，共 ${text.length} 字符）`;
  }
  return text;
}

/** 审查请求的唯一一条用户消息：只有工具名和参数，没有历史。 */
function describeCall(exec, cwd) {
  const lines = [`工具：${exec.name}`];
  if (typeof cwd === 'string' && cwd.length > 0) lines.push(`当前工作目录：${cwd}`);
  lines.push('参数：', describeArguments(exec.arguments));
  return lines.join('\n');
}

/** 从模型输出里挖出那个 JSON 对象；前后夹带的解释文字一律忽略。 */
function parseVerdict(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (raw.length === 0) throw new Error('审查者没有输出任何内容');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('审查者没有给出 JSON 结论');
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    throw new Error(`审查结论不是合法 JSON：${String(error)}`);
  }
  const harmful = parsed?.harmful;
  if (typeof harmful !== 'boolean') throw new Error('审查结论缺少 harmful 布尔字段');
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
  return { harmful, reason };
}

/** 跑一次审查。失败一律抛错，由调用处决定怎么兜——绝不在这里默认放行。 */
async function reviewCall(ctx, agent, exec, cwd) {
  const session = agent?.session;
  if (session === undefined || session === null) throw new Error('拿不到当前会话');
  const header = session.requestHeader?.();
  const provider = header?.config?.provider;
  const model = header?.config?.model;
  if (typeof provider !== 'string' || provider.length === 0) throw new Error('当前会话还没有可用的模型提供方');
  if (typeof model !== 'string' || model.length === 0) throw new Error('当前会话还没有可用的模型');

  const options = {
    provider,
    model,
    system: REVIEW_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: describeCall(exec, cwd) }] }],
    temperature: 0,
    signal: exec.signal,
  };

  let text = '';
  let finish;
  for await (const chunk of ctx.llm.stream(options)) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
    else if (chunk?.type === 'finish') finish = chunk.reason;
  }
  if (finish?.kind === 'aborted') throw new Error('审查被中断');
  if (finish?.kind === 'error') throw new Error(finish.failure?.message ?? '模型调用失败');
  return parseVerdict(text);
}

/** 有害时交给用户的回调，文案按中英各给一份。 */
function askUser(exec, reason) {
  const head = `审查认为「${exec.name}」可能有风险`;
  const detail = reason.length > 0 ? `${head}：${reason}` : head;
  return {
    kind: 'ask',
    reason: detail,
    displayReason: {
      en:
        reason.length > 0
          ? `The reviewer flagged "${exec.name}" as risky: ${reason}`
          : `The reviewer flagged "${exec.name}" as risky.`,
      zh: `${detail}。要允许这一次吗？`,
    },
  };
}

/**
 * 装上这道闸。
 *
 * 只有在当前会话选中「帮我批准」这一档时才生效；别的档位原样穿透，一个字节都不插手。
 */
export function registerPermissionReview(ctx) {
  return ctx.inject(['permissionPresets', 'llm'], (inner) => {
    inner.effect(function* () {
      yield inner.on(
        'tools/pre-execute',
        async (exec, next) => {
          const agent = exec.agent;
          if (agent === undefined || agent === null) return next();

          // 外层 run_code 只是个传输壳，真正要审的是它内部的每一次调用。
          if (exec.parent === undefined && exec.name === 'run_code') return next();

          let preset;
          try {
            preset = inner.permissionPresets.current(agent.session);
          } catch {
            return next();
          }
          if (preset !== REVIEW_PRESET) return next();

          let cwd;
          try {
            const header = agent.session?.header;
            cwd = typeof header?.cwd === 'string' ? header.cwd : undefined;
          } catch {}

          let verdict;
          try {
            verdict = await reviewCall(inner, agent, exec, cwd);
          } catch (error) {
            // 审查没跑成不等于这次操作安全。交给用户，不替他把关。
            const message = error instanceof Error ? error.message : String(error);
            return {
              kind: 'ask',
              reason: `审查没能完成（${message}），请你决定「${exec.name}」是否执行`,
              displayReason: {
                en: `The reviewer could not finish (${message}); please decide whether to run "${exec.name}".`,
                zh: `审查没能完成（${message}），请你决定「${exec.name}」是否执行。`,
              },
            };
          }

          if (!verdict.harmful) return next();

          // 先让下游把该拦的拦掉：沙箱拒绝、别的闸门否决都优先于审查意见。
          const downstream = await next();
          if (downstream.kind !== 'allow') return downstream;
          return askUser(exec, verdict.reason);
        },
        { prepend: true },
      );
    }, 'permission-review gate');
  });
}
