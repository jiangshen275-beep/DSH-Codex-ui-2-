// Host half of the Ultra / Lightning switches.
//
// Two records live behind this one route and one action namespace: the reply style (persona) plus the
// injection switches, and the three effort switches. The effort record (`codex-ui-effort.json`) is
// shared with `dsh-codex-ui-reasoning`: that plugin writes it, and so does this one again — the route
// reads the flags and an `update` naming one of them writes them back. The one rule the shared file
// imposes is that a write is a whole-file rewrite built from a read taken immediately before the
// mutation (`patchEffort`), never from the registration snapshot; an `ok: true` that wrote nothing is
// the silent failure this route is not allowed to reproduce.
//
// Why a host half at all: the two switches are prompt-layer controls. The client
// only records the intent and draws the UI; the text that actually changes how the
// agent works is injected here, per session, immediately before a step enters.
//
// Current hosts read policy through systemPrompt.context, without persisting user messages.
// The pre-step listener only updates short reminder state. Hosts without that API retain
// the deduplicated message injector, with independent provenance for reminder messages.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { policyText, lightningNudge, OFF_NOTICE, tokenMultiplier, presetSilences, INJECTION_BLOCKS } from './turbo-policy.js';
import { setAliases, identityHealth, writeAliasesToDisk } from './model-identity.js';
import { setInjection } from './injection-state.js';
// 「聊天/工作」与用户选的人设是两套语气来源，冲突时人设说话（见 `personaTextOf` 的注释）。
import { personaTextOf } from './prompt-modes.js';

export const TURBO_EVENT = 'dsh-codex-ui/turbo';
export const TURBO_PATH = '/api/dsh-codex-ui/turbo';

/**
 * 默认关的注入块。
 *
 * 原先这一块是唯一的反向例外（缺键算关），原因写在 `thinkingAloud` 的设计意图里。实测把它翻了过来：
 * 这台机器上的模型不往 reasoning 通道写东西，过程全落在正文 content 里，「边想边写」那段提示词
 * 于是变成「把碎片打进回答」。现在缺键即开「想完再答」，规则仍必须和 `turbo-policy.js` 的 `on()`
 * 一致，否则界面会显示「开」而实际没注入。
 */
const INJECTION_DEFAULT_OFF = new Set();

/** 一个注入块当前是不是开着。显式布尔优先，缺键按上面那张表。 */
const injectionOn = (map, id) => {
  const value = map?.[id];
  if (value === false) return false;
  if (value === true) return true;
  return !INJECTION_DEFAULT_OFF.has(id);
};

/** Sessions kept in a record file; the oldest row is dropped first. */
const MAX_SESSIONS = 40;
/**
 * The three effort switches: the fields the effort record owns. This route reads them as part of a
 * session's flags and writes them on `update`, field by field, so a request can never write a field
 * that record does not own.
 */
const EFFORT_FIELDS = ['lightning', 'ultra', 'superfast'];
/** Field labels for the error text, which the client surfaces verbatim. */
const EFFORT_LABELS = { lightning: '闪电', ultra: 'Ultra', superfast: '超快' };
// The two records are stored in two files, because they leave on two different journeys: the reply
// style and the injection switches stay with this plugin, while the three effort switches move to a
// plugin of their own. They share nothing but the route they are patched through.
const PERSONA_FILE = 'codex-ui-persona.json';
const EFFORT_FILE = 'codex-ui-effort.json';
/**
 * The three reply styles the settings row offers, in the order it shows them.
 *
 * `none` means "inject no style template at all": the model keeps the host's own system prompt, and
 * a user-written persona (if one is in force) is the only voice layer left. It replaces the old
 * two-state toggle, whose absence of a third value is what made "turn the style off" impossible —
 * the settings row could only flip between chat and work, and an unset value silently became work.
 */
const PERSONA_VALUES = ['work', 'chat', 'none'];
/** The style a session follows until someone picks one: inject nothing, i.e. the host's own prompt. */
const DEFAULT_PERSONA = 'none';
/** The single file both records used to share. Read once, split, then retired — never deleted. */
const LEGACY_FILE = 'codex-ui-turbo.json';

/** Count dispatch attempts at tool/call, regardless of the eventual result. */
const DISPATCH_TOOLS = new Set(['subagent', 'subagent_fork', 'send_message', 'flash_start', 'flash_run', 'superfast_start']);
const isDispatchCall = data => {
  if (DISPATCH_TOOLS.has(data?.name)) return true;
  if (data?.name !== 'flash_control') return false;
  try {
    const args = typeof data.arguments === 'string' ? JSON.parse(data.arguments) : data.arguments;
    return args?.action === 'add';
  } catch { return false; }
};
/**
 * A turn whose tool calls reached this count with zero dispatches is flagged in the log.
 *
 * The threshold is the only knob, and it is a proxy: a greeting or a one-command answer stays below
 * it, so a flagged turn can be read as "this one did real work alone". The count comes from the host
 * event stream, not from the model's own account of what it did — that is the whole point.
 */
const FANOUT_FLAG_THRESHOLD = 8;

