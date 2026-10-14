// Host half of the Ultra / Lightning switches.
//
// Why a host half at all: the two switches are prompt-layer controls. The client
// only records the intent and draws the UI; the text that actually changes how the
// agent works is injected here, per session, immediately before a step enters.
//
// Injection follows the engine's own discipline (the built-in @pluginId context
// injector does the same three things):
//   · call `next()` first and append to whatever the framework decided;
//   · filter by exact `agent.id` — children inherit the parent scope, so a
//     scope-registered listener would leak the policy into every subagent;
//   · inject only when the resolved text changed, because every injected message
//     is persisted as a `user/message` on each step it is appended to.
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { policyText, lightningNudge, OFF_NOTICE, tokenMultiplier, presetSilences } from './turbo-policy.js';
import { setAliases, identityHealth, writeAliasesToDisk } from './model-identity.js';

export const TURBO_EVENT = 'dsh-codex-ui/turbo';
export const TURBO_PATH = '/api/dsh-codex-ui/turbo';

/** Sessions kept in the state file; oldest write is dropped first. */
const MAX_SESSIONS = 40;
/** localStorage-independent, human-inspectable, and safe to delete. */
function stateFile() {
  const home = process.env.DSH_HOME;
  return typeof home === 'string' && home.length > 0
    ? join(home, 'storages', 'codex-ui-turbo.json')
    : null;
}

function emptyState() {
  return { sessions: {}, pendingPersona: '', pendingAt: 0 };
}

function readState(file) {
  if (!file) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const sessions = parsed?.sessions;
    if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) return emptyState();
    const clean = {};
    for (const [id, value] of Object.entries(sessions)) {
      if (typeof id !== 'string' || !id || !value || typeof value !== 'object') continue;
      clean[id] = {
        // `persona` is stamped once, on the first turn of the session that started after
        // the hero last picked a tab; absent means "this session never chose one".
        persona: value.persona === 'chat' || value.persona === 'work' ? value.persona : '',
        lightning: value.lightning === true,
        ultra: value.ultra === true,
        superfast: value.superfast === true,
        at: Number.isFinite(value.at) ? value.at : 0,
      };
    }
    const pending = parsed?.pendingPersona;
    return {
      sessions: clean,
      pendingPersona: pending === 'chat' || pending === 'work' ? pending : '',
      pendingAt: Number.isFinite(parsed?.pendingAt) ? parsed.pendingAt : 0,
    };
  } catch (error) {
    // A corrupt or missing file only disables these switches; never break the slider.
    if (error?.code !== 'ENOENT') console.warn(`[dsh-codex-ui] turbo state unreadable: ${String(error)}`);
    return emptyState();
  }
}

function writeState(file, state) {
  if (!file) return;
  // Two kinds of row share this file: one the user armed (ultra / lightning), and one a session
  // stamped for its persona alone. Every Lightning fan-out stamps the children too, so eviction by
  // recency let a handful of child rows push the switches of the conversation the user is actually
  // in out of the file — the composer then reads them as off. Armed rows are therefore kept first,
  // and only rows of equal weight compete on recency.
  const weight = value => (value.ultra || value.lightning || value.superfast ? 1 : 0);
  const rows = Object.entries(state.sessions)
    .sort((a, b) => weight(b[1]) - weight(a[1]) || (b[1].at ?? 0) - (a[1].at ?? 0))
    .slice(0, MAX_SESSIONS);
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    // A session that never stamped a persona persists without the key, so a reload cannot
    // mistake "never chose" for the default.
    const sessions = Object.fromEntries(rows.map(([id, value]) => [id, value.persona
      ? value
      : { lightning: value.lightning, ultra: value.ultra, superfast: value.superfast, at: value.at }]));
    writeFileSync(temp, `${JSON.stringify({
      sessions,
      pendingPersona: state.pendingPersona || '',
      pendingAt: state.pendingAt || 0,
    }, null, 2)}\n`, 'utf8');
    renameSync(temp, file);
  } catch (error) {
    console.warn(`[dsh-codex-ui] turbo state unwritable: ${String(error)}`);
    try { unlinkSync(temp); } catch { /* a stray temp file is not worth failing over */ }
  }
}

/** The source kind this plugin stamps on every row it injects. */
const INJECTED_KIND = 'plugin:dsh-codex-ui';
const textOfMessage = message => (message?.content ?? []).filter(block => block?.type === 'text').map(block => block.text).join('');

/** The text of the newest row this plugin owns in one message list, or `undefined` for none. */
const newestPolicyText = list => {
  if (!Array.isArray(list)) return undefined;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const message = list[index];
    if (message?.source?.kind === INJECTED_KIND) return textOfMessage(message);
  }
  return undefined;
};

