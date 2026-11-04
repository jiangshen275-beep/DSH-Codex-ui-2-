// Flash bodies are runtime context; inbox input is only a tiny wake marker.
export const FLASH_CONTEXT_NAME = 'dsh-codex-ui:flash';
export const FLASH_WAKE_KIND = 'plugin:dsh-codex-ui:flash-wake';
const MAX_FACTS = 64;
const MAX_CHARS = 96000;
const MAX_SNAPSHOTS = 8;
const PROTECTED_KINDS = new Set(['help', 'artifact', 'branch-complete', 'branch-failed', 'run-complete', 'run-failed']);
const WAKE_TEXT = '[闪电协作更新：请读取当前 runtime context 中的闪电事实。]';

export function createFlashContext(ctx, { createUserMessage }) {
  if (typeof createUserMessage !== 'function') throw new TypeError('createUserMessage is required');
  const states = new Map();
  const disposers = [];
  let disposed = false;
  const live = parent => !disposed && !!parent && ctx.agents.get(parent.id) === parent;
  const render = (parent, version, facts) => {
    // Derive each run's gate from admitted facts only. Rendering never acknowledges
    // delivery or assumes that an internally delivered fact was publicly reported.
    const runs = new Map();
    for (const { data } of facts) {
      const runId = data?.runId ?? null;
      const previous = runs.get(runId);
      const phase = data?.reporting?.phase ?? data?.reportingPhase;
      const terminal = data?.kind === 'run-complete' || data?.kind === 'run-failed';
      runs.set(runId, { runId, phase: terminal ? 'ready' : phase === 'ready' || phase === 'collecting' ? phase : previous?.phase ?? 'collecting' });
    }
    const reporting = [...runs.values()];
    const gates = reporting.map(({ runId, phase }) => `${runId ?? '未标识run'}=${phase}`).join('；');
    return `[闪电协作事实快照｜统一汇报闸门：${gates}] collecting的run尚未收齐：artifact/branch终态仅内部消化、提前验收与续派，禁止每来一个分支就面向用户重复总结；不要求每次工具调用前发正文进度。用户直接提问/催问/要解释仍须及时非空回应，禁止将collecting解释为全程静默。help即时处理，仅就所需决定交流，不复述产物。ready仅对对应run放行：查询最终状态与summary后统一向用户报告一次，保留失败/partial/未验证项，只补此前已向用户公开内容的变化；内部送达不等于已公开。各run独立，旧run的ready不放行新run。\n`
      + JSON.stringify({ parentId: parent.id, version, reporting, facts: facts.map(x => x.data) })
      + '\n处理求助和已交付产物；不要重复执行分支占用的文件。最终结论按mode使用 flash_control status 或 superfast_control status 查询 summary。';
  };
  const stateFor = parent => {
    let state = states.get(parent);
    if (!state) {
      state = { version: 0, acknowledged: 0, facts: [], snapshots: new Map(), text: '', marker: null };
      states.set(parent, state);
    }
    return state;
  };
  function marker(parent, state) {
    if (state.marker) return;
    const message = createUserMessage({ content: [{ type: 'text', text: WAKE_TEXT }], source: { kind: FLASH_WAKE_KIND, form: 'instructions' } });
    const mode = parent.status === 'running' ? 'inject' : 'steer';
    state.marker = { id: message.id, mode };
    try { parent[mode](message); }
    catch (error) { if (state.marker?.id === message.id) state.marker = null; throw error; }
  }
  function upgrade(parent, state) {
    // An injected marker alone cannot wake an idle driver. Never clear the
    // bookkeeping before a feature-detected, successful inbox removal.
    if (!live(parent) || parent.status !== 'idle' || !state.marker || state.marker.mode !== 'inject') return;
    if (typeof parent.inbox?.remove !== 'function') return;
    const old = state.marker;
    if (!parent.inbox.remove(old.id)) return;
    if (state.marker === old) state.marker = null;
    marker(parent, state);
  }
  function notify(parent, data) {
    if (!live(parent)) throw new Error('flash context parent is no longer live');
    const state = stateFor(parent);
    // Clone at admission: later caller mutation must never change a snapshot.
    const copy = JSON.parse(JSON.stringify(data));
    const version = state.version + 1;
    const facts = [...state.facts, { version, data: copy }];
    let text = render(parent, version, facts);
    while (facts.length > MAX_FACTS || text.length > MAX_CHARS) {
      // Reclaim acknowledged facts first. Pending help, artifacts and terminal
      // events must reach the parent; reject admission rather than lose them.
      let index = facts.findIndex(x => x.version <= state.acknowledged);
      if (index < 0) index = facts.findIndex(x => x.version !== version && !PROTECTED_KINDS.has(x.data?.kind));
      if (index < 0) throw new Error('flash context capacity exceeded; consume pending facts before retrying');
      facts.splice(index, 1);
      text = render(parent, version, facts);
    }
    state.version = version;
    state.facts = facts;
    state.text = text;
    state.snapshots.set(version, text);
    while (state.snapshots.size > MAX_SNAPSHOTS) state.snapshots.delete(state.snapshots.keys().next().value);
    // Collect internal branch facts without waking the parent prematurely. Help
    // and ready/terminal run facts still wake immediately; legacy facts retain
    // their existing behavior. Even an existing marker is not upgraded here.
    const internalCollecting = copy?.internalOnly === true && copy?.kind !== 'help'
      && copy?.kind !== 'run-complete' && copy?.kind !== 'run-failed'
      && copy?.reporting?.phase !== 'ready';
    // A finished run no longer wakes the parent. The chat UI renders every waking
    // message as a "turn trigger" card, and the user asked for a silent finish:
    // the snapshot still renders through the system-prompt context, so the parent
    // reads the result on its next turn instead of being interrupted by a card.
    const silentTerminal = copy?.kind === 'run-complete' || copy?.kind === 'run-failed';
    if (!internalCollecting && !silentTerminal) {
      upgrade(parent, state);
      marker(parent, state);
    }
    return { accepted: true, version };
  }
  function text({ agent } = {}) {
    return live(agent) ? states.get(agent)?.text ?? '' : '';
  }
  const pending = parent => {
    const state = live(parent) ? states.get(parent) : undefined;
    return { version: state?.version ?? 0, acknowledged: state?.acknowledged ?? 0,
      pending: !!state && state.version > state.acknowledged,
      markerQueued: !!state?.marker, markerMode: state?.marker?.mode ?? null, factCount: state?.facts.length ?? 0 };
  };
  const listen = (name, fn) => { const stop = ctx.on(name, fn); if (typeof stop === 'function') disposers.push(stop); };
  const registration = ctx.systemPrompt.context({ name: FLASH_CONTEXT_NAME, order: 850, interpolate: false, text });
  if (typeof registration === 'function') disposers.push(registration);
  listen('session/event', (session, event) => {
    if (disposed || event.type !== 'user/message') return;
    const source = event.data?.source;
    if (source?.kind !== 'runtime-context' || source.form !== 'snapshot' || !Array.isArray(source.sections)) return;
    for (const [parent, state] of states) {
      if (!live(parent) || parent.session !== session) continue;
      for (const section of source.sections) {
        if (section.name !== FLASH_CONTEXT_NAME) continue;
        for (const [version, snapshot] of state.snapshots) {
          if (section.text === snapshot) state.acknowledged = Math.max(state.acknowledged, version);
        }
      }
    }
  });
  listen('agent/inbox/claimed', ({ agent, message }) => {
    const state = states.get(agent);
    if (state?.marker?.id === message?.id) state.marker = null;
    // Claim is not acknowledgment; a subsequent notify must be able to enqueue
    // another marker even while the previous request is still assembling.
  });
  listen('agent/inbox/discarded', ({ agent, message }) => {
    const state = states.get(agent);
    if (state?.marker?.id === message?.id) state.marker = null;
    // Cancellation is not acknowledgment or permission to resume. Only a
    // subsequent notification may enqueue a fresh wake marker.
  });
  listen('agent/status', ({ agent, status }) => {
    const state = states.get(agent);
    if (state && status === 'idle') upgrade(agent, state);
  });
  listen('agent/disposed', ({ agent }) => { states.delete(agent); });
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [parent, state] of states) {
      if (state.marker && typeof parent.inbox?.remove === 'function') parent.inbox.remove(state.marker.id);
    }
    states.clear();
    for (const stop of disposers.splice(0).reverse()) stop();
  }
  return { notify, text, pending, dispose };
}
