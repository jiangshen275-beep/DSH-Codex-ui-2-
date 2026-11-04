import { waitForRun } from './collaboration-wait.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { canonicalFlashPath } from './flash-policy.js';
import { FLASH_PREFIX } from './flash-core.js';

const liveStates = new Set(['starting', 'running', 'waiting-help', 'waiting-children']);
const messageOf = error => error instanceof Error ? error.message : String(error);
const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
const within = (a, b) => a === b || a.startsWith(b + '/');
const outputGate = phase => ({ mode: 'single-final', phase, userSummaryAllowed: phase === 'ready', deliveredFactsArePublic: false });
const ROLES = 'ABCDEFGH';

export function superfastBranches(branches, min, max, allowed) {
  if (!Array.isArray(branches) || branches.length < min || branches.length > max) throw Error(`expected ${min}–${max} branches`);
  const paths = [];
  return branches.map(branch => {
    if (!branch || typeof branch.task !== 'string' || !branch.task.trim() || branch.task.length > 48000 || !Array.isArray(branch.write_paths)) throw Error('invalid superfast task package');
    const write_paths = branch.write_paths.map(file => {
      if (typeof file !== 'string' || !(path.posix.isAbsolute(file) || path.win32.isAbsolute(file))) throw Error('write_paths must be absolute');
      const key = canonicalFlashPath(file, process.cwd());
      if (allowed && !allowed.some(root => within(key, root))) throw Error('child write_paths exceed group ownership');
      if (paths.some(other => overlaps(key, other))) throw Error('overlapping superfast write_paths');
      paths.push(key);
      return key;
    });
    return { task: branch.task, write_paths };
  });
}

/**
 * Flat superfast: the parent owns 2–8 real executor subagents directly.
 *
 * Depth and node count are cost, not speed. An extra organizer and four group leaders meant every
 * model rebuilt the same context and four of ten leaves shipped interface defects that had to be
 * redone. Executors now get one large contiguous package each, and the parent verifies the result
 * while they are still finishing.
 */