/**
 * The text of the newest policy row already in this session's log, or `undefined` when there is
 * none. The log is the source of truth on purpose: `agent/pre-step` is a waterfall whose decision
 * is only appended to the log several abort checks later in `dsh-agent-loop`, so an in-memory
 * marker would survive an abort that the row did not — and that session would silently keep
 * running without its contract for the rest of the process. Reading the log also means a restarted
 * host does not re-inject a block the session already carries.
 */
const injectedSoFar = session => {
  let messages;
  try { messages = session?.deriveMessages?.(); } catch { return undefined; }
  return newestPolicyText(messages);
};

/**
 * `agent/pre-step` injector. `resolve` returns the text that should be in effect
 * for one session — the policy body, a short "switched off" note, or an empty
 * string for a session this plugin never armed. De-duplication lives here so the
 * caller never has to reason about "did it already go in".
 */
export function createPolicyInjector(ctx, resolve) {
  // Only a fallback for a host whose session cannot be read synchronously; when the session is
  // available its log decides, which is what makes the abort window harmless.
  const lastInjected = new Map();
  let disposed = false;
  const handler = async (payload, next) => {
    const decision = typeof next === 'function' ? await next() : undefined;
    try {
      if (disposed) return decision;
      if (payload?.signal?.aborted) return decision;
      if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
      const sessionId = payload?.agent?.id;
      if (typeof sessionId !== 'string' || sessionId.length === 0) return decision;
      // The step position tells the persona decision whether this session is new.
      const text = resolve(sessionId, payload?.agent, { turn: payload?.turn, step: payload?.step });
      if (typeof text !== 'string' || text.length === 0) return decision;
      // Every place the row could already be waiting: the log, the decision being assembled, and
      // the inbox the loop drains. Same three sources the harness's own context injector checks.
      const agent = payload?.agent;
      const session = agent?.session;
      const carriers = [
        session === undefined ? lastInjected.get(sessionId) : injectedSoFar(session),
        newestPolicyText(decision.messages),
        newestPolicyText(agent?.inbox?.nextStep),
        newestPolicyText(agent?.inbox?.nextTurn),
      ];
      // Compared by content, and only against the newest row per source: re-arming a switch has to
      // re-state its contract even though an older row once carried the same text.
      if (carriers.some(carried => carried === text)) return decision;
      lastInjected.set(sessionId, text);
      return {
        ...decision,
        messages: [...decision.messages, {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text }],
          source: { kind: INJECTED_KIND, form: 'instructions' },
        }],
      };
    } catch (error) {
      // Injection is an add-on: a failure here must never fail the step itself.
      try { ctx.logger?.warn?.(`[dsh-codex-ui] policy injection skipped: ${String(error)}`); } catch { /* logging must not throw either */ }
      return decision;
    }
  };
  const off = ctx.on('agent/pre-step', handler);
  return () => {
    disposed = true;
    lastInjected.clear();
    try { off?.(); } catch { /* unload must not throw */ }
  };
}

