/**
 * 注入块设置页：一列开关，每个开关控制 `policyText()` 里对应的一段文字是否注入到会话。
 *
 * 纯新增的一页，不碰任何现有设置页：宿主设置弹窗的 `settings.section` 是 list 槽，注册一项就多一个
 * 左侧导航项，`id` 决定它被 `only` 过滤命中、`order` 决定它在导航里的位置。宿主同一时刻只渲染被选中
 * 的那一项，所以读取发生在组件挂载时，而不是 apply 时。
 *
 * 传输走 `ctx.connection.rpc`（composer 上那几个开关的同一通道、同一条路由）：
 * `call(channel, method, payload)` 组装 `{ type: 'client-request', rpcId, method, payload }`，返回宿主
 * 解包后的 `result` —— 成功是 `{ ok: true, value: … }`，失败是 `{ ok: false, error: … }`，而通道在激活
 * 早期可能连 `call` 都没有。这三条都必须变成界面上一行看得见的字，不能吞掉：这些开关决定的是模型拿到
 * 什么，界面上完全看不出来（`INJECTION_BLOCKS` 的注释把这条写成了设计前提）。
 *
 * 动作判别在 **payload.action**，不是新的 envelope.method：`envelope.method` 恒为 `dsh-codex-ui/turbo`
 * （`src/turbo.js` 的 `TURBO_EVENT`，路由侧强校验），`action: 'injection'` 是它与 `read` / `update` /
 * `aliases` 并列的第四个分支。另开独立路由在本机实测过：Host 上注册成功，客户端却一直 404。
 *
 * 开关是自绘的 `button[role="switch"]`：宿主的 Switch 控件不在本插件的 `dsh.client.inject` 列表里，
 * 拿不到；轨道和滑块的颜色全部交给 `--dsw-alias-*` 主题变量，深色/浅色两套共用一条规则。
 */

/** `envelope.method`：本插件一直在用的那条路由，注入块是它的一个 action。 */
export const INJECTION_METHOD = 'dsh-codex-ui/turbo';
/** `payload.action`：读取与写入共用这一个动作名，靠 `id` 在不在一起区分。 */
export const INJECTION_ACTION = 'injection';
/**
 * `payload.sessionId`：路由的老校验要求它存在且是字符串（缺字段会被挡掉）。这些开关是全局的，
 * 不属于任何会话，空串就是那个作用域。
 */
export const INJECTION_SESSION_ID = '';
export const INJECTION_SECTION_ID = 'codex-ui-injection';
export const INJECTION_SECTION_ORDER = 24;
export const INJECTION_SECTION_LABEL = '注入块';

/**
 * 一个 id 是不是开着。
 *
 * `switches` 里缺席的 id 一律视为 `true`：宿主只把显式关掉的项写进文件（`value === false` 才留），
 * 所以一份老状态、一个被手删的键、一份坏掉的 JSON 都必须读成"开"，否则文件损坏会静默关掉契约。
 */
export function injectionEnabled(switches, id) {
  return (switches ?? {})[id] !== false;
}

/** 发一次请求，返回宿主解包后的 `result`；`payload` 之外的字段由路由要求补齐在这里。 */
export const injectionCall = async (ctx, payload) => {
  const rpc = ctx?.connection?.rpc;
  if (typeof rpc?.call !== 'function') throw new Error('连接通道还没就绪，请稍后重试。');
  return await rpc.call('/api', INJECTION_METHOD, { action: INJECTION_ACTION, sessionId: INJECTION_SESSION_ID, ...payload });
};

/**
 * 把回包规整成 `{ blocks, switches }`。
 *
 * 数据在 `result.value` 之下，和 `read` / `update` / `aliases` 三个分支一致 —— 不是 `result.ok` 旁边的
 * 平铺字段。缺件一律抛错：半个状态渲染出来的开关，位置和文字都对不上它实际控制的东西。
 */
export function injectionAnswer(result) {
  if (result === null || typeof result !== 'object') throw new Error('宿主没有返回注入开关的状态。');
  if (result.ok === false) throw new Error(result?.error?.message || result?.error?.code || '宿主拒绝了注入开关请求。');
  if (result.ok !== true) throw new Error('宿主返回的注入开关响应缺少 ok 标记。');
  const value = result.value;
  if (value === null || typeof value !== 'object' || !Array.isArray(value.blocks)) throw new Error('宿主返回的注入开关数据里没有 blocks。');
  const raw = value.switches;
  const switches = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { blocks: value.blocks, switches };
}

