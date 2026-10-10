import { apply as applyPromptModes } from '../src/prompt-modes.js';
import { registerBalance } from '../src/api-balance.js';
import { registerTurbo } from '../src/turbo.js';
import { registerSessionPurge } from '../src/session-purge.js';
import { registerModelIdentity } from '../src/model-identity.js';
import { writeIdentityStatus } from '../src/identity-status.js';
export { inject } from '../src/prompt-modes.js';
export async function apply(ctx) {
  // Records how far host activation got, so a 404 on a plugin route can be traced to a step.
  writeIdentityStatus({ applyEntered: true });
  await applyPromptModes(ctx);
  registerBalance(ctx);
  registerTurbo(ctx);
  registerSessionPurge(ctx);
  registerModelIdentity(ctx);
  writeIdentityStatus({ applyCompleted: true });
}
