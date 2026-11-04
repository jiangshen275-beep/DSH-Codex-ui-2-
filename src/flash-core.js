import { randomUUID } from 'node:crypto';
import { canonicalFlashPath } from './flash-policy.js';
export const FLASH_PREFIX = 'session-cgflash-';
export const isFlashSession = value => typeof (value?.id ?? value) === 'string' && String(value?.id ?? value).startsWith(FLASH_PREFIX);
export function validateFlashTask(task, max = 4) {
  if (!task || typeof task.objective !== 'string' || !task.objective.trim()) throw new Error('objective is required');
  if (!Array.isArray(task.branches) || task.branches.length < 2 || task.branches.length > max || task.branches.some(x => !x || typeof x.task !== 'string' || !x.task.trim())) throw new Error(`two to ${max === 4 ? 'four' : max} non-empty branches are required`);
  const owners = new Map();
  for (let i = 0; i < task.branches.length; i++) {
    if (!Array.isArray(task.branches[i].write_paths)) throw new Error('write_paths must be an array');
    for (const file of task.branches[i].write_paths) {
      if (typeof file !== 'string' || !file.trim()) throw new Error('write_paths must contain non-empty strings');
      if (!/^[A-Za-z]:[\\/]/.test(file) && !file.startsWith('/') && !file.startsWith('\\\\')) throw new Error('write_paths must be absolute');
      const key = canonicalFlashPath(file, process.cwd());
      for (const [previous, owner] of owners) if (owner !== i && (key === previous || key.startsWith(previous + '/') || previous.startsWith(key + '/'))) throw new Error(`overlapping write ownership: ${file}`);
      owners.set(key, i);
    }
  }
}
export async function runFlash(task, { execute, signal, record = async () => {} }) {
  validateFlashTask(task);
  signal?.throwIfAborted();
  const runId = randomUUID(), controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const start = Date.now();
  const emit = async (event, data = {}) => { await record({ runId, event, at: new Date().toISOString(), ...data }); };
  let pending = [];
  try {
    await emit('started');
    pending = task.branches.map((branch, index) => Promise.resolve().then(async () => {
      controller.signal.throwIfAborted();
      const role = 'ABCD'[index];
      const branchStart = Date.now();
      await emit('branch-start', { role });
      let result;
      try {
        const output = await execute({ runId, role, kind: 'executor', sessionId: `${FLASH_PREFIX}${runId}-${role}`, objective: task.objective, materials: task.materials ?? '', constraints: task.constraints ?? '', acceptance: task.acceptance ?? '', branch, signal: controller.signal });
        result = { role, ok: true, output };
      } catch (error) {
        result = { role, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      await emit('branch-end', { role, ok: result.ok, durationMs: Date.now() - branchStart });
      return result;
    }));
    const branches = await Promise.all(pending);
    controller.signal.throwIfAborted();
    await emit('summary-start');
    const summaryRole = task.branches.length === 2 ? 'C' : 'S';
    const summary = await execute({ runId, role: summaryRole, kind: 'summary', sessionId: `${FLASH_PREFIX}${runId}-${summaryRole}`, objective: task.objective, acceptance: task.acceptance ?? '', constraints: task.constraints ?? '', branches, signal: controller.signal });
    controller.signal.throwIfAborted();
    const result = { runId, ok: branches.every(x => x.ok), summary, branches, durationMs: Date.now() - start };
    await emit('completed', { ok: result.ok, durationMs: result.durationMs });
    return result;
  } catch (error) {
    controller.abort(error);
    await Promise.allSettled(pending);
    try { await emit('failed', { cancelled: signal?.aborted === true, durationMs: Date.now() - start }); } catch {}
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}