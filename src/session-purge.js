// Host half of the sidebar's "delete an archived Session" action.
//
// Why a host half at all: DSH has no deletion seam. The persistence contract states it
// plainly ("Nothing deletes session files — logs accumulate under root until removed
// externally; the seam has no deletion API"), no Remote route removes a Session, and the
// only archive-adjacent API hides a Session from grouping surfaces. This endpoint is that
// external removal, made narrow enough to be safe:
//
//   · the Session must be archived — archiving is the user's own "I am done with this"
//     signal, and DSH gates an archived Session's steps (ArchivedSessionGate), so its log
//     is not being appended to;
//   · the id must be a plain Session id — no separator, no `..`, nothing that could name
//     a directory outside `$DSH_HOME/sessions`;
//   · the directory must actually hold a Session log, so a stray id can never remove an
//     unrelated directory.
import { lstatSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const PURGE_EVENT = 'dsh-codex-ui/purge-session';
export const PURGE_PATH = '/api/dsh-codex-ui/purge-session';
/** Session ids are `session-<uuid>` or a bare `<uuid>`; this is what may reach a path join. No
 *  separator, no leading dot, and no `..` run — nothing that could name another directory. */
const SESSION_ID = /^(?!.*\.\.)[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/;
/** Only a real Session log directory is ever removed. */
const LOG_FILE = 'session.v4.jsonl.zstd';

function homeRoot() {
  const home = process.env.DSH_HOME;
  return typeof home === 'string' && home.length > 0 ? home : null;
}

/**
 * A plain directory, never a link. `rmSync(recursive)` follows a Windows junction or a symlink and
 * would delete whatever it points at, so every path this module removes has to pass this first.
 */
function realDirectory(path) {
  try {
    const stats = lstatSync(path);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Drop the registry entries and the projection-cache row that pointed at the removed log.
 * Best-effort on purpose: a stale id is already skipped by every list surface (`sessions[id]` is
 * checked before a row renders), so cleanup must never turn a successful removal into a failure.
 * @returns the names of the places that were cleaned, for the response and for tests.
 */
function forgetSession(root, sessionId) {
  const cleaned = [];
  try {
    const file = join(root, 'storages', 'workspace.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    let changed = false;
    for (const key of ['archivedSessionIds', 'pinnedSessionIds']) {
      const list = parsed?.global?.[key];
      if (!Array.isArray(list) || !list.includes(sessionId)) continue;
      parsed.global[key] = list.filter(id => id !== sessionId);
      cleaned.push(key);
      changed = true;
    }
    if (changed) {
      // Read-modify-write with a rename, so a reader never sees a half-written registry.
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
      renameSync(temp, file);
    }
  } catch { /* an unreadable registry keeps its stale id; the row still renders from the log */ }
  try {
    const cache = join(root, 'storages', 'session_projcache', 'sessions', `${sessionId}.json`);
    if (lstatSync(cache).isFile()) {
      unlinkSync(cache);
      cleaned.push('session_projcache');
    }
  } catch { /* no cached projection, or it is not a file: nothing to forget */ }
  return cleaned;
}

/** The registry-global archive set, read from the same file the sidebar's list comes from. */
function archivedIds(root) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(root, 'storages', 'workspace.json'), 'utf8'));
  } catch {
    throw new Error('归档列表不可读');
  }
  const ids = parsed?.global?.archivedSessionIds;
  if (!Array.isArray(ids)) throw new Error('归档列表不可读');
  return ids.map(String);
}

/**
 * Remove one archived Session's log directory, or — when its log is already gone — just the
 * registry entry that still lists it.
 * @param options - the DSH home to search and the Session id to remove.
 * @returns the directory that was removed (null when there was none left), and what index entries
 *          were forgotten with it.
 * @throws when the id is malformed or the Session is not archived.
 */
export function purgeArchivedSession({ root, sessionId }) {
  if (typeof root !== 'string' || root.length === 0) throw new Error('DSH_HOME 不可用');
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw new Error('会话 id 无效');
  if (!archivedIds(root).includes(sessionId)) throw new Error('只能删除已归档的会话');
  const sessions = resolve(join(root, 'sessions'));
  let projects;
  try {
    projects = readdirSync(sessions, { withFileTypes: true });
  } catch {
    throw new Error('找不到会话目录');
  }
  for (const project of projects) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue;
    const dir = join(sessions, project.name, sessionId);
    // Fail closed on anything that leaves the store: the id regex already forbids separators, so
    // this only ever fires on a name the filesystem resolved elsewhere.
    if (!resolve(dir).startsWith(sessions + sep)) throw new Error('路径越界，已拒绝删除');
    if (!realDirectory(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // this project does not hold that Session
    }
    if (!entries.includes(LOG_FILE)) continue;
    rmSync(dir, { recursive: true, force: true });
    return { sessionId, removed: dir, cleaned: forgetSession(root, sessionId) };
  }
  // No log directory holds it: the Session is already gone, so the registry entry that keeps it on
  // the archive list is the only thing left to remove. Succeeding here is what lets such an id leave
  // the list, instead of failing with "找不到该会话的日志目录" on every attempt.
  return { sessionId, removed: null, cleaned: forgetSession(root, sessionId) };
}

/**
 * The `dsh-codex-ui/purge-session` endpoint, registered the same way the turbo route is:
 * a soft `connection` dependency, so a host without a carrier simply has no delete button.
 */
export function registerSessionPurge(ctx) {
  ctx.inject?.(['connection'], scope => scope.connection.fetch.register({
    path: PURGE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try {
        envelope = await request.json();
      } catch {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
      }
      const payload = envelope?.type === 'client-request' && envelope.method === PURGE_EVENT ? envelope.payload : null;
      // `details` is not decoration: the connection client's `parseConnectionResponse` requires
      // `isRecord(error.details)` and throws "connection: invalid server-response failure" when it is
      // missing — which is exactly what a refusal looked like in 2.1.0, swallowing the real reason.
      const fail = (code, message) => Response.json({ type: 'server-response', rpcId: envelope?.rpcId, result: { ok: false, error: { code, message, details: {} } } });
      if (!payload || typeof payload.sessionId !== 'string') return fail('purge/invalid', '会话参数无效。');
      try {
        const value = purgeArchivedSession({ root: homeRoot(), sessionId: payload.sessionId });
        try { ctx.logger?.info?.(`[dsh-codex-ui] purged archived Session ${payload.sessionId}: ${value.removed === null ? 'log already gone, registry entry removed' : `removed ${value.removed}`}`); } catch { /* logging must not fail the removal */ }
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value } });
      } catch (error) {
        return fail('purge/refused', error?.message || String(error));
      }
    },
  }));
}
