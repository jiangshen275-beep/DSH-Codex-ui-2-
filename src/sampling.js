/**
 * Persona sampling parameters, host side: the one place that turns "what the persona file says" into
 * "what the request carries", and the one place that decides what must not be carried.
 *
 * The host offers two carriers, and between them all three keys are covered:
 *   · `agent/request` is a waterfall over the request config. `temperature` and `maxTokens` are
 *     first-class config fields there, and this is also the config the session header records, which
 *     is why a parameter that is no longer set has to be removed rather than overwritten.
 *   · `top_p` has no host field. The adapter's base body is built from `model`, `stream`, `messages`,
 *     `max_tokens`, `thinking`, `output_config`, `system`, `temperature`, `stop_sequences` and
 *     `tools` — and nothing else — so `top_p` can only reach the wire through the DeepSeek request
 *     extension registry, which appends one owned top-level field per registered name.
 */
import { paramsFor } from './personas.js';
import { MODE_KEY } from './prompt-modes.js';

const LOG = '[dsh-codex-ui]';
/** The mode both the projection and `prompt-modes.js` fall back to; the native prompt. */
const DEFAULT_MODE = 'Codex';
/** The durable unit whose `sessions` table holds the chosen persona id per session. */
const MODE_UNIT = 'chatgpt_ui_modes';
/** The single extension field this plugin owns. */
const TOP_P_FIELD = 'top_p';
/**
 * Persona key → request config field. The names differ: the config is camelCase (`maxTokens`), the
 * frontmatter is snake_case (`max_tokens`), and writing the snake_case name here would be ignored.
 */
const REQUEST_FIELDS = { temperature: 'temperature', max_tokens: 'maxTokens' };

/**
 * What this plugin last wrote into each session's config, keyed by session id.
 *
 * The session header keeps whatever the previous request carried, so a persona whose parameter was
 * removed would otherwise keep sending the old number on every later turn. Deleting unconditionally
 * is not the answer either: a `maxTokens` the user set on the agent itself lives in the same field,
 * and this plugin did not put it there. Remembering our own writes is what separates the two cases.
 * A plugin restart forgets the map, which costs at most one request still carrying a stale value.
 */
const injected = new Map();

/** The live storage handle for the mode unit, or null when it cannot be had. */
function modeUnit(ctx) {
  // Why not open the unit: a storage unit allows exactly one live handle, and `prompt-modes.js`
  // already holds this one — a second open is rejected outright. Its `open` table is the only route
  // to the same records without breaking that rule. Best-effort by design: an unreadable handle
  // leaves request assembly untouched.
  try {
    return ctx.storage?.backend?.get?.('json')?.open?.get?.(MODE_UNIT) ?? null;
  } catch {
    return null;
  }
}

/** The live session object for an id, or null. Used only for the legacy projection read. */
function sessionOf(ctx, sessionId) {
  if (sessionId.length === 0) return null;
  try {
    return ctx.sessions?.get?.(sessionId) ?? null;
  } catch {
    return null;
  }
}

/**
 * The persona one session currently resolves to, plus whether that could be determined at all.
 *
 * The durable record is authoritative — selecting a mode writes it and nothing else — so it is read
 * first; the older projection event is the pre-KV path and is kept for sessions that only ever chose
 * that way. `ok: false` means "could not tell", which callers must treat as "do not touch the
 * request": assuming the default persona would silently delete a limit the user set on the agent.
 */
async function personaIdFor(ctx, sessionId) {
  const unit = modeUnit(ctx);
  if (unit === null) return { ok: false };
  if (sessionId.length > 0) {
    try {
      // `loadAll` re-reads the unit's directory on purpose: the file tree is the authoritative state,
      // and a switch has to be visible on the very next request. One directory read per model step
      // is several orders of magnitude cheaper than the request it precedes.
      const stored = (await unit.loadAll())?.tables?.sessions?.[sessionId];
      if (typeof stored === 'string' && stored.length > 0) return { mode: stored, ok: true };
    } catch (error) {
      console.warn(`${LOG} prompt mode record unreadable: ${String(error)}`);
      return { ok: false };
    }
  }
  const session = sessionOf(ctx, sessionId);
  if (session !== null) {
    try {
      const projected = ctx.sessionProjections?.stateOf?.(session, MODE_KEY);
      if (typeof projected === 'string' && projected.length > 0) return { mode: projected, ok: true };
    } catch (error) {
      console.warn(`${LOG} prompt mode projection unreadable: ${String(error)}`);
    }
  }
  // A session that never chose anything resolves to the same default the prompt section uses.
  return sessionId.length > 0 ? { mode: DEFAULT_MODE, ok: true } : { ok: false };
}