/** localStorage-independent, human-inspectable, and safe to delete. */
function stateFile(kind) {
  const home = process.env.DSH_HOME;
  if (typeof home !== 'string' || home.length === 0) return null;
  return join(home, 'storages', kind === 'persona' ? PERSONA_FILE : EFFORT_FILE);
}

function legacyStateFile() {
  const home = process.env.DSH_HOME;
  return typeof home === 'string' && home.length > 0
    ? join(home, 'storages', LEGACY_FILE)
    : null;
}

function emptyPersonaState() {
  return { sessions: {}, pendingPersona: '', pendingAt: 0, injection: {} };
}

function emptyEffortState() {
  return { sessions: {} };
}

/**
 * The persona half of one parsed record document. `parsed` may be `null` (an unparsable legacy
 * file), which reads as "nothing recorded" rather than as a failure.
 */
function parsePersona(parsed) {
  const sessions = parsed?.sessions;
  if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) return emptyPersonaState();
  const clean = {};
  for (const [id, value] of Object.entries(sessions)) {
    if (typeof id !== 'string' || !id || !value || typeof value !== 'object') continue;
    // `persona` is stamped on the session the settings row wrote it to; absent means "this session
    // never chose one", not "it chose the default". Three values are accepted: `none` is a real
    // choice ("inject no template"), so it must survive a reload exactly like chat and work.
    const persona = PERSONA_VALUES.includes(value.persona) ? value.persona : '';
    // A row without a persona carries nothing this record owns any more: the switches that used to
    // make such a row worth writing moved to the effort record.
    if (persona) clean[id] = { persona, at: Number.isFinite(value.at) ? value.at : 0 };
  }
  // Injection switches are global, not per session: one set governs every session this profile runs.
  // Only `false` is stored — an absent key, a corrupt value or a field someone deleted all mean "on",
  // so a damaged file can never silently switch the contract off.
  const injection = {};
  const rawInjection = parsed?.injection;
  if (rawInjection && typeof rawInjection === 'object' && !Array.isArray(rawInjection)) {
    for (const [id, value] of Object.entries(rawInjection)) {
      // Only ids the interface still offers: a block that has no switch any more must not stay muted by a
      // leftover key, and the blocks that carry no switch on purpose can never be switched off this way.
      // 显式的 true 也要收下：默认关的块（「想完再答」）只有靠它才能被打开。
      if (typeof id === 'string' && typeof value === 'boolean' && INJECTION_BLOCKS.some(block => block.id === id)) injection[id] = value;
    }
  }
  const pending = parsed?.pendingPersona;
  return {
    sessions: clean,
    pendingPersona: PERSONA_VALUES.includes(pending) ? pending : '',
    pendingAt: Number.isFinite(parsed?.pendingAt) ? parsed.pendingAt : 0,
    injection,
    // The name is a string, not a switch: injection only records the blocks that are OFF, so it cannot
    // carry a value. Kept at the top level next to injection and persisted the same way.
  };
}

/** The effort half of one parsed record document; `parsed` may be `null`, as above. */
function parseEffort(parsed) {
  const sessions = parsed?.sessions;
  if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) return emptyEffortState();
  const clean = {};
  for (const [id, value] of Object.entries(sessions)) {
    if (typeof id !== 'string' || !id || !value || typeof value !== 'object') continue;
    clean[id] = {
      lightning: value.lightning === true,
      ultra: value.ultra === true,
      superfast: value.superfast === true,
      at: Number.isFinite(value.at) ? value.at : 0,
    };
  }
  return { sessions: clean };
}

