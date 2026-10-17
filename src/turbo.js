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
// Injection follows the engine's own discipline (the built-in @pluginId context
// injector does the same three things):
//   · call `next()` first and append to whatever the framework decided;
//   · filter by exact `agent.id` — children inherit the parent scope, so a
//     scope-registered listener would leak the policy into every subagent;
//   · inject only when the resolved text changed, because every injected message
//     is persisted as a `user/message` on each step it is appended to.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { policyText, lightningNudge, OFF_NOTICE, tokenMultiplier, presetSilences, INJECTION_BLOCKS } from './turbo-policy.js';
import { setAliases, identityHealth, writeAliasesToDisk } from './model-identity.js';
import { setInjection } from './injection-state.js';

export const TURBO_EVENT = 'dsh-codex-ui/turbo';
export const TURBO_PATH = '/api/dsh-codex-ui/turbo';

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
/** The single file both records used to share. Read once, split, then retired — never deleted. */
const LEGACY_FILE = 'codex-ui-turbo.json';

/** Tools that count as delegation: they start or continue a child, or hand work to one. */
const DISPATCH_TOOLS = new Set(['subagent', 'subagent_fork', 'send_message']);
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
    // `persona` is stamped once, on the first turn of the session that started after the hero last
    // picked a tab; absent means "this session never chose one", not "it chose the default".
    const persona = value.persona === 'chat' || value.persona === 'work' ? value.persona : '';
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
      if (typeof id === 'string' && value === false && INJECTION_BLOCKS.some(block => block.id === id)) injection[id] = false;
    }
  }
  const pending = parsed?.pendingPersona;
  return {
    sessions: clean,
    pendingPersona: pending === 'chat' || pending === 'work' ? pending : '',
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
    // Written last and only as `false` entries, so the file stays readable and a hand-edit that
    // deletes a key restores that block rather than disabling it.
    injection: Object.fromEntries(Object.entries(state.injection ?? {}).filter(([, value]) => value === false)),
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
  /** sessionId -> the parts of the block currently injected there (drives the off-notice). */
  const armedBySession = new Map();
  // Two records, two chains: a slow persona write must not hold up a switch write, and neither may
  // interleave two whole-file rewrites of the same file.
  let personaWrites = Promise.resolve();
  let effortWrites = Promise.resolve();

  // The hero's tab pick travels with the conversation that starts next: it is stamped onto
  // a session at that session's own first step, and the session keeps it from then on. A
  // conversation whose first step has already happened is never touched, so picking a tab
  // cannot reach back into a session that is already running — and a session that started
  // before the pick still gets the style in force when it opens, never nothing at all.
  const pendingPersona = () => (personaState.pendingPersona === 'chat' ? 'chat' : 'work');

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

  /** Stamp the pick onto a session at its first step; return the persona that session owns. */
  const personaFor = (sessionId, position) => {
    const stored = personaState.sessions[sessionId]?.persona;
    if (stored === 'chat' || stored === 'work') return stored;
    // "First step" is the session's first turn, whatever step number it reports: a resumed
    // or retried opening turn must still get the style rather than none.
    const firstTurn = position?.turn === 1;
    if (!firstTurn) return '';
    const persona = pendingPersona();
    const row = personaState.sessions[sessionId] ?? { at: 0 };
    personaState.sessions[sessionId] = { ...row, persona, at: Date.now() };
    queuePersonaWrite({ ...personaState.sessions });
    return persona;
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
  const flagsFor = (sessionId, position) => ({
    persona: personaFor(sessionId, position),
    ...effortFlags(sessionId),
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
    return { ...flagsFor(sessionId), tokenMultiple: budget.value, tokenExact: budget.exact };
  };

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
    const armed = armedBySession.get(sessionId) ?? new Set();
    // `origin` alone is only a navigation classification, so the delegation depth is checked alongside it.
    // Unknowable (no header) means NOT a child: every fixture in the tests has no header, and defaulting the
    // other way would flip a dozen injection tests to the child semantics.
    const header = agent?.session?.header;
    const subagent = header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0;
    // The switches ride in their own parameter rather than inside `flags`: `active` below is built from
    // `Object.keys(flags)`, so an object-valued entry would make every session look armed forever and
    // `emptied` would never fire again.
    const text = policyText({ ...flags, subagent, injection: personaState.injection });
    const active = new Set(Object.keys(flags).filter(key => flags[key] && flags[key] !== false));
    // A session with no persona and no switches carries nothing; if it previously carried a
    // contract, tell it once that the contract is gone.
    const emptied = armed.size > 0 && active.size === 0;
    armedBySession.set(sessionId, active);
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
      // `superfast` implies the tree contract, so either switch arms the reminder. Read through the same
      // revalidating reader the injector uses: a snapshot would nag a session the user just disarmed and
      // stay silent on one just armed — the switch and the reminder would disagree within one step.
      const row = currentEffort().sessions[sessionId];
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

  /**
   * The objective half of the Lightning contract.
   *
   * Why it exists: a text contract only binds the model's account of its own work. These counts come
   * from `tool/call` events the host commits, so "I settled it in one pass" is checked against what was
   * actually called. It never blocks a step, never rewrites state, and writes exactly one log line.
   *
   * Turn boundaries come from `turn/start`; tool names from `tool/call`. Both are durable events.
   */
  const turnTools = new Map();
  const fanoutTracker = (session, event) => {
    try {
      if (session?.header?.id === undefined) return;
      if (event?.type === 'turn/start') {
        turnTools.set(event.data.turn, { calls: 0, dispatch: 0 });
        if (turnTools.size > 64) turnTools.delete([...turnTools.keys()][0]);
        return;
      }
      if (event?.type !== 'tool/call') return;
      const row = turnTools.get(event.data?.turn);
      if (row === undefined) return;
      row.calls += 1;
      if (DISPATCH_TOOLS.has(event.data?.name)) row.dispatch += 1;
    } catch { /* counting must never fail the event */ }
  };
  const offFanout = ctx.on('session/event', fanoutTracker);

  /**
   * One line per turn that did the work alone. `ctx.logger` is optional on some hosts, hence the
   * optional calls: a missing logger is silence, not a crash.
   */
  const offReport = ctx.on('agent/turn-stopping', payload => {
    try {
      const sessionId = payload?.agent?.session?.id;
      const row = [...turnTools.values()].at(-1);
      if (sessionId === undefined || row === undefined) return;
      if (row.calls < FANOUT_FLAG_THRESHOLD || row.dispatch > 0) return;
      ctx.logger?.info?.(`[codex-ui] fan-out check: this turn spent ${row.calls} tool calls with 0 dispatches — the answer must name a false condition (a)-(d) in clause 1 of the Lightning contract.`);
    } catch { /* a report that fails must not fail the turn */ }
  });
  // `ctx.on` lifetime is already owned by the plugin fiber; this only covers an
  // explicit teardown, so an ignored return value would not leak anything.
  ctx.effect(() => () => { disposeInjector(); offNudge(); offFanout(); offReport(); personaWrites.catch(() => {}); effortWrites.catch(() => {}); });
  /** Resolves once every queued write of either record has been attempted; used by tests. */
  const settled = () => Promise.all([personaWrites.catch(() => {}), effortWrites.catch(() => {})]);

  /**
   * The persona record's only writer: the hero's next-conversation pick. It never touches the effort
   * record, so a reply-style change cannot rewrite a switch it does not own.
   */
  const patchPersona = change => {
    // `pendingPersona` + `pendingAt` are the hero's pick for the next conversation.
    if (change.persona !== undefined) {
      personaState.pendingPersona = change.persona;
      // The stamp is what limits the pick to the conversation that starts next.
      personaState.pendingAt = Date.now();
    }
    queuePersonaWrite({ ...personaState.sessions });
    return { pending: true, ...pendingFlags() };
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
          switches: Object.fromEntries(INJECTION_BLOCKS.map(({ id }) => [id, personaState.injection[id] !== false])),
        });
        // The bare action is a read; naming a block makes it a write.
        if (payload.id === undefined && payload.enabled === undefined) {
          return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: view() } });
        }
        if (typeof payload.id !== 'string' || !INJECTION_BLOCKS.some(({ id }) => id === payload.id)) return fail('turbo/invalid', '注入块参数无效。');
        if (typeof payload.enabled !== 'boolean') return fail('turbo/invalid', '注入块开关参数无效。');
        // Off is a stored `false`, on is an absent key: the in-memory map then holds exactly what
        // `readPersonaState` would read back, and `writePersonaState` writes nothing else.
        if (payload.enabled) delete personaState.injection[payload.id];
        else personaState.injection[payload.id] = false;
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
      if (!pending && payload.action === 'read') return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...flagsFor(payload.sessionId), tokenMultiple: budget.value, tokenExact: budget.exact } } });
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
        if (payload.persona !== 'chat' && payload.persona !== 'work') return fail('turbo/invalid', '回复风格参数无效。');
        // Persona is global, so it is only accepted for the hero's "next session" scope.
        if (!pending) return fail('turbo/invalid', '回复风格是全局设置，不接受按会话写入。');
        change.persona = payload.persona;
        change.pending = true;
      }
      if (pending) {
        // The "next session" scope only ever carries the reply style: the three switches need a
        // session, so a request that named one here was already refused above.
        if (Object.keys(change).length) patchPersona(change);
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { ...pendingFlags(), pending: true, tokenMultiple: budget.value, tokenExact: budget.exact } } });
      }
      // The reply style is global, so the persona branch above already refused it on this scope; a
      // named session that reaches this line named no field this route owns.
      if (Object.keys(effortChange).length === 0) return fail('turbo/invalid', '没有需要更新的开关。');
      // The row is mutated in place before the write is queued, so this response and the injector's next
      // step both read the switch back; the queued write then commits the reader once the bytes land.
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: patchEffort(payload.sessionId, effortChange) } });
    },
  }));

  return { settled };
}
