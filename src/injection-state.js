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

/** True unless the block was explicitly switched off — an absent key means on. */
export function isBlockOn(id) {
  return injected[id] !== false;
}