export function registerTurbo(ctx) {
  const file = stateFile();
  const state = readState(file);
  /** sessionId -> the parts of the block currently injected there (drives the off-notice). */
  state.armed = new Map();
  let writes = Promise.resolve();

  // The hero's tab pick travels with the conversation that starts next: it is stamped onto
  // a session at that session's own first step, and the session keeps it from then on. A
  // conversation whose first step has already happened is never touched, so picking a tab
  // cannot reach back into a session that is already running — and a session that started
  // before the pick still gets the style in force when it opens, never nothing at all.
  const pendingPersona = () => (state.pendingPersona === 'chat' ? 'chat' : 'work');

  /** Stamp the pick onto a session at its first step; return the persona that session owns. */
  const personaFor = (sessionId, position) => {
    const stored = state.sessions[sessionId]?.persona;
    if (stored === 'chat' || stored === 'work') return stored;
    // "First step" is the session's first turn, whatever step number it reports: a resumed
    // or retried opening turn must still get the style rather than none.
    const firstTurn = position?.turn === 1;
    if (!firstTurn) return '';
    const persona = pendingPersona();
    const row = state.sessions[sessionId] ?? { lightning: false, ultra: false, at: 0 };
    state.sessions[sessionId] = { ...row, persona, at: Date.now() };
    const snapshot = { ...state.sessions };
    writes = writes.catch(() => {}).then(() => { writeState(file, { sessions: snapshot, pendingPersona: state.pendingPersona, pendingAt: state.pendingAt }); });
    return persona;
  };

  const flagsFor = (sessionId, position) => ({
    persona: personaFor(sessionId, position),
    lightning: state.sessions[sessionId]?.lightning === true,
    ultra: state.sessions[sessionId]?.ultra === true,
    superfast: state.sessions[sessionId]?.superfast === true,
  });
  // The cost of the contract travels with the state so the interface never hard-codes it.
  const budget = tokenMultiplier();

  /** The flags for the hero's "next session" scope. */
  const pendingFlags = () => ({ persona: pendingPersona(), lightning: false, ultra: false, superfast: false });

  const resolve = (sessionId, agent, position) => {
    if (!sessionId) return '';
    // A session on a preset that owns its own prompt gets nothing from this plugin — not the language
    // contract, not the persona, not the orchestration blocks. resolve() is the single source for all of them.
    if (presetSilences(agent)) return '';
    // Chinese thinking and Chinese answers are forced for every session this plugin arms —
    // including sessions with no persona and no switches, which is why it is decided here
    // and not in the state file. Flip this constant to make it optional again.
    const FORCE_CHINESE = true;
    const flags = { ...flagsFor(sessionId, position), chinese: FORCE_CHINESE };
    const armed = state.armed.get(sessionId) ?? new Set();
    // `origin` alone is only a navigation classification, so the delegation depth is checked alongside it.
    // Unknowable (no header) means NOT a child: every fixture in the tests has no header, and defaulting the
    // other way would flip a dozen injection tests to the child semantics.
    const header = agent?.session?.header;
    const subagent = header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0;
    const text = policyText({ ...flags, subagent });
    const active = new Set(Object.keys(flags).filter(key => flags[key] && flags[key] !== false));
    // A session with no persona and no switches carries nothing; if it previously carried a
    // contract, tell it once that the contract is gone.
    const emptied = armed.size > 0 && active.size === 0;
    state.armed.set(sessionId, active);
    return emptied ? OFF_NOTICE : text;
  };

  const disposeInjector = createPolicyInjector(ctx, resolve);
  // The contract above is delivered once; this keeps the mandate in front of the model on every turn.
  // Without it the only copy sits hundreds of turns back in the log and steers nothing — measured on a live
  // armed session: 539 tool calls, zero delegations, with the contract demonstrably present in the log.
  const nudgedStep = new Map();
  const nudgeHandler = async (payload, next) => {
    const decision = typeof next === 'function' ? await next() : undefined;
    try {
      if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
      if (payload?.signal?.aborted) return decision;
      const sessionId = payload?.agent?.id;
      if (typeof sessionId !== 'string' || sessionId === '') return decision;
      if (presetSilences(payload?.agent)) return decision;
      // `superfast` implies the tree contract, so either switch arms the reminder.
      const row = state.sessions[sessionId];
      if (row?.lightning !== true && row?.superfast !== true) return decision;
      const turn = payload?.turn;
      if (!Number.isFinite(turn)) return decision;
      // Steps 1..3 of every turn, once each. The opener alone was not enough: measured across armed
      // sessions, a single opening reminder still produced turns with zero delegations, because by the time
      // the model is ready to answer the reminder is several tool results behind it. Repeating it on the
      // next two steps keeps the demand in front of the model while it still has steps left to act on.
      const step = Number.isFinite(payload?.step) ? payload.step : 1;
      if (step < 1 || step > 3) return decision;
      const key = `${sessionId}:${turn}`;
      const seen = nudgedStep.get(key) ?? new Set();
      if (seen.has(step)) return decision;
      seen.add(step);
      nudgedStep.set(key, seen);
      return {
        ...decision,
        messages: [...decision.messages, {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: lightningNudge(turn, step) }],
          source: { kind: INJECTED_KIND, form: 'instructions' },
        }],
      };
    } catch {
      // A reminder that fails must never fail the step itself.
      return decision;
    }
  };
  const offNudge = ctx.on('agent/pre-step', nudgeHandler);
  // `ctx.on` lifetime is already owned by the plugin fiber; this only covers an
  // explicit teardown, so an ignored return value would not leak anything.
  ctx.effect(() => () => { disposeInjector(); offNudge(); writes.catch(() => {}); });
  /** Resolves once every queued state write has been attempted; used by tests. */
  const settled = () => writes.catch(() => {});

  const patch = (sessionId, change) => {
    const previous = flagsFor(sessionId);
    // `pendingPersona` + `pendingAt` are the hero's pick for the next conversation; a
    // session row carries the persona it stamped plus the two composer switches.
    if (change.pending === true) {
      if (change.persona !== undefined) {
        state.pendingPersona = change.persona;
        // The stamp is what limits the pick to the conversation that starts next.
        state.pendingAt = Date.now();
      }
    } else if (sessionId) {
      state.sessions[sessionId] = {
        persona: state.sessions[sessionId]?.persona ?? '',
        lightning: change.lightning === undefined ? previous.lightning : change.lightning === true,
        ultra: change.ultra === undefined ? previous.ultra : change.ultra === true,
        superfast: change.superfast === undefined ? previous.superfast : change.superfast === true,
        at: Date.now(),
      };
    }
    const snapshot = { ...state.sessions };
    writes = writes.catch(() => {}).then(() => { writeState(file, { sessions: snapshot, pendingPersona: state.pendingPersona, pendingAt: state.pendingAt }); });
    return change.pending === true ? { pending: true, ...pendingFlags() } : flagsFor(sessionId);
  };

  // Declared as a soft dependency: this plugin also runs on hosts that compose no
  // connection carrier, and a hard `inject` entry that never resolves would stall
  // the whole plugin fiber. Without a carrier the switches stay off, nothing throws.
  ctx.inject?.(['connection'], scope => scope.connection.fetch.register({
    path: TURBO_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try { envelope = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      const payload = envelope?.type === 'client-request' && envelope.method === TURBO_EVENT ? envelope.payload : null;
      const fail = (code, message) => Response.json({ type: 'server-response', rpcId: envelope?.rpcId, result: { ok: false, error: { code, message } } });
      if (!payload || typeof payload.sessionId !== 'string' || payload.sessionId.length > 256) return fail('turbo/invalid', '会话参数无效。');
      // Model display names ride this route rather than a new one. The dedicated route registered fine
      // on the Host and was still unreachable from the client (`HTTP 404` for the whole feature's life),
      // while this one has demonstrably worked since the day the switches shipped. The action is a
      // no-op for every other caller.
      if (payload.action === 'aliases') {
        const value = setAliases({ aliases: payload.aliases, names: payload.names });
        const count = Object.keys(value.aliases).length + Object.keys(value.names).length;
        try { writeAliasesToDisk(value); } catch { /* persistence is best effort */ }
        try { ctx.logger?.info?.(`[dsh-codex-ui] model display names: ${count}`); } catch { /* logging must not fail the call */ }
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { count, identity: identityHealth() } } });
      }
      if (payload.action !== 'read' && payload.action !== 'update') return fail('turbo/invalid', '操作参数无效。');
      // The hero arms a persona before a session exists, so an empty id is the "next
      // session" scope: reads answer with that default and updates record it as pending.
      const pending = payload.sessionId === '';
      if (!pending && payload.action === 'read') return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...flagsFor(payload.sessionId), tokenMultiple: budget.value, tokenExact: budget.exact } } });
      const change = {};
      if (payload.lightning !== undefined) {
        if (pending) return fail('turbo/invalid', '闪电开关需要会话。');
        if (typeof payload.lightning !== 'boolean') return fail('turbo/invalid', '闪电开关参数无效。');
        change.lightning = payload.lightning;
      }
      if (payload.ultra !== undefined) {
        if (pending) return fail('turbo/invalid', 'Ultra 开关需要会话。');
        if (typeof payload.ultra !== 'boolean') return fail('turbo/invalid', 'Ultra 开关参数无效。');
        change.ultra = payload.ultra;
      }
      // Superfast: the tree contract. It implies Lightning, so a session cannot run the tree
      // without the fan-out rules that tell it how to brief a child in the first place.
      if (payload.superfast !== undefined) {
        if (pending) return fail('turbo/invalid', '超快开关需要会话。');
        if (typeof payload.superfast !== 'boolean') return fail('turbo/invalid', '超快开关参数无效。');
        change.superfast = payload.superfast;
      }
      if (payload.persona !== undefined) {
        if (payload.persona !== 'chat' && payload.persona !== 'work') return fail('turbo/invalid', '回复风格参数无效。');
        // Persona is global, so it is only accepted for the hero's "next session" scope.
        if (!pending) return fail('turbo/invalid', '回复风格是全局设置，不接受按会话写入。');
        change.persona = payload.persona;
        change.pending = true;
      }
      if (pending) {
        if (Object.keys(change).length) patch('', change);
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...pendingFlags(), pending: true, tokenMultiple: budget.value, tokenExact: budget.exact } } });
      }
      if (!Object.keys(change).length) return fail('turbo/invalid', '没有需要更新的开关。');
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...patch(payload.sessionId, change), tokenMultiple: budget.value, tokenExact: budget.exact } } });
    },
  }));

  return { settled };
}
