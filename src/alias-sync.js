/**
 * Client half of the model-name sync: a tiny publish hook, so the model UI can announce the alias map
 * without knowing anything about the transport.
 *
 * Wired once from the plugin's apply, where the Connection carrier is in scope. Every alias write
 * publishes; the Host keeps the map and the prompt section reads it.
 */
export const ALIASES_KEY = 'dsh-codex-ui/model-aliases';

let sender = null;
// The catalog names the UI itself prints (provider/model -> name). Without them the prompt section
// knew only about names typed in the rename box, so a model whose name comes from the catalog
// ("GPT-6 Astra") produced no section at all.
let catalogNames = {};

/** The stored map, read defensively: a broken entry must not take the model UI down. */
export function readAliases() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ALIASES_KEY) ?? '{}');
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Called from apply with a function that ships the maps to the Host. Publishes whatever is known. */
export function wireAliasSender(send) {
  sender = typeof send === 'function' ? send : null;
  publishAliases();
}

/** The catalog the model menu is displaying, so the Host can name a model the owner never renamed. */
export function publishCatalogNames(groups) {
  const next = {};
  for (const group of Array.isArray(groups) ? groups : []) {
    if (typeof group?.id !== 'string') continue;
    for (const model of Array.isArray(group.models) ? group.models : []) {
      if (typeof model?.id !== 'string') continue;
      const name = typeof model.name === 'string' ? model.name.trim() : '';
      if (name === '') continue;
      next[`${group.id}/${model.id}`] = name;
    }
  }
  // Published even when the catalog is still empty: the owner's names travel either way, and this is
  // the call that creates the Host's record. (An earlier version returned early on an unchanged empty
  // catalog, so an untouched model list meant nothing was ever pushed.)
  const changed = JSON.stringify(next) !== JSON.stringify(catalogNames);
  catalogNames = next;
  if (changed || Object.keys(readAliases()).length > 0) publishAliases();
}

let retryTimer = null;
let attempts = 0;
let acknowledged = false;

/**
 * Ship the maps, and keep trying until the Host answers.
 *
 * Two holes made the earlier version silently do nothing: `ctx.connection.rpc` may not exist yet when
 * `apply` runs (activation happens before the carrier is usable), and a call that returned `undefined`
 * was counted as success — so the single attempt "succeeded" by doing nothing at all. Now a missing or
 * non-promise result is a failure, a response reporting `ok: false` is a failure, and the retry loop
 * has a real budget instead of one frame.
 */
export function publishAliases({ heartbeat = false } = {}) {
  if (sender === null) return;
  // Every call sends. An earlier version returned early once the Host had acknowledged, which meant the
  // first successful sync was also the last: renaming a second model never reached the Host, so switching
  // to it could not name it. `acknowledged` now only means "stop retrying and stop the heartbeat".
  setPhase('pending');
  const payload = { aliases: readAliases(), names: catalogNames };
  const retry = (reason) => {
    if (typeof reason === 'string' && reason !== '') lastReason = reason;
    // The fast loop is bounded, but giving up entirely is what left the Host with nothing: on a slow
    // start `ctx.connection.rpc` was not usable for longer than the whole budget. A slow heartbeat then
    // keeps trying for as long as the page lives, and any later publish (opening the model menu, a
    // rename) is another chance.
    if (attempts >= 12 || typeof setTimeout !== 'function') {
      setPhase('failed');
      startHeartbeat();
      return;
    }
    attempts += 1;
    if (retryTimer !== null) clearTimeout(retryTimer);
    notify();
    retryTimer = setTimeout(() => { retryTimer = null; publishAliases(); }, Math.min(20000, 2000 * attempts));
  };
  const settle = value => {
    if (value === undefined || value === null) { retry('宿主返回空'); return; }
    if (value?.ok === false) { retry(value?.error?.message || value?.error?.code || '宿主拒绝'); return; }
    acknowledged = true;
    attempts = 0;
    lastReason = '';
    stopHeartbeat();
    // The Host reports whether the prompt section registered, which is the half that decides whether the
    // name can reach the model at all.
    section = value?.value?.identity?.section?.ok ?? null;
    sectionError = value?.value?.identity?.section?.error ?? '';
    setPhase('ok', typeof value?.value?.count === 'number' ? value.value.count : Object.keys(payload.aliases).length + Object.keys(payload.names).length);
  };
  let result;
  try {
    result = sender(payload);
  } catch (problem) {
    retry(problem?.message || '发送抛错');
    return;
  }
  if (result !== null && typeof result?.then === 'function') result.then(settle, problem => retry(problem?.message || '连接未就绪'));
  else settle(result);
}

// --- Sync state, so the UI can show the truth instead of me guessing -----------------------------
// The failure mode of this feature was always invisible: the client pushed into nothing and nobody
// could tell. This is the smallest observable state that makes that impossible.
//
// The snapshot is cached and only replaced when something actually changes. Returning a fresh object
// from the getter is an infinite-render bug with `useSyncExternalStore`: React compares by identity, so
// a new object every call means "changed" every call. That bug is what took the model panel — the
// effort slider and the rename control with it — off the screen for one release.
const listeners = new Set();
let phase = 'idle';   // idle | pending | ok | failed
let lastCount = 0;
let lastReason = '';
let section = null;
let sectionError = '';
let snapshot = { phase, count: lastCount, attempts: 0, reason: lastReason, section, sectionError };

function notify() {
  snapshot = { phase, count: lastCount, attempts, reason: lastReason, section, sectionError };
  for (const listener of [...listeners]) { try { listener(); } catch { /* a listener must not break the sync */ } }
}

function setPhase(next, count) {
  if (phase === next && (count === undefined || count === lastCount)) return;
  phase = next;
  if (typeof count === 'number') lastCount = count;
  notify();
}

export function subscribeSyncState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable between changes, which `useSyncExternalStore` requires. */
export function syncState() {
  return snapshot;
}

// --- Slow heartbeat ------------------------------------------------------------------------------
// A client that gives up is a client that never arrives. Until the Host acknowledges, one tiny call
// every 30 seconds keeps the attempt alive for the whole life of the page.
let heartbeatTimer = null;

function startHeartbeat() {
  if (heartbeatTimer !== null || typeof setInterval !== 'function') return;
  heartbeatTimer = setInterval(() => {
    if (acknowledged) { stopHeartbeat(); return; }
    attempts = 0;
    publishAliases();
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatTimer === null || typeof clearInterval !== 'function') { heartbeatTimer = null; return; }
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}