// Host half of the archived-list titles.
//
// Why it exists: an archived Session is not in `ctx.sessions` any more, so the sidebar's row has no
// `displayTitle` to read and falls back to an id fragment. The title is still on disk — the log
// carries a `session/title` event — so this module reads it back.
//
// The log is a chain of independent zstd frames (one per append), not one stream: `zstdDecompressSync`
// stops after the first frame, which is why a plain read returns only the `session` header. Each frame
// is therefore cut at its magic number and decompressed on its own.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const LOG_FILE = 'session.v4.jsonl.zstd';
const SESSION_ID = /^(?!.*\.\.)[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/;
/** The title event lands within the first few frames; 256 KiB covers it without reading an 8 MB log. */
const DEFAULT_MAX_BYTES = 256 * 1024;

function homeRoot() {
  const home = process.env.DSH_HOME;
  return typeof home === 'string' && home.length > 0 ? home : null;
}

/** Split a byte range into zstd frames and decompress each one. A truncated tail frame is dropped. */
function decodeFrames(buf) {
  const positions = [];
  let at = 0;
  for (;;) {
    const i = buf.indexOf(MAGIC, at);
    if (i < 0) break;
    positions.push(i);
    at = i + MAGIC.length;
  }
  const parts = [];
  for (let k = 0; k < positions.length; k += 1) {
    const start = positions[k];
    const end = k + 1 < positions.length ? positions[k + 1] : buf.length;
    try {
      parts.push(zstdDecompressSync(buf.subarray(start, end)));
    } catch { /* the tail frame is usually cut by the read window */ }
  }
  return Buffer.concat(parts).toString('utf8');
}

/** Project directories are derived names (`--D-DSH--`), so the log is looked up by id, not by path. */
function findLog(root, sessionId) {
  const sessions = resolve(join(root, 'sessions'));
  let projects;
  try {
    projects = readdirSync(sessions, { withFileTypes: true });
  } catch {
    return null;
  }
  // The directory is named after the bare uuid, while `archivedSessionIds` (and every client id)
  // carries the `session-` prefix — looking up only the given id finds nothing, which is what made
  // the first version of this module return zero titles in 23 ms.
  const names = [sessionId];
  if (sessionId.startsWith('session-')) names.push(sessionId.slice('session-'.length));
  for (const project of projects) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue;
    for (const name of names) {
      const dir = join(sessions, project.name, name);
      if (!resolve(dir).startsWith(sessions + sep)) continue;
      const file = join(dir, LOG_FILE);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

/**
 * Read one Session's title from its log.
 * @returns the title, or null when the log is missing or carries no title event yet.
 */
export function readSessionTitle({ root, sessionId, maxBytes = DEFAULT_MAX_BYTES }) {
  if (typeof root !== 'string' || root.length === 0) return null;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;
  const file = findLog(root, sessionId);
  if (file === null) return null;
  let buf;
  try {
    buf = readFileSync(file).subarray(0, maxBytes);
  } catch {
    return null;
  }
  const text = decodeFrames(buf);
  for (const line of text.split('\n')) {
    if (!line.includes('"session/title"')) continue;
    try {
      const event = JSON.parse(line);
      const title = event?.data?.title;
      if (typeof title === 'string' && title.trim().length > 0) return title.trim();
    } catch { /* a line cut by the read window */ }
  }
  return null;
}

/** Batch form with a small concurrency window: each call reads at most `maxBytes`. */
export async function readSessionTitles({ root, ids, maxBytes = DEFAULT_MAX_BYTES, concurrency = 8 }) {
  const list = Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && SESSION_ID.test(id)) : [];
  const titles = {};
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      const id = list[index];
      const title = readSessionTitle({ root, sessionId: id, maxBytes });
      if (title !== null) titles[id] = title;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return titles;
}

export function registerSessionTitles(ctx) {
  ctx.inject?.(['connection'], scope => scope.connection.fetch.register({
    path: '/api/dsh-codex-ui/session-titles',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try {
        envelope = await request.json();
      } catch {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
      }
      const payload = envelope?.type === 'client-request' && envelope.method === 'dsh-codex-ui/session-titles' ? envelope.payload : null;
      const fail = (code, message) => Response.json({ type: 'server-response', rpcId: envelope?.rpcId, result: { ok: false, error: { code, message, details: {} } } });
      if (!payload || !Array.isArray(payload.ids)) return fail('titles/invalid', '会话列表无效。');
      try {
        const titles = await readSessionTitles({ root: homeRoot(), ids: payload.ids });
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { titles } } });
      } catch (error) {
        return fail('titles/refused', error?.message || String(error));
      }
    },
  }));
}
