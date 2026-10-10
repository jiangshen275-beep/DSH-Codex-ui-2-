import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * A status file, so host-side activation can be observed without a route.
 *
 * The model-name feature failed for eight releases with no evidence: its own route returned 404, and the
 * only diagnostics travelled *through* that route. This writes each step of activation to disk instead,
 * which anyone — including the next session of me — can read after a restart.
 *
 * Best effort by design: a status file must never be the reason activation fails.
 */
export function identityStatusFile(home) {
  const root = typeof home === 'string' && home !== '' ? home : process.env.DSH_HOME ?? '.';
  return join(root, 'dsh-codex-ui-identity-status.json');
}

export function writeIdentityStatus(patch) {
  try {
    const file = identityStatusFile(process.env.DSH_HOME);
    let current = {};
    try { current = JSON.parse(readFileSync(file, 'utf8')); } catch { current = {}; }
    const next = { ...current, ...patch, at: new Date().toISOString() };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
    return next;
  } catch {
    return null;
  }
}
