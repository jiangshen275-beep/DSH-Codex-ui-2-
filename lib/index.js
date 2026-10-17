import { apply as applyPromptModes } from '../src/prompt-modes.js';
import { registerPersonaNotice } from '../src/persona-notice.js';
import { registerBalance } from '../src/api-balance.js';
import { registerTurbo } from '../src/turbo.js';
import { registerSessionPurge } from '../src/session-purge.js';
import { registerModelIdentity } from '../src/model-identity.js';
import { writeIdentityStatus } from '../src/identity-status.js';
import { registerSampling } from '../src/sampling.js';
export { inject } from '../src/prompt-modes.js';
export async function apply(ctx) {
  // Records how far host activation got, so a 404 on a plugin route can be traced to a step.
  writeIdentityStatus({ applyEntered: true });
  // Contained like the rest: this line registers the routes the whole left-corner menu depends on, and
  // an exception here used to take balance, turbo, purge and identity with it — every one of them is
  // registered after this point. One broken feature is a bug; five broken features because one threw
  // is a dead plugin.
  try {
    await applyPromptModes(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] reply modes unavailable: ${String(error)}`);
  }
  // After the modes plugin, because it reads the persona that plugin resolves, and contained like
  // everything else here: a notice that cannot be built must not cost balance, turbo, purge or
  // identity.
  try {
    registerPersonaNotice(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] persona-switch notice unavailable: ${String(error)}`);
  }
  // After the modes plugin, because the sampling listener reads the persona record that plugin owns.
  // Contained on its own: a sampling failure must not cost balance, turbo, purge or identity.
  try {
    await registerSampling(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] persona sampling unavailable: ${String(error)}`);
  }
  registerBalance(ctx);
  // Contained like the reply modes and the sampling listener above, and for the same reason: the
  // effort half of this route is the part that will move to its own plugin, and a host that cannot
  // load it must cost the switches alone — not balance, purge, identity and the prompt section.
  try {
    registerTurbo(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] turbo switches unavailable: ${String(error)}`);
  }
  registerSessionPurge(ctx);
  registerModelIdentity(ctx);
  writeIdentityStatus({ applyCompleted: true });
}