/** 读一次全量状态。payload 里只有 action 与 sessionId：读取没有别的参数。 */
function injectionRead(ctx) {
  return injectionCall(ctx, {}).then(injectionAnswer);
}

/** 写一项，拿回写回后的全量状态（约定的响应就是完整对象，不需要本地拼）。 */
function injectionWrite(ctx, id, enabled) {
  return injectionCall(ctx, { id, enabled }).then(injectionAnswer);
}

/**
 * 一页开关。
 *
 * 写失败时**不做乐观更新**：开关停在原处，错误写在下面。屏幕上显示的状态因此永远是宿主的状态，
 * 不需要"回滚"这一步，也不会出现一次失败把开关留在假的正确位置上。
 */
function InjectionSection({ ctx }) {
  const [view, setView] = React.useState({ status: 'loading', blocks: [], switches: {}, error: '' });
  const [pending, setPending] = React.useState('');

  const load = () => {
    setView(previous => ({ ...previous, status: 'loading', error: '' }));
    injectionRead(ctx).then(
      answer => setView({ status: 'ready', blocks: answer.blocks, switches: answer.switches, error: '' }),
      problem => setView(previous => ({ ...previous, status: 'error', error: problem?.message || '注入开关读取失败。' }))
    );
  };
  // 只在挂载时读一次：设置弹窗同一时刻只渲染一个 section，切走再回来就是重新挂载。
  React.useEffect(() => { load(); }, []);

  const toggle = (id, enabled) => {
    setPending(id);
    setView(previous => ({ ...previous, error: '' }));
    injectionWrite(ctx, id, enabled).then(
      answer => { setPending(''); setView({ status: 'ready', blocks: answer.blocks, switches: answer.switches, error: '' }); },
      problem => { setPending(''); setView(previous => ({ ...previous, error: problem?.message || '注入开关更新失败，请重试。' })); }
    );
  };

  const rows = view.blocks
    .filter(block => block !== null && typeof block === 'object' && typeof block.id === 'string' && block.id !== '')
    .map(block => {
      const on = injectionEnabled(view.switches, block.id);
      const label = typeof block.label === 'string' && block.label !== '' ? block.label : block.id;
      return h('div', { className: 'cg-injection-row', key: block.id },
        h('div', { className: 'cg-injection-text' },
          h('div', { className: 'cg-injection-label' }, label),
          // note 就写在这一个开关下面：关掉某一块会让后面那些段落失去语境，而那在界面上看不出来。
          typeof block.note === 'string' && block.note !== ''
            ? h('div', { className: 'cg-injection-note' }, block.note)
            : null),
        h('button', {
          type: 'button',
          role: 'switch',
          className: on ? 'cg-toggle cg-toggle-on' : 'cg-toggle',
          'aria-checked': on ? 'true' : 'false',
          'aria-label': label,
          'data-cg-injection': block.id,
          'data-on': on ? 'true' : 'false',
          disabled: pending === block.id,
          onClick: () => toggle(block.id, !on)
        }, h('span', { className: 'cg-toggle-knob' })));
    });

  return h('div', { className: 'cg-injection', 'data-cg-injection-status': view.status },
    h('p', { className: 'cg-injection-intro' }, '这些开关只决定哪些段落会被注入到会话里；关掉任何一块都不会改变界面上的任何效果。'),
    view.error === '' ? null : h('p', { className: 'cg-injection-error', role: 'alert' }, view.error),
    view.status === 'loading' ? h('p', { className: 'cg-injection-hint' }, '正在读取注入块…') : null,
    view.status === 'ready' && rows.length === 0 ? h('p', { className: 'cg-injection-hint' }, '宿主没有报出任何注入块。') : null,
    ...rows,
    view.status === 'error' ? h('button', { type: 'button', className: 'cg-button cg-injection-retry', onClick: load }, '重试') : null);
}

/**
 * 注册这一页。
 *
 * `mountSlot` 是 apply 里那个容错入口：老宿主没有 `ctx.slots.inject` 时只丢这一页，不影响别的注册。
 * `ctx` 通过 props 交给组件 —— 宿主的 owner props 只有 `{ close }`，而这一页要的是连接通道。
 */
export function registerInjectionSection(ctx, mountSlot) {
  return mountSlot('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: INJECTION_SECTION_ID,
    order: INJECTION_SECTION_ORDER,
    // 字符串而不是 thunk：本插件没有注入宿主的 `locale`，不跟着语言切换重注册。
    label: INJECTION_SECTION_LABEL
  }, props => h(InjectionSection, { ...props, ctx })));
}
