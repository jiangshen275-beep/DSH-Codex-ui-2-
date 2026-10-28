/** 本机审查审计。只保存决策摘要与脱敏事实，不保存原始参数、模型正文或内部推理。 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export const REVIEW_LOG_DIR = 'codex-ui-review-log';
const MAX_ENTRIES = 200;
const FILE = 'decisions.jsonl';
export function reviewLogDir(home = process.env.DSH_HOME) {
  return typeof home === 'string' && home ? join(home, REVIEW_LOG_DIR) : null;
}
export function scrubReviewText(value, limit = 2000) {
  return String(value ?? '')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[私钥块]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [疑似令牌]')
    .replace(/\b(?:sk|pk|ak|rk|xox[baprs]|ghp|gho|github_pat|glpat)[-_][A-Za-z0-9_-]{8,}/gi, '[疑似令牌]')
    .replace(/(["']?\b(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|cookie)\b["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi, '$1[疑似键值凭据]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[凭据]@')
    .replace(/([?&](?:key|token|secret|password|api_key)=)[^\s&#"']*/gi, '$1[疑似令牌]')
    .slice(0, limit);
}
function normalize(entry) {
  return {
    id: scrubReviewText(entry?.id || randomUUID(), 100),
    at: scrubReviewText(entry?.at || new Date().toISOString(), 40),
    tool: scrubReviewText(entry?.tool, 100),
    preset: scrubReviewText(entry?.preset, 60),
    decision: ['reviewing','allow','ask_user','bypass','error'].includes(entry?.decision) ? entry.decision : 'error',
    permission: ['allow','ask','deny','unknown'].includes(entry?.permission) ? entry.permission : 'unknown',
    reason: scrubReviewText(entry?.reason, 1000),
    ruleIds: Array.isArray(entry?.ruleIds) ? [...new Set(entry.ruleIds.filter(x => /^(D[1-8]|P[1-6])$/.test(x)))].slice(0, 14) : [],
    evidence: scrubReviewText(entry?.evidence, 3500),
    provider: scrubReviewText(entry?.provider, 100),
    model: scrubReviewText(entry?.model, 120),
    durationMs: Number.isFinite(entry?.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : 0,
    error: scrubReviewText(entry?.error, 500),
  };
}
export function listDecisions(home = process.env.DSH_HOME) {
  const dir = reviewLogDir(home);
  if (!dir) return [];
  try {
    return readFileSync(join(dir, FILE), 'utf8').split(/\r?\n/).filter(Boolean).slice(-MAX_ENTRIES).flatMap(line => {
      try { const e = JSON.parse(line); return e && typeof e === 'object' && !Array.isArray(e) ? [normalize(e)] : []; } catch { return []; }
    }).reverse();
  } catch { return []; }
}
function save(rows, home) {
  const dir = reviewLogDir(home);
  if (!dir) throw new Error('DSH_HOME 未设置');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, FILE);
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, rows.slice(-MAX_ENTRIES).map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
}
export function recordDecision(entry, home = process.env.DSH_HOME) {
  try {
    const row = normalize(entry);
    const rows = listDecisions(home).reverse().filter(x => x.id !== row.id);
    rows.push(row);
    save(rows, home);
    return true;
  } catch { return false; }
}
export function clearDecisions(home = process.env.DSH_HOME) {
  const count = listDecisions(home).length;
  if (count || (reviewLogDir(home) && existsSync(join(reviewLogDir(home), FILE)))) save([], home);
  return { cleared: count };
}
export function registerReviewLogRoute(ctx, home = process.env.DSH_HOME) {
  return ctx.connection.fetch.register({
    path: '/api/dsh-codex-ui/review-log', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (body?.type !== 'client-request' || body.method !== 'dsh-codex-ui/review-log' || typeof body.rpcId !== 'string' || body.rpcId.length > 256) return Response.json({ error: 'Invalid request' }, { status: 400 });
      let result;
      try {
        const action = body.payload?.action ?? 'list';
        if (action === 'list') result = { ok: true, value: { items: listDecisions(home), dir: reviewLogDir(home), limit: MAX_ENTRIES } };
        else if (action === 'clear') result = { ok: true, value: clearDecisions(home) };
        else result = { ok: false, error: { code: 'review-log/action', message: '可用 list / clear' } };
      } catch (error) { result = { ok: false, error: { code: 'review-log/storage', message: scrubReviewText(error.message, 200) } }; }
      return Response.json({ type: 'server-response', rpcId: body.rpcId, result });
    }
  });
}