/** The sampling parameters the session's persona asks for, or `ok: false` when unknown. */
async function samplingFor(ctx, sessionId) {
  try {
    const { mode, ok } = await personaIdFor(ctx, sessionId);
    return ok ? { ok: true, params: paramsFor(mode) } : { ok: false, params: {} };
  } catch (error) {
    console.warn(`${LOG} persona sampling unavailable: ${String(error)}`);
    return { ok: false, params: {} };
  }
}

/**
 * Write one persona's sampling parameters onto a request config copy.
 *
 * A key the persona sets is written; a key it does not set is deleted only when this plugin wrote it
 * on an earlier turn. Deletion, not `undefined`: the adapter skips an absent key and would also skip
 * an `undefined` one, but the config is recorded in the session header, where an explicit
 * `undefined` is not the same thing as a key that was never there.
 */
function applyRequestSampling(config, sessionId, params) {
  const previous = injected.get(sessionId) ?? {};
  const recorded = {};
  for (const [key, field] of Object.entries(REQUEST_FIELDS)) {
    if (Object.hasOwn(params, key)) {
      config[field] = params[key];
      recorded[key] = params[key];
      continue;
    }
    if (Object.hasOwn(previous, key)) delete config[field];
  }
  if (Object.keys(recorded).length === 0) injected.delete(sessionId);
  else injected.set(sessionId, recorded);
}

/**
 * The `agent/request` listener: the outermost link of the chain, so its result is the final config.
 *
 * Why the spread: the host freezes the config before handing it over, so a strict-mode assignment
 * onto it throws, and the object coming out of `next()` carries `provider` and `model` — dropping
 * those keys makes the loop throw "has no provider/model". A fresh object keeps both, and mutating
 * the copy is safe.
 */
async function onAgentRequest(ctx, payload, next) {
  const config = { ...(await next()) };
  try {
    const sessionId = typeof payload?.agent?.id === 'string' ? payload.agent.id : '';
    if (sessionId.length === 0) return config;
    const { ok, params } = await samplingFor(ctx, sessionId);
    if (!ok) return config;
    applyRequestSampling(config, sessionId, params);
  } catch (error) {
    // A sampling failure costs the parameters, never the request.
    console.warn(`${LOG} persona sampling skipped for this request: ${String(error)}`);
  }
  return config;
}

/**
 * The `top_p` extension provider, run once per request before the HTTP call.
 *
 * `prepare` receives the serialized base body plus the request identity (`sessionId`, `purpose`,
 * `signal`); returning `undefined` contributes no field at all.
 *
 * Why the title request is excluded by `purpose` and not by `body.thinking.type`: the host forces
 * the title request's effort to `off`, so its thinking type is `disabled` — but a reply of the
 * user's own is equally `disabled` when they turned reasoning off, and that one *should* honour
 * their `top_p`. Keying on `thinking` would drop the setting from exactly the replies most likely to
 * want it. Only `top_p` is registered: registering `temperature` would collide with the base body's
 * own key, which the adapter rejects as `REQUEST_EXTENSION` before the request is sent.
 */
function topPPrepare(ctx) {
  return async function prepare(request) {
    const { sessionId, purpose } = request ?? {};
    if (purpose === 'session-title') return undefined;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
    const { ok, params } = await samplingFor(ctx, sessionId);
    if (!ok || !Object.hasOwn(params, 'top_p')) return undefined;
    return { value: params.top_p };
  };
}

/**
 * Register both carriers. Every step is contained: this apply also carries balance, turbo, session
 * purge and model identity, so one throw here would take four unrelated features down with it.
 */
export async function registerSampling(ctx) {
  try {
    ctx.on('agent/request', (payload, next) => onAgentRequest(ctx, payload, next));
  } catch (error) {
    console.warn(`${LOG} sampling listener not registered: ${String(error)}`);
  }
  try {
    // A soft dependency: a host that never loads the extension registry simply has no `top_p`,
    // while `temperature` and `max_tokens` above keep working through `agent/request`.
    ctx.inject?.(['deepseekLlmApiExtensions'], scope => {
      try {
        scope.deepseekLlmApiExtensions.register(TOP_P_FIELD, { prepare: topPPrepare(ctx) });
      } catch (error) {
        console.warn(`${LOG} top_p request extension not registered: ${String(error)}`);
      }
    });
  } catch (error) {
    console.warn(`${LOG} top_p request extension unavailable: ${String(error)}`);
  }
}
