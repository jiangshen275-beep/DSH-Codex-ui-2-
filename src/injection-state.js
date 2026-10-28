/**
 * The injection-block switches, as one process-wide value.
 *
 * Why a module of its own: the switches are read by two halves that never share a context. `turbo.js`
 * owns the state file and the endpoint that writes it, while `prompt-modes.js` owns the system-prompt
 * section the Codex switch governs — and `lib/index.js` activates `applyPromptModes` *before*
 * `registerTurbo`, so handing the value over as an argument would arrive too late. The section's `text()`
 * callback is invoked at assembly time on every turn instead, so a value published here reaches it
 * whatever the activation order was.
 *
 * The default is an empty map, which reads as every block on: a host where `registerTurbo` never ran, or
 * threw before publishing, keeps exactly the text it produced before these switches existed.
 */

let injected = {};

/** Publish the switches `readState` produced, or the ones the endpoint just wrote. */
export function setInjection(next) {
  injected = next !== null && typeof next === 'object' && !Array.isArray(next) ? next : {};
}

/** The switches currently in force. Never null: `{}` means every block is on. */
export function getInjection() {
  return injected;
}

/**
 * 某个注入块是不是开着。
 *
 * 缺键即开。「想完再答」过去是唯一例外，实测后翻转：模型不往 reasoning 通道写东西时，
 * 「边想边写」等于让它把过程打进正文。
 * 与 `turbo-policy.js` 的 `on()`、`injection-ui.js` 的 `injectionEnabled()` 保持同一条规则。
 */
const DEFAULT_OFF = new Set();

export function isBlockOn(id) {
  const value = injected[id];
  if (value === false) return false;
  if (value === true) return true;
  return !DEFAULT_OFF.has(id);
}