function readPersonaState(file) {
  if (!file) return emptyPersonaState();
  try {
    return parsePersona(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    // A corrupt or missing file only disables these switches; never break the slider.
    if (error?.code !== 'ENOENT') console.warn(`[dsh-codex-ui] persona state unreadable: ${String(error)}`);
    return emptyPersonaState();
  }
}

function readEffortState(file) {
  if (!file) return emptyEffortState();
  try {
    return parseEffort(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    // Same rule as the persona half: a damaged record costs the switches, never the plugin.
    if (error?.code !== 'ENOENT') console.warn(`[dsh-codex-ui] effort state unreadable: ${String(error)}`);
    return emptyEffortState();
  }
}

/**
 * The effort record as it stands now, not as it stood at registration.
 *
 * `dsh-codex-ui-reasoning` writes this file while this process runs, and this process writes it too, so
 * the snapshot read at registration stops being the truth the moment a switch is flipped: the injector
 * would keep building its policy text from a switch that is no longer set. Revalidating costs one
 * `statSync` — metadata only, no data read — and the file is parsed again only when its identity changed.
 *
 * The identity carries `ino` next to `mtimeMs`, because every writer replaces the file (temp + rename),
 * which always yields a new inode even when two writes land inside the same millisecond. Measured on
 * NTFS: 200 rapid atomic writes gave 200 distinct `ino` values and a 100 ns `mtimeMs`, so neither part
 * is the only guard against a missed change.
 *
 * `fs.watch` was the alternative and is rejected: its callbacks are asynchronous, so a switch flipped
 * right before a step can still be served from the old cache, and a watcher that never attached (the
 * storages directory does not exist yet) fails permanently instead of costing one read.
 *
 * `commit()` is what the writer calls once a queued write lands: it drops the cached identity and reads
 * the file back, so memory cannot drift behind the bytes this process just rewrote.
 */
function createEffortReader(file) {
  /** The identity of "no file", kept distinct from "" so a missing record is also a cached answer. */
  const MISSING = 'missing';
  let state = emptyEffortState();
  let identity = '';
  const read = () => {
    if (!file) return state;
    let stats;
    try {
      stats = statSync(file);
    } catch (error) {
      // A missing record means "no switch is armed": the defaults, never an error. Any other failure
      // (a rename racing the stat, a permission hiccup) keeps the last good record — dropping every
      // switch because one stat failed would disarm a session in the middle of a turn.
      //
      // The default is only built the first time: this object is also the one the writer mutates, so
      // replacing it on every read would erase a switch set before the file exists yet — a fresh
      // `DSH_HOME` arms a session, the next read hands the injector an empty state, and the contract
      // never gets injected even though the client was told the switch is on.
      if (error?.code === 'ENOENT' && identity !== MISSING) { state = emptyEffortState(); identity = MISSING; }
      return state;
    }
    const next = `${stats.ino}:${stats.mtimeMs}:${stats.size}`;
    if (next === identity) return state;
    // `readEffortState` already answers a missing or unparsable file with the defaults and warns once.
    // Caching that answer under this identity is what keeps a damaged file from warning on every step.
    state = readEffortState(file);
    identity = next;
    return state;
  };
  /**
   * Drop the cached copy after this process wrote the record, and read it back now.
   *
   * Not decoration: a write is queued as a promise, so without this a mutation can be applied to a
   * state object that the next `read()` is about to replace with the file's older rows, and the
   * injector would then serve a switch the user already turned on as off. Reading back costs one file
   * read per switch flip, and leaves memory exactly equal to what is on disk.
   */
  const commit = () => {
    identity = '';
    return read();
  };
  // The reader stays a callable — `currentEffort()` is what every consumer below calls — with the
  // commit handle hung off it, so the writer and the readers share one cache without a second object.
  read.commit = commit;
  // Read here rather than on first use: the first `agent/pre-step` after registration must already
  // carry the recorded switches, and deferring the read would hand that step an empty state.
  read();
  return read;
}

/** One record file, written whole: temp in the same directory, then rename. */
function writeRecordFile(file, payload, label) {
  if (!file) return false;
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    renameSync(temp, file);
    return true;
  } catch (error) {
    console.warn(`[dsh-codex-ui] ${label} state unwritable: ${String(error)}`);
    try { unlinkSync(temp); } catch { /* a stray temp file is not worth failing over */ }
    return false;
  }
}

/**
 * @returns whether the bytes actually reached the record file (the caller commits the reader on true).
 *
 * Ported verbatim from `dsh-codex-ui-reasoning`'s `writeEffortState` (there: `lib/index.js:302-317`):
 * the same record file, the same `MAX_SESSIONS` cap and the same weighted eviction. This half writes it
 * again, so the file has two writers and the comment below is the reason the order is not optional.
 */
function writeEffortState(file, state) {
  // Two kinds of row reach this record: one the user armed, and one that only ever carried a persona
  // back when both halves shared a file. Lightning fan-outs stamp children too, so eviction by recency
  // alone let a handful of child rows push the switches of the conversation the user is in out of the
  // file and the composer then read them as off. Armed rows are kept first; only equal rows compete on
  // recency.
  const weight = value => (value.ultra || value.lightning || value.superfast ? 1 : 0);
  const rows = Object.entries(state.sessions)
    .sort((a, b) => weight(b[1]) - weight(a[1]) || (b[1].at ?? 0) - (a[1].at ?? 0))
    .slice(0, MAX_SESSIONS);
  return writeRecordFile(file, {
    sessions: Object.fromEntries(rows.map(([id, value]) => [id, {
      lightning: value.lightning, ultra: value.ultra, superfast: value.superfast, at: value.at,
    }])),
  }, 'effort');
}

function writePersonaState(file, state) {
  // The reply style belongs to one conversation, so recency is the only thing deciding which rows
  // survive the cap: every row here is the session's own choice, none of them is a fan-out stamp.
  const rows = Object.entries(state.sessions)
    .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
    .slice(0, MAX_SESSIONS);
  writeRecordFile(file, {
    sessions: Object.fromEntries(rows.map(([id, value]) => [id, { persona: value.persona, at: value.at }])),
    pendingPersona: state.pendingPersona || '',
    pendingAt: state.pendingAt || 0,
    // 存显式布尔：默认关的块（「想完再答」）必须能把 true 落盘，否则永远开不起来。
    injection: Object.fromEntries(Object.entries(state.injection ?? {}).filter(([, value]) => typeof value === 'boolean')),
  }, 'persona');
}

/**
 * Retire the shared record file without destroying it: a rename keeps the evidence of what was
 * migrated, and an existing `.migrated` is never overwritten.
 */
function retireLegacyFile(legacy) {
  let target = `${legacy}.migrated`;
  try {
    for (let index = 2; existsSync(target); index += 1) target = `${legacy}.migrated.${index}`;
    renameSync(legacy, target);
    return true;
  } catch (error) {
    console.warn(`[dsh-codex-ui] legacy turbo record could not be retired: ${String(error)}`);
    return false;
  }
}

/**
 * Split the shared record once: this half writes the persona file and retires the legacy bytes.
 *
 * It has to run before the first read and before any write: `writePersonaState` rewrites a whole
 * file, so a write that went first would persist an empty half over data that was never split.
 * Idempotent by construction — the half is written only when it is absent, and a second start finds
 * the legacy file already retired.
 *
 * The effort half is deliberately not written here any more. `dsh-codex-ui-reasoning` seeds it from
 * this same legacy file, and applying the split here as well is exactly the second writer this plugin
 * just stopped being: whichever one went second would overwrite the other with its own snapshot.
 * Retirement still waits for the effort file to exist, so a host without that plugin keeps the legacy
 * switches instead of dropping them, and simply retries on the next start.
 */
function migrateLegacyState() {
  const legacy = legacyStateFile();
  const personaFile = stateFile('persona');
  const effortFile = stateFile('effort');
  if (!legacy || !personaFile || !effortFile) return false;
  let text;
  try { text = readFileSync(legacy, 'utf8'); } catch { return false; } // nothing to migrate
  if (existsSync(personaFile) && existsSync(effortFile)) { retireLegacyFile(legacy); return false; }
  // An unparsable file migrates as "nothing recorded": the bytes are preserved by the rename, and
  // guessing at a half-valid record is worse than starting clean.
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  if (!existsSync(personaFile)) writePersonaState(personaFile, parsePersona(parsed));
  // Retired only once both halves are actually on disk: a failed write leaves the legacy file in
  // place, so the next start tries again instead of dropping the record.
  if (existsSync(personaFile) && existsSync(effortFile)) retireLegacyFile(legacy);
  return true;
}

/** The source kind this plugin stamps on every row it injects. */
const INJECTED_KIND = 'plugin:dsh-codex-ui';
// Reminders are not policy revisions: sharing this kind re-injected the full contract after each nudge.
const NUDGE_KIND = 'plugin:dsh-codex-ui:nudge';
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
  const personaFile = stateFile('persona');
  const effortFile = stateFile('effort');
  // Before the first read and before any write: a write rewrites a whole record file, so going first
  // would persist an empty half over the data the migration has not split yet.
  try { migrateLegacyState(); } catch (error) { console.warn(`[dsh-codex-ui] turbo record migration skipped: ${String(error)}`); }
  const personaState = readPersonaState(personaFile);
  // Not the registration snapshot: `dsh-codex-ui-reasoning` writes that record while this process runs
  // and so does this one, so every consumer of the switches below revalidates it instead of trusting
  // these bytes for a process lifetime. `migrateLegacyState` still seeds the file, which is why the
  // first read happens here.
  const currentEffort = createEffortReader(effortFile);
  // The switches are published process-wide because the Codex prompt section is assembled elsewhere:
  // `applyPromptModes` runs before this function in `lib/index.js`, so it cannot be handed the value.
  setInjection(personaState.injection);
  // Dynamic context is a read-only snapshot: resolving it must not consume state or emit messages.
  // Two records, two chains: a slow persona write must not hold up a switch write, and neither may
  // interleave two whole-file rewrites of the same file.
  let personaWrites = Promise.resolve();
  let effortWrites = Promise.resolve();

  // The reply style is now a per-session value that can change mid-conversation (the settings row
  // writes the session's own row), with `pendingPersona` as the value every session that never chose
  // its own follows. An unset record answers `none` — inject nothing — instead of the old silent
  // fallback to `work`, which is what made the row look pinned to 工作 no matter what was picked.
  const pendingPersona = () => (PERSONA_VALUES.includes(personaState.pendingPersona) ? personaState.pendingPersona : DEFAULT_PERSONA);

  /**
   * Queue one whole-file write of the persona record. `sessions` freezes the row map at queue time for
   * the callers that just mutated a row; the injection switch passes nothing, so its write reads the
   * switch map at the moment the chain reaches it.
   */
  const queuePersonaWrite = sessions => {
    personaWrites = personaWrites.catch(() => {}).then(() => {
      writePersonaState(personaFile, {
        sessions: sessions ?? { ...personaState.sessions },
        pendingPersona: personaState.pendingPersona,
        pendingAt: personaState.pendingAt,
        injection: { ...personaState.injection },
      });
    });
  };

  /**
   * The reply style one session runs under: its own row when it has one, otherwise the last value
   * picked in the settings row.
   *
   * It no longer stamps anything and no longer cares which turn it is. The old rule ("stamp at the
   * session's first turn, then never change") is exactly what made a mid-conversation switch
   * impossible: a running session had no row and no writer, so the interface could pick a new style
   * and the very next step would still be served the old one. Following `pending` instead means a
   * session with no row of its own tracks the global pick on every step, and a session the user
   * switches explicitly keeps its own value.
   */
  const personaFor = sessionId => {
    const stored = personaState.sessions[sessionId]?.persona;
    return PERSONA_VALUES.includes(stored) ? stored : pendingPersona();
  };

  /** The three switches, read from the record that owns them — current value on every call. */
  const effortFlags = sessionId => {
    const state = currentEffort();
    return {
      lightning: state.sessions[sessionId]?.lightning === true,
      ultra: state.sessions[sessionId]?.ultra === true,
      superfast: state.sessions[sessionId]?.superfast === true,
    };
  };

  // Field order is part of the response contract: the client reads all four off one object.
  // Two scopes on purpose. The three switches are a property of the conversation, so a delegated child
  // reads its parent's row (`flagScope`). The reply style belongs to the session itself, so it always
  // reads the session's own id — a child asking with its parent's id would report the parent's style.
  const flagsFor = (flagScope, personaScope) => ({
    persona: personaFor(personaScope),
    ...effortFlags(flagScope),
  });
  // The cost of the contract travels with the state so the interface never hard-codes it.
  const budget = tokenMultiplier();

  /** The flags for the hero's "next session" scope. */
  const pendingFlags = () => ({ persona: pendingPersona(), lightning: false, ultra: false, superfast: false });

  /**
   * Queue one whole-file write of the effort record; `sessions` freezes the row map at queue time.
   *
   * The reader is told afterwards (`commit`) so memory never lags the file: the write is a promise, and
   * a read that lands between two queued writes would otherwise replace the mutated state with the
   * file's older rows. A write that throws or fails to land leaves the cached state alone — the switch
   * stays in force for this process, which is better than disarming a session over a disk error.
   */
  const queueEffortWrite = () => {
    const sessions = { ...currentEffort().sessions };
    effortWrites = effortWrites.catch(() => {}).then(() => {
      if (writeEffortState(effortFile, { sessions })) currentEffort.commit();
    });
  };

  /**
   * The effort record's writer, restored: the switches are persisted by this route again.
   *
   * It returns the merged flags so the response keeps the shape the read route answers with, and it
   * never touches the reply style — that record is someone else's. One read serves both the merge and
   * the mutation: two calls could straddle a revalidating read and write the new row into an object the
   * reader has already replaced.
   */
  const patchEffort = (sessionId, change) => {
    const state = currentEffort();
    const previous = effortFlags(sessionId);
    state.sessions[sessionId] = {
      lightning: change.lightning === undefined ? previous.lightning : change.lightning === true,
      ultra: change.ultra === undefined ? previous.ultra : change.ultra === true,
      superfast: change.superfast === undefined ? previous.superfast : change.superfast === true,
      at: Date.now(),
    };
    queueEffortWrite();
    return { ...flagsFor(sessionId, sessionId), tokenMultiple: budget.value, tokenExact: budget.exact };
  };

  const resolve = (sessionId, agent, position) => {
    if (!sessionId) return '';
    if (sessionId.startsWith('session-cgflash-')) {
      if (sessionId.startsWith('session-cgflash-sf-')) return '你是隐藏超快执行者，父会话的直接子代理：只做任务包这一整块工作，只改自己write_paths内的文件，不派生子代理、不另起run；用superfast_report报progress/artifact，真正阻塞才help等待父回复。';
      return '你是后台闪电执行者，按当前任务包直接工作；不得派生代理，不继承父会话的普通派工规则。';
    }
    // A session on a preset that owns its own prompt gets nothing from this plugin — not the language
    // contract, not the persona, not the orchestration blocks. resolve() is the single source for all of them.
    if (presetSilences(agent)) return '';
    // Chinese thinking and Chinese answers are forced for every session this plugin arms —
    // including sessions with no persona and no switches, which is why it is decided here
    // and not in the state file. Flip this constant to make it optional again.
    const FORCE_CHINESE = true;
    // `origin` alone is only a navigation classification, so the delegation depth is checked alongside it.
    // Unknowable (no header) means NOT a child: every fixture in the tests has no header, and defaulting the
    // other way would flip a dozen injection tests to the child semantics.
    const header = agent?.session?.header;
    const subagent = header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0;
    // A child session has no row of its own in the effort record — the switches are set on the parent — so
    // reading `flagsFor(sessionId)` for a child always answered "everything off". That made `superfast`
    // false inside every child, which selected SUBAGENT_GUARD instead of SUPERFAST_CHILD_NOTE: the child
    // was told to ignore fan-out entirely, which is exactly the delegation the Superfast tree is built
    // from. The switches are inherited from `parentSession` for that reason.
    // The id is used verbatim: the record is keyed `session-<uuid>` and `parentSession` carries the same
    // prefixed form. An earlier version stripped the prefix on the assumption that the rows were keyed
    // bare; that made every lookup miss and reproduced the original bug exactly.
    const parentId = typeof header?.parentSession === 'string' ? header.parentSession : '';
    const scope = subagent && parentId ? parentId : sessionId;
    const flags = { ...flagsFor(scope, sessionId), chinese: FORCE_CHINESE };
    // 人设与回复风格是叠加的两层：用户写的人设管身份，回复风格管表达方式。
    // 有人设时模板照常注入，只是前面多加一段两层分工的声明（`PERSONA_LAYERED`），
    // 让模型知道身份按人设、说话方式按这一段。
    const personaDeferential = personaTextOf(agent?.session) !== '';

    // The switches ride in their own parameter rather than inside `flags`: `active` below is built from
    // `Object.keys(flags)`, so an object-valued entry would make every session look armed forever and
    // `emptied` would never fire again.
    const text = policyText({ ...flags, subagent, injection: personaState.injection, personaDeferential });
    return text;
  };

  const reminderBySession = new Map();
  const hasContext = typeof ctx.systemPrompt?.context === 'function';
  const disposeInjector = hasContext ? ctx.systemPrompt.context({
    name: 'dsh-codex-ui:mode-policy',
    order: 620,
    interpolate: false,
    text: ({ agent } = {}) => {
      const sessionId = agent?.id;
      const text = resolve(sessionId, agent);
      if (!text || presetSilences(agent) || sessionId?.startsWith('session-cgflash-')) return text;
      const header = agent?.session?.header;
      const child = header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0;
      const scope = child && typeof header?.parentSession === 'string' ? header.parentSession : sessionId;
      const flags = effortFlags(scope);
      const mode = flags.superfast ? 'superfast' : flags.lightning ? 'lightning' : 'standard';
      const reminder = reminderBySession.get(sessionId);
      return injectionOn(personaState.injection, 'lightning') && reminder?.mode === mode
        ? `${text}\n\n${reminder.text}` : text;
    },
  }) : createPolicyInjector(ctx, resolve);
  // Official hosts read the current policy and short reminder through dynamic context only.
  // Legacy hosts retain message injection, with reminder provenance separate from the stable contract.
  const nudgedTurn = new Set();
  // Session and turn are both required: concurrent sessions reuse the same turn numbers.
  const turnTools = new Map();
  const turnKey = (sessionId, turn) => JSON.stringify([sessionId, turn]);
  const toolsFor = (sessionId, turn) => {
    const key = turnKey(sessionId, turn);
    if (!turnTools.has(key)) {
      turnTools.set(key, { calls: 0, dispatch: 0, firstStep: null, nextReview: null, earlyChecked: false });
      if (turnTools.size > 2048) turnTools.delete(turnTools.keys().next().value);
    }
    return turnTools.get(key);
  };
  const nudgeHandler = async (payload, next) => {
    const decision = typeof next === 'function' ? await next() : undefined;
    try {
      if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
      if (payload?.signal?.aborted) return decision;
      const sessionId = payload?.agent?.id;
      if (typeof sessionId !== 'string' || sessionId === '' || sessionId.startsWith('session-cgflash-')) return decision;
      if (presetSilences(payload?.agent)) return decision;
      // Same two scopes as the injector: the switches come from the conversation this session belongs to,
      // so a delegated child is nudged by the switches its parent carries rather than by a row that does
      // not exist. Keyed by the parent id here too, or the one-shot contract is the only copy a child gets.
      const header = payload?.agent?.session?.header;
      const parentId = typeof header?.parentSession === 'string' ? header.parentSession : '';
      const isChild = header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0;
      const scope = isChild && parentId ? parentId : sessionId;
      // The reminder is for the two orchestration modes and for nothing else. With both switches off this
      // session is not running a fan-out contract, so no reminder is injected — not a shortened one, not
      // the generic body. Read through the same revalidating reader the injector uses: a snapshot would
      // nag a session the user just disarmed and stay silent on one just armed.
      const row = currentEffort().sessions[scope];
      if (!injectionOn(personaState.injection, 'lightning') || (row?.lightning !== true && row?.superfast !== true)) {
        reminderBySession.delete(sessionId);
        return decision;
      }
      const turn = payload?.turn;
      if (!Number.isFinite(turn)) return decision;
      const step = Number.isFinite(payload?.step) ? payload.step : 1;
      if (row?.superfast === true) {
        // Superfast retains its once-per-turn reminder, including inherited child scopes.
        const key = turnKey(sessionId, turn);
        if (nudgedTurn.has(key)) return decision;
        nudgedTurn.add(key);
        if (nudgedTurn.size > 2048) nudgedTurn.delete(nudgedTurn.values().next().value);
      } else {
        const tools = toolsFor(sessionId, turn);
        if (tools.firstStep === null) {
          // Host step numbers are cumulative: measure from this turn's first observed step.
          tools.firstStep = step;
          tools.nextReview = step + 8;
        } else {
          let early = false;
          if (!tools.earlyChecked && step >= tools.firstStep + 2) {
            tools.earlyChecked = true;
            early = tools.dispatch === 0;
          }
          if (!early && step < tools.nextReview) return decision;
          // Dispatch attempts suppress only the early zero-dispatch reminder, never later reviews.
          tools.nextReview = step + 8;
        }
      }
      const mode = row?.superfast === true ? 'superfast' : 'lightning';
      const text = lightningNudge(turn, step, mode);
      if (hasContext) {
        // Replaced in place: context assembly sees the latest short state, never another user row.
        reminderBySession.set(sessionId, { mode, text });
        if (reminderBySession.size > 2048) reminderBySession.delete(reminderBySession.keys().next().value);
        return decision;
      }
      return {
        ...decision,
        messages: [...decision.messages, {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text }],
          source: { kind: NUDGE_KIND, form: 'instructions' },
        }],
      };
    } catch {
      // A reminder that fails must never fail the step itself.
      return decision;
    }
  };
  const offNudge = ctx.on('agent/pre-step', nudgeHandler);

  /**
   * The objective half of the Lightning contract.
   *
   * Why it exists: a text contract only binds the model's account of its own work. These counts come
   * from `tool/call` events the host commits, so "I settled it in one pass" is checked against what was
   * actually called. It never blocks a step or changes tool execution.
   *
   * Turn boundaries come from `turn/start`; tool names and JSON arguments from `tool/call`.
   */
  const fanoutTracker = (session, event) => {
    try {
      const sessionId = session?.header?.id ?? session?.id;
      const turn = event?.data?.turn;
      if (typeof sessionId !== 'string' || !Number.isFinite(turn)) return;
      if (event?.type === 'turn/start') {
        // A pre-step observation or replay may already have created this exact row.
        toolsFor(sessionId, turn);
        return;
      }
      if (event?.type !== 'tool/call') return;
      const row = toolsFor(sessionId, turn);
      row.calls += 1;
      if (isDispatchCall(event.data)) row.dispatch += 1;
    } catch { /* counting must never fail the event */ }
  };
  const offFanout = ctx.on('session/event', fanoutTracker);

  /**
   * One line per turn that did the work alone. `ctx.logger` is optional on some hosts, hence the
   * optional calls: a missing logger is silence, not a crash.
   */
  const offReport = ctx.on('agent/turn-stopping', payload => {
    try {
      const sessionId = payload?.agent?.id ?? payload?.agent?.session?.id ?? payload?.agent?.session?.header?.id;
      const turn = payload?.turn;
      if (typeof sessionId !== 'string' || !Number.isFinite(turn)) return;
      if (sessionId.startsWith('session-cgflash-') || presetSilences(payload?.agent)) return;
      const header = payload?.agent?.session?.header;
      const isChild = header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0;
      const scope = isChild && typeof header?.parentSession === 'string' ? header.parentSession : sessionId;
      const flags = currentEffort().sessions[scope];
      if (!injectionOn(personaState.injection, 'lightning') || (flags?.lightning !== true && flags?.superfast !== true)) return;
      const row = turnTools.get(turnKey(sessionId, turn));
      if (row === undefined || row.reported || row.calls < FANOUT_FLAG_THRESHOLD || row.dispatch > 0) return;
      row.reported = true;
      ctx.logger?.info?.(`[codex-ui] fan-out check: session ${sessionId} turn ${turn} spent ${row.calls} tool calls with 0 dispatch attempts — review independent remaining work under the active mode contract; simple tasks remain exempt.`);
    } catch { /* a report that fails must not fail the turn */ }
  });
  // `ctx.on` lifetime is already owned by the plugin fiber; this only covers an
  // explicit teardown, so an ignored return value would not leak anything.
  ctx.effect(() => () => {
    disposeInjector(); offNudge(); offFanout(); offReport();
    reminderBySession.clear(); nudgedTurn.clear(); turnTools.clear();
    personaWrites.catch(() => {}); effortWrites.catch(() => {});
  });
  /** Resolves once every queued write of either record has been attempted; used by tests. */
  const settled = () => Promise.all([personaWrites.catch(() => {}), effortWrites.catch(() => {})]);

  /**
   * The reply style writer, for both scopes. It never touches the effort record, so a reply-style
   * change cannot rewrite a switch it does not own.
   *
   * `sessionId === ''` is the "next session" scope: only `pendingPersona` moves. A real session id
   * writes that session's own row **and** the pending value, because the owner asked for one pick to
   * do both — switching inside a conversation must take effect immediately and also become the style
   * the next conversation opens with.
   */
  const patchPersona = (change, sessionId) => {
    if (change.persona !== undefined) {
      if (sessionId === '') {
        personaState.pendingPersona = change.persona;
        personaState.pendingAt = Date.now();
      } else {
        personaState.sessions[sessionId] = { persona: change.persona, at: Date.now() };
        // The global pick follows a per-session switch: one switch, both places.
        personaState.pendingPersona = change.persona;
        personaState.pendingAt = Date.now();
      }
    }
    queuePersonaWrite({ ...personaState.sessions });
    return sessionId === '' ? { pending: true, ...pendingFlags() } : { pending: true, ...flagsFor(sessionId, sessionId) };
  };

  /**
   * The effort record's writer is `patchEffort` above: `dsh-codex-ui-reasoning` writes the same file,
   * and this half keeps doing so, which is why every write is built from a fresh read and followed by
   * a reader commit. The route below dispatches the three switches through it.
   */

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
      // The injection-block switches are global, not per session, and they ride this route rather than
      // one of their own for the same reason the aliases above do: a dedicated route registered fine on
      // the Host and stayed unreachable from the client for the whole life of that feature.
      if (payload.action === 'injection') {
        // `blocks` is the list itself, never a second copy of it: a definition here would drift from the
        // one `policyText` reads. `switches` names every id, so the client never has to know that a
        // missing key means "on" — the file stores only the blocks that were switched off.
        const view = () => ({
          blocks: INJECTION_BLOCKS,
          switches: Object.fromEntries(INJECTION_BLOCKS.map(({ id }) => [id, injectionOn(personaState.injection, id)])),
        });
        // The bare action is a read; naming a block makes it a write.
        if (payload.id === undefined && payload.enabled === undefined) {
          return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: view() } });
        }
        if (typeof payload.id !== 'string' || !INJECTION_BLOCKS.some(({ id }) => id === payload.id)) return fail('turbo/invalid', '注入块参数无效。');
        if (typeof payload.enabled !== 'boolean') return fail('turbo/invalid', '注入块开关参数无效。');
        // 写显式布尔。原来是「开=删键、关=写 false」，那套只在「缺键即开」的时候成立：
        // 默认关的块被点开时删了键，`on()` 仍判它关，开关就成了点不亮的假开关。
        personaState.injection[payload.id] = payload.enabled === true;
        // The system-prompt section reads the published map, not this file, so it must see the change in
        // this same turn; `resolve` reads `personaState.injection` itself and needs no second call here.
        setInjection(personaState.injection);
        // `resolve` reads this map, so the very next step already carries the new value. The write joins
        // the same serial chain the other persona writes use, and it carries the switches along — without
        // that the next unrelated write would persist an empty set and turn every block back on.
        queuePersonaWrite();
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: view() } });
      }
      if (payload.action !== 'read' && payload.action !== 'update') return fail('turbo/invalid', '操作参数无效。');
      // The hero arms a persona before a session exists, so an empty id is the "next
      // session" scope: reads answer with that default and updates record it as pending.
      const pending = payload.sessionId === '';
      if (!pending && payload.action === 'read') return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...flagsFor(payload.sessionId, payload.sessionId), tokenMultiple: budget.value, tokenExact: budget.exact } } });
      const change = {};
      const effortChange = {};
      // The three effort switches are written here again, into `$DSH_HOME/storages/codex-ui-effort.json`
      // — the record `dsh-codex-ui-reasoning` also writes. The write is a whole-file rewrite built from a
      // read taken immediately before the mutation (`patchEffort` below), so the rows that plugin
      // recorded since this process started are carried over instead of being replaced by a snapshot.
      // Field-level dispatch over `EFFORT_FIELDS` is what keeps this route from writing a field the
      // record does not own; `persona` is the only other field here and has its own branch.
      for (const key of EFFORT_FIELDS) {
        if (payload[key] === undefined) continue;
        // The switches are per session: the hero's "next session" scope has no row to hold them.
        if (pending) return fail('turbo/invalid', `${EFFORT_LABELS[key]}开关需要会话。`);
        if (typeof payload[key] !== 'boolean') return fail('turbo/invalid', `${EFFORT_LABELS[key]}开关参数无效。`);
        effortChange[key] = payload[key];
      }
      if (payload.persona !== undefined) {
        // Three values, `none` included: the settings row offers 工作 / 聊天 / 无, and 无 means
        // "inject no style template" rather than "unset", so it must survive the write.
        if (!PERSONA_VALUES.includes(payload.persona)) return fail('turbo/invalid', '回复风格参数无效。');
        change.persona = payload.persona;
      }
      if (pending) {
        // The "next session" scope only ever carries the reply style: the three switches need a
        // session, so a request that named one here was already refused above.
        if (Object.keys(change).length) patchPersona(change, '');
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...pendingFlags(), pending: true, tokenMultiple: budget.value, tokenExact: budget.exact } } });
      }
      // A named session accepts the reply style too, which is the whole point of moving the style
      // control into the settings row: without this branch a running conversation could never change
      // its style, because only `pending` was writable.
      if (Object.keys(change).length === 0 && Object.keys(effortChange).length === 0) return fail('turbo/invalid', '没有需要更新的开关。');
      // The rows are mutated in place before either write is queued, so this response and the
      // injector's next step both read the new values back; the queued writes then persist them.
      if (Object.keys(effortChange).length) patchEffort(payload.sessionId, effortChange);
      if (Object.keys(change).length) patchPersona(change, payload.sessionId);
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...flagsFor(payload.sessionId, payload.sessionId), ...(change.persona !== undefined ? { pending: true } : {}), tokenMultiple: budget.value, tokenExact: budget.exact } } });
    },
  }));

  return { settled };
}