export class SuperfastCoordinator {
  constructor({ execute, notify, record = async () => {}, now = Date.now, timeoutMs = 1800000, hardTimeoutMs = 7200000, externalPaths = () => [], validationRequired = false }) {
    Object.assign(this, { execute, notify, record, now, timeoutMs, hardTimeoutMs, externalPaths, validationRequired });
    this.runs = new Map();
    this.closed = false;
  }
  require(parent, id) {
    const run = this.runs.get(id);
    if (!run || run.parent !== parent) throw Error('superfast run is not owned by this parent');
    return run;
  }
  /**
   * Two clocks, because one was enough to kill a healthy run. `timeoutMs` is the no-progress window:
   * every event, rework and acceptance re-arms it, so a run whose executors and parent keep working
   * is never cancelled for merely being old. `hardTimeoutMs` is the absolute ceiling for the case
   * where something hangs forever and nothing ever reports.
   *
   * The r10 run proved why this matters: all three executors finished `ok`, the parent was in the
   * middle of rework and acceptance, and the single 30-minute wall clock cancelled the run anyway.
   */
  touch(run) {
    if (this.closed || run.status !== 'running') return;
    run.lastProgressAt = this.now();
    clearTimeout(run.idleTimer);
    run.idleTimer = setTimeout(() => {
      void this.cancel(run.parent, run.id, `superfast idle deadline exceeded: no progress for ${this.timeoutMs}ms`);
    }, this.timeoutMs);
    run.idleTimer.unref?.();
  }
  armDeadlines(run) {
    this.touch(run);
    run.hardTimer = setTimeout(() => {
      void this.cancel(run.parent, run.id, `superfast hard deadline exceeded: run exceeded ${this.hardTimeoutMs}ms`);
    }, this.hardTimeoutMs);
    run.hardTimer.unref?.();
  }
  reservedPaths() {
    return [...this.runs.values()].filter(r => r.status === 'running').flatMap(r => r.task.branches.flatMap(b => b.write_paths));
  }
  assertAvailable(branches) {
    const occupied = [...this.reservedPaths(), ...this.externalPaths()];
    if (branches.some(b => b.write_paths.some(p => occupied.some(q => overlaps(p, q))))) throw Error('write_paths are already reserved by an active collaboration');
  }
  waitRoot(parent, id, options = {}) {
    const run = this.require(parent, id), until = options.until ?? 'terminal', after = options.after_revision ?? -1;
    if (!['terminal', 'workers'].includes(until) || !Number.isSafeInteger(after) || after < -1) throw Error('invalid parent wait readiness');
    // Readiness is decided by the consumed cursor, never by when this call happens to run. A result
    // The cursor is "has this batch been announced", not "is it newer than the number the parent
    // sent". A parent can only repeat a revision it has already seen, so a strictly-greater
    // comparison silently drops the batch whenever the delivered revision happens to equal the
    // one the parent guessed — which is how the r11 run slept ten minutes with all four executors
    // already finished (the parent sent after_revision 8 and the finished run was also revision 8).
    const announced = () => run.notifiedRevision ?? -1;
    return waitForRun(run, () => this.view(run), {
      signal: options.signal, timeoutMs: options.timeoutMs, ready: v => {
        const revision = v.validation.revision;
        if (v.validation.ready && announced() !== revision && v.validation.acceptedRevision !== revision) {
          run.notifiedRevision = revision;
          return v.validation.required ? 'validation-required' : 'workers-ready';
        }
        return null;
      },
    });
  }
  validation(run) {
    const leaves = (run.workerIds ?? []).map(id => run.jobs.get(id));
    const ready = leaves.length > 0 && leaves.length === run.task.branches.length && leaves.every(j => !!j?.result && !liveStates.has(j.state)) && !run.controller.signal.aborted;
    return {
      ready, revision: run.workRevision ?? 0, workers: leaves.length,
      failed: leaves.filter(j => j.result?.ok === false).map(j => j.sessionId),
      provisional: true, finalValidationRequired: true, required: run.validationRequired,
      acceptedRevision: run.acceptedRevision ?? null,
      phase: run.finalizing ? 'finalizing' : run.validationRequired && ready ? 'awaiting-parent' : 'collecting',
    };
  }
  view(run) {
    return {
      validation: this.validation(run),
      pendingHelp: [...run.jobs.values()].filter(j => liveStates.has(j.state) && j.help?.ownerAgentId === run.parent.id).map(j => ({ agentId: j.sessionId, ...j.help })),
      mode: 'superfast', runId: run.id, status: run.status, reporting: { ...run.reporting },
      topology: 'parent → 2–8 flat executors', globalConcurrencyLimit: 8, waitDefault: 'batch',
      active: [...run.jobs.values()].filter(j => liveStates.has(j.state)).length,
      branches: [...run.jobs.values()].map(j => ({ agentId: j.sessionId, parentAgentId: j.parentId, role: j.role, kind: j.kind, depth: j.depth, state: j.state, branch: j.branch, write_paths: j.branch?.write_paths ?? [], help: j.help ? { ...j.help } : null, checkpoint: j.latestArtifact, attempt: j.attempt, retryOf: j.retryOf, supersededBy: j.supersededBy })),
      results: run.results.map(r => ({ ...r })), events: run.events.slice(-100), summary: run.summary, error: run.error,
      durationMs: (run.endedAt ?? this.now()) - run.started,
      deadline: {
        idleTimeoutMs: this.timeoutMs, hardTimeoutMs: this.hardTimeoutMs,
        lastProgressAt: run.lastProgressAt ?? run.started,
        idleRemainingMs: Math.max(0, (run.lastProgressAt ?? run.started) + this.timeoutMs - this.now()),
        hardRemainingMs: Math.max(0, run.started + this.hardTimeoutMs - this.now()),
      },
    };
  }
  async emit(run, event, data = {}) {
    if (run.status === 'running') this.touch(run);
    const entry = { mode: 'superfast', runId: run.id, seq: ++run.seq, event, at: new Date(this.now()).toISOString(), ...data };
    run.events.push(entry);
    if (run.events.length > 400) run.events.shift();
    try { await this.record(entry); } catch (e) { run.journalError = messageOf(e); }
    for (const listener of [...run.listeners]) { try { listener(); } catch (e) { run.listenerError = messageOf(e); } }
    return entry;
  }
  async rootFact(run, fact) {
    if (run.controller.signal.aborted) return;
    try { await this.notify(run.parent, { mode: 'superfast', runId: run.id, internalOnly: true, reporting: { ...run.reporting }, ...fact }); }
    catch (e) { run.notificationError = messageOf(e); }
  }
  start(parent, task) {
    if (this.closed) throw Error('superfast coordinator is closing');
    if (!parent?.id || typeof task?.objective !== 'string' || !task.objective.trim() || task.objective.length > 48000) throw Error('invalid superfast objective');
    if (task.branches?.some(branch => branch?.workers !== undefined)) throw Error('superfast is flat: put 2–8 executors in branches instead of nested worker plans');
    const branches = superfastBranches(task.branches, 2, 8);
    this.assertAvailable(branches);
    const id = randomUUID();
    const run = {
      id, parent, task: { ...task, branches }, started: this.now(), status: 'running', controller: new AbortController(),
      jobs: new Map(), results: [], events: [], listeners: new Set(), seq: 0, workRevision: 0,
      validationRequired: this.validationRequired, acceptedRevision: null, reporting: outputGate('collecting'), workerIds: [],
    };
    this.runs.set(id, run);
    this.armDeadlines(run);
    run.workerIds = branches.map((branch, i) => this.launch(run, branch, 'worker', ROLES[i]).sessionId);
    run.completion = this.finish(run);
    return this.view(run);
  }
  launch(run, branch, kind, role, attempt = 1, retryOf = null) {
    const parentId = run.parent.id;
    const job = {
      runId: run.id, sessionId: `${FLASH_PREFIX}sf-${run.id}-${role}${attempt > 1 ? '-r' + attempt : ''}`, parentId, role, kind, attempt, retryOf,
      depth: 1, branch,
      objective: run.task.objective, materials: run.task.materials ?? '', constraints: run.task.constraints ?? '', acceptance: run.task.acceptance ?? '',
      signal: run.controller.signal, state: 'starting', children: [], dispatched: false, handle: null, artifacts: [],
    };
    job.onReady = handle => { job.handle = handle; job.state = 'running'; };
    job.report = (type, message, wait, escalate = false) => this.report(run, job, type, message, wait, escalate);
    run.jobs.set(job.sessionId, job);
    run.workRevision = (run.workRevision ?? 0) + 1;
    run.acceptedRevision = null;
    job.promise = Promise.resolve().then(async () => {
      let result;
      try {
        await this.emit(run, 'node-start', { agentId: job.sessionId, parentAgentId: parentId, role, kind, depth: job.depth });
        job.signal.throwIfAborted();
        const output = await this.execute(job, run.parent);
        job.signal.throwIfAborted();
        if (job.help) throw Error('executor returned with unresolved help');
        if (typeof output !== 'string' || !output.trim()) throw Error('superfast executor produced no final text');
        job.state = 'completed';
        result = { role, kind, agentId: job.sessionId, parentAgentId: parentId, ok: true, output, artifacts: [...(job.inheritedArtifacts ?? []), ...job.artifacts.map(a => ({ ...a, agentId: job.sessionId }))] };
      } catch (e) {
        job.state = job.signal.aborted ? 'cancelled' : 'failed';
        result = { role, kind, agentId: job.sessionId, parentAgentId: parentId, ok: false, error: messageOf(e), checkpoint: job.latestArtifact, artifacts: [...(job.inheritedArtifacts ?? []), ...job.artifacts] };
      } finally {
        if (job.waiter) job.waiter.reject(Error('superfast executor finished'));
        job.handle = null;
      }
      job.result = result;
      run.results.push(result);
      // Finishing is work too. A parent that waits right after start has already consumed the
      // revision start returned, and nothing bumped the cursor once the executors were launched —
      // so `ready` flipped to true with no revision change and the wait slept to its timeout while
      // every executor had already finished. Bumping here makes completion a consumable event.
      run.workRevision = (run.workRevision ?? 0) + 1;
      await this.emit(run, 'node-end', { ...result, output: undefined });
      await this.rootFact(run, { kind: 'progress', agentId: job.sessionId, parentAgentId: parentId, role, message: JSON.stringify(result) });
      return result;
    });
    return job;
  }
  async report(run, job, kind, message, wait = false, escalate = false) {
    job.signal.throwIfAborted();
    if (!['progress', 'artifact', 'help'].includes(kind) || typeof message !== 'string' || !message.trim() || message.length > 6000 || (wait && kind !== 'help')) throw Error('invalid superfast report');
    if (job.waiter || job.help) throw Error('resolve the existing help request before reporting another');
    if (kind === 'artifact') {
      job.latestArtifact = { message, at: new Date(this.now()).toISOString() };
      if (!job.artifacts.some(a => a.message === message)) {
        if (job.artifacts.length >= 64) throw Error('artifact capacity exceeded; consolidate reports before retrying');
        job.artifacts.push(job.latestArtifact);
      }
    }
    let answer;
    if (kind === 'help') {
      // Executors sit directly under the parent; every help is the parent's to answer.
      job.help = { id: randomUUID(), ownerAgentId: run.parent.id, escalated: escalate, message, waiting: wait, state: 'pending' };
      if (wait) {
        job.state = 'waiting-help';
        answer = new Promise((resolve, reject) => {
          const stop = () => job.waiter?.reject(job.signal.reason);
          const cleanup = () => job.signal.removeEventListener('abort', stop);
          job.waiter = {
            resolve: value => { cleanup(); job.waiter = null; job.state = 'running'; resolve(value); },
            reject: error => { cleanup(); job.waiter = null; reject(error); },
          };
          job.signal.addEventListener('abort', stop, { once: true });
        });
        answer.catch(() => {});
      }
    }
    const help = job.help ? { ...job.help } : null;
    await this.emit(run, kind, { agentId: job.sessionId, parentAgentId: job.parentId, role: job.role, message, help });
    await this.rootFact(run, { kind: kind === 'help' ? 'help' : 'progress', reportKind: kind, agentId: job.sessionId, role: job.role, message, help });
    return wait ? await answer : { accepted: true, cursor: run.seq };
  }
  reply(run, ownerId, agentId, message) {
    const job = run.jobs.get(agentId);
    if (!job || !liveStates.has(job.state) || typeof message !== 'string' || !message.trim() || message.length > 12000) throw Error('invalid superfast reply target');
    if (job.help) {
      if (job.help.ownerAgentId !== ownerId) throw Error('help belongs to another owner');
      job.help = null;
      if (job.waiter) job.waiter.resolve({ reply: message });
      else if (job.handle && this.makeMessage) job.handle.steer(this.makeMessage(ownerId, message));
      else throw Error('superfast reply target is still starting');
    } else {
      if (job.parentId !== ownerId) throw Error('only the parent may adjust a running executor without pending help');
      if (!job.handle || !this.makeMessage) throw Error('superfast reply target is not ready');
      job.handle.steer(this.makeMessage(ownerId, message));
    }
    return { accepted: true };
  }
  rework(run, agentId, message, revision) {
    run.controller.signal.throwIfAborted();
    if (!run.validationRequired || run.status !== 'running' || run.finalizing) throw Error('parent rework requires a running validation gate');
    if (!Number.isSafeInteger(revision) || revision !== run.workRevision) throw Error('rework revision is stale; read current validation revision');
    const leaf = run.jobs.get(agentId);
    if (!leaf || leaf.kind !== 'worker' || leaf.parentId !== run.parent.id || !run.workerIds.includes(agentId)) throw Error('rework requires a current executor of this run');
    if (liveStates.has(leaf.state) || !leaf.result || leaf.handle) throw Error('executor must finish and release before rework');
    if (typeof message !== 'string' || !message.trim() || message.length > 12000) throw Error('rework requires concrete repair instructions');
    const branch = { ...leaf.branch, task: leaf.branch.task + '\n返工：先检查现存文件，只修复以下问题，不重复覆盖成果。\n' + message + '\n前次证据：' + JSON.stringify({ result: leaf.result, checkpoint: leaf.latestArtifact }) };
    if (branch.task.length > 48000) throw Error('rework task exceeds context limit; provide a smaller repair message');
    const next = this.launch(run, branch, 'worker', leaf.role, leaf.attempt + 1, leaf.sessionId);
    next.inheritedArtifacts = leaf.result.artifacts ?? [];
    next.latestArtifact = leaf.latestArtifact;
    leaf.supersededBy = next.sessionId;
    leaf.result.supersededBy = next.sessionId;
    run.workerIds[run.workerIds.indexOf(agentId)] = next.sessionId;
    run.reworked = true;
    this.touch(run);
    return { accepted: true, agentId: next.sessionId, role: next.role, attempt: next.attempt, retryOf: agentId, cursor: run.seq, validation: this.validation(run) };
  }
  acceptValidation(run, revision) {
    run.controller.signal.throwIfAborted();
    if (!run.validationRequired || run.status !== 'running' || run.finalizing) throw Error('validation gate is not open');
    const v = this.validation(run);
    if (!Number.isSafeInteger(revision) || revision !== v.revision) throw Error('validation revision is stale');
    if (!v.ready) throw Error('current executors have not completed');
    if (v.failed.length) throw Error('current executor failure requires rework before acceptance');
    if ([...run.jobs.values()].some(j => j.help)) throw Error('resolve pending help before acceptance');
    run.acceptedRevision = revision;
    this.touch(run);
    for (const fn of [...run.listeners]) { try { fn(); } catch (e) { run.listenerError = messageOf(e); } }
    return { accepted: true, revision, terminal: false };
  }
  waitValidation(run) {
    return new Promise((resolve, reject) => {
      const cleanup = () => { run.listeners.delete(check); run.controller.signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(run.controller.signal.reason); };
      const check = () => {
        if (run.controller.signal.aborted) return abort();
        const v = this.validation(run);
        if (v.ready && v.acceptedRevision === v.revision) { cleanup(); resolve(); }
      };
      run.listeners.add(check);
      run.controller.signal.addEventListener('abort', abort, { once: true });
      check();
    });
  }
  async finish(run) {
    try {
      for (;;) {
        await Promise.allSettled([...run.jobs.values()].map(j => j.promise));
        if (run.controller.signal.aborted) break;
        if (run.validationRequired) {
          await this.waitValidation(run);
          await Promise.allSettled([...run.jobs.values()].map(j => j.promise));
          const v = this.validation(run);
          if (!v.ready || v.acceptedRevision !== v.revision) continue;
        }
        break;
      }
      run.finalizing = true;
      run.endedAt = this.now();
      if (run.controller.signal.aborted) {
        run.error = messageOf(run.controller.signal.reason);
        run.status = run.cancelRequested ? 'cancelled' : 'failed';
      } else {
        const current = (run.workerIds ?? []).map(id => run.jobs.get(id)).filter(j => j?.result?.ok).map(j => `${j.role}: ${j.result.output}`);
        run.summary = current.join('\n\n');
        if (run.reworked) run.summary += '\n\n父验收期间发生返工：以上为当前执行者结果，被替换的旧结果仅作历史保留。';
        run.status = run.results.filter(r => !r.supersededBy).every(r => r.ok) ? 'completed' : 'partial';
      }
    } catch (e) {
      run.error = messageOf(e);
      run.finalizing = true;
      await Promise.allSettled([...run.jobs.values()].map(j => j.promise));
      run.status = run.cancelRequested ? 'cancelled' : 'failed';
    } finally {
      run.endedAt ??= this.now();
      run.reporting = outputGate('ready');
      await this.emit(run, 'completed', { status: run.status, error: run.error });
      if (!run.cancelRequested) {
        try {
          await this.notify(run.parent, { mode: 'superfast', runId: run.id, kind: run.status === 'failed' ? 'run-failed' : 'run-complete', status: run.status, summary: run.summary?.slice(-4000), error: run.error, reporting: { ...run.reporting }, singleReport: true });
        } catch (e) { run.notificationError = messageOf(e); }
      }
      for (const check of [...run.listeners]) { try { check(); } catch (e) { run.listenerError = messageOf(e); } }
      clearTimeout(run.idleTimer);
      clearTimeout(run.hardTimer);
      const completed = [...this.runs.values()].filter(r => r.status !== 'running');
      while (completed.length > 30) this.runs.delete(completed.shift().id);
    }
  }
  async cancel(parent, id, reason = 'superfast run cancelled') {
    const run = this.require(parent, id);
    run.cancelRequested = true;
    run.controller.abort(Error(reason));
    await run.completion;
    return this.view(run);
  }
  async closeParent(parent) { await Promise.allSettled([...this.runs.values()].filter(r => r.parent === parent && r.status === 'running').map(r => this.cancel(parent, r.id, 'parent disposed or cancelled'))); }
  async close() { this.closed = true; await Promise.allSettled([...this.runs.values()].filter(r => r.status === 'running').map(r => this.cancel(r.parent, r.id, 'superfast channel unloaded'))); }
}
