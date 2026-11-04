import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const AUTHORIZED_RESUME_METHOD = 'dsh-codex-ui/authorized-resume';
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

// Registered through the host authenticated fetch service, never a raw HTTP listener.
export function registerAuthorizedResume(ctx, { home = process.env.DSH_HOME, now = Date.now } = {}) {
  let lease = null;
  const file = typeof home === 'string' && home ? join(home, 'codex-ui-authorized-resume.json') : null;
  const read = () => {
    if (!file) return null;
    try { return JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  };
  const valid = (m, at) => m && text(m.requestId, 256) && text(m.sessionId, 256) && text(m.message, 65536)
    && (m.status === 'pending' || m.status === 'acknowledged')
    && m.expectedImplementation === 'speed-pipeline-v1'
    && Number.isSafeInteger(m.createdAt) && m.createdAt <= at
    && Number.isSafeInteger(m.expiresAt) && m.expiresAt > at && m.expiresAt > m.createdAt
    && m.expiresAt - m.createdAt <= MAX_TTL_MS
    && Number.isSafeInteger(m.afterPid) && m.afterPid > 0;
  const response = (rpcId, result) => Response.json({ type: 'server-response', rpcId, result }, { headers: { 'cache-control': 'no-store' } });
  return ctx.connection.fetch.register({
    path: '/api/' + AUTHORIZED_RESUME_METHOD, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let e;
      try { e = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (e?.type !== 'client-request' || e.method !== AUTHORIZED_RESUME_METHOD || !text(e.rpcId, 256)) {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
      }
      try {
        const p = e.payload;
        if (!p || !['claim', 'ack'].includes(p.action) || !text(p.clientId, 256)) {
          return response(e.rpcId, { ok: false, error: { code: 'authorized-resume/action', message: 'Invalid action or clientId' } });
        }
        const m = read(), at = now();
        if (p.action === 'claim') {
          if (!m || !valid(m, at) || m.status === 'acknowledged') return response(e.rpcId, { ok: true, value: null, terminal: true, reason: !m ? 'absent' : m.status === 'acknowledged' ? 'acknowledged' : 'invalid' });
          if (process.pid === m.afterPid) return response(e.rpcId, { ok: true, value: null, terminal: false, reason: 'awaiting-restart' });
          if (lease?.requestId === m.requestId && lease.until > at) return response(e.rpcId, { ok: true, value: null });
          lease = { requestId: m.requestId, clientId: p.clientId, until: at + 30000 };
          return response(e.rpcId, { ok: true, value: { requestId: m.requestId, sessionId: m.sessionId, message: m.message } });
        }
        if (!text(p.requestId, 256) || m?.requestId !== p.requestId) return response(e.rpcId, { ok: false, error: { code: 'authorized-resume/request', message: 'Request mismatch' } });
        if (m.status === 'acknowledged') return response(e.rpcId, { ok: true, value: { acknowledged: true } });
        if (!valid(m, at) || process.pid === m.afterPid || lease?.requestId !== p.requestId || lease.clientId !== p.clientId) {
          return response(e.rpcId, { ok: false, error: { code: 'authorized-resume/lease', message: 'Matching active claim required' } });
        }
        const tmp = file + '.ack.tmp';
        writeFileSync(tmp, JSON.stringify({ ...m, status: 'acknowledged', ackAt: at, ackPid: process.pid }), { encoding: 'utf8', mode: 0o600 });
        renameSync(tmp, file);
        lease = null;
        return response(e.rpcId, { ok: true, value: { acknowledged: true } });
      } catch {
        // Do not expose filesystem paths or manifest contents through errors.
        return response(e.rpcId, { ok: false, error: { code: 'authorized-resume/storage', message: 'Authorized resume storage unavailable' } });
      }
    }
  });
}