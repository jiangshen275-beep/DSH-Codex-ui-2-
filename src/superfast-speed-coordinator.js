import { randomUUID } from 'node:crypto';
import { FlashCoordinator } from './flash-coordinator.js';
import { validateFlashTask, FLASH_PREFIX } from './flash-core.js';
import { canonicalFlashPath } from './flash-policy.js';
import { waitForRun } from './collaboration-wait.js';

const messageOf = e => e instanceof Error ? e.message : String(e);
const freezeBranch = b => ({ ...b, write_paths: b.write_paths.map(p => canonicalFlashPath(p, process.cwd())) });
const actionable = new Set(['artifact', 'branch-end', 'help', 'completed', 'failed', 'timeout']);
const liveStates = new Set(['queued', 'starting', 'running', 'waiting-help']);
const failedStates = new Set(['failed', 'blocked', 'cancelled']);

// Pure admission: no run state changes until the entire graph and ownership pass.
function prepareBranches(branches, existing = [], next = 0) {
  const ids = new Set(existing.filter(job => job.explicitId).map(job => job.taskId));
  for (const branch of branches) {
    if (branch.id !== undefined) {
      if (typeof branch.id !== 'string' || !branch.id.trim()) throw Error('branch id must be a non-empty string');
      if (ids.has(branch.id) || existing.some(job => job.taskId === branch.id)) throw Error('duplicate branch id: ' + branch.id);
      ids.add(branch.id);
    }
  }
  const occupied = new Set([...existing.map(job => job.taskId), ...ids]);
  const prepared = branches.map((branch, i) => {
    if (branch.depends_on !== undefined && !Array.isArray(branch.depends_on)) throw Error('depends_on must be an array');
    const dependencies = (branch.depends_on ?? []).map(dep => {
      if (!dep || typeof dep.id !== 'string' || !dep.id.trim() || !['artifact', 'completed'].includes(dep.event))
        throw Error('invalid dependency id or event');
      return { id: dep.id, event: dep.event };
    });
    let taskId = branch.id;
    if (taskId === undefined) {
      taskId = `legacy:${next + i}`;
      while (occupied.has(taskId)) taskId = '_' + taskId;
    }
    occupied.add(taskId);
    return { taskId, explicitId: branch.id !== undefined, branch: freezeBranch({ ...branch, depends_on: dependencies }), dependencies };
  });
  const graph = new Map([...existing, ...prepared].map(job => [job.taskId, job]));
  const visited = new Set(), visiting = new Set();
  const visit = job => {
    if (visiting.has(job.taskId)) throw Error('dependency cycle: ' + job.taskId);
    if (visited.has(job.taskId)) return;
    visiting.add(job.taskId);
    for (const dep of job.dependencies) {
      if (!ids.has(dep.id)) throw Error('unknown dependency id: ' + dep.id);
      if (dep.id === job.taskId) throw Error('self dependency: ' + dep.id);
      visit(graph.get(dep.id));
    }
    visiting.delete(job.taskId); visited.add(job.taskId);
  };
  for (const job of graph.values()) visit(job);
  return prepared;
}

// This coordinator intentionally leaves FlashCoordinator and legacy diagnosis untouched.
export class SuperfastSpeedCoordinator extends FlashCoordinator {
  constructor({ execute, notify = async () => {}, record = async () => {}, now = Date.now,
    max = 32, idleTimeoutMs = 1800000, hardTimeoutMs = 7200000, sideEffectDrainMs = 5000 } = {}) {
    if (!Number.isSafeInteger(max) || max < 2 || max > 32) throw Error('max must be an integer between 2 and 32');
    for (const [name, value] of Object.entries({ idleTimeoutMs, hardTimeoutMs, sideEffectDrainMs }))
      if (!Number.isSafeInteger(value) || value < 0) throw Error(name + ' must be a non-negative integer');
    super({ execute, notify, record, now, max });
    Object.assign(this, { idleTimeoutMs, hardTimeoutMs, sideEffectDrainMs });
    this.sideEffects = new Set();
  }
  view(run) {
    const base = super.view(run);
    return { ...base, queued: [...run.jobs.values()].filter(job => job.state === 'queued').length,
      capacity: Math.max(0, this.max - [...run.jobs.values()].filter(job => liveStates.has(job.state)).length),
      executionCapacity: Math.max(0, this.max - run.pending.size),
      pendingHelp: base.pendingHelp.filter(help => {
        const job = run.jobs.get(help.agentId);
        return help.waiting || (job.help?.revision ?? 0) > run.consumedHelpRevision;
      }).map(help => ({ ...help, replyRequired: help.waiting })),
      branches: base.branches.map(branch => ({ ...branch, taskId: run.jobs.get(branch.agentId).taskId,
        depends_on: run.jobs.get(branch.agentId).dependencies.map(dep => ({ ...dep })),
        timing: { ...run.jobs.get(branch.agentId).timing } })),
      eventRevision: run.eventRevision, eventSequence: run.eventSequence, consumedRevision: run.consumedRevision,
      phase: run.phase, phases: { ...run.phases }, timeoutReason: run.timeoutReason,
      sideEffects: { pending: run.sideEffects.size, errors: run.sideEffectErrors.slice(), drainTimedOut: !!run.drainTimedOut },
      readiness: { resultCount: run.results.length, readyAt: run.endedAt ?? null,
        launchQueueMs: run.launchQueueMs.slice(), launchQueueMeaning: 'JavaScript microtask scheduling only; not host or model queue',
        dependencySchedulingMeaning: 'schedulingMs measures dependency satisfaction to executor invocation; not model readiness',
        workers: [...run.jobs.values()].map(job => ({ taskId: job.taskId, role: job.role, ...job.timing })) } };
  }
  track(run, kind, action) {
    const task = Promise.resolve().then(action).catch(error => {
      run.sideEffectErrors.push({ kind, error: messageOf(error), at: this.now() });
      if (run.sideEffectErrors.length > 100) run.sideEffectErrors.shift();
    }).finally(() => { run.sideEffects.delete(task); this.sideEffects.delete(task); });
    run.sideEffects.add(task); this.sideEffects.add(task);
    return task;
  }
  touch(run) {
    if (run.status !== 'running' || run.controller.signal.aborted) return;
    run.lastProgressAt = this.now();
    clearTimeout(run.idleTimer);
    if (this.idleTimeoutMs) {
      run.idleTimer = setTimeout(() => this.expire(run, 'idle-timeout'), this.idleTimeoutMs);
      run.idleTimer.unref?.();
    }
  }
  expire(run, reason) {
    if (run.status !== 'running' || run.controller.signal.aborted) return;
    run.timeoutReason = reason;
    this.emit(run, 'timeout', { reason, idleMs: this.now() - run.lastProgressAt });
    void this.cancel(run.parent, run.id, reason).catch(error => {
      run.sideEffectErrors.push({ kind: 'timeout-cancel', error: messageOf(error), at: this.now() });
    });
  }
  emit(run, event, data = {}) {
    const entry = { runId: run.id, event, at: new Date(this.now()).toISOString(), ...data, eventSequence: ++run.eventSequence };
    if (actionable.has(event)) entry.revision = ++run.eventRevision;
    run.events.push(entry); if (run.events.length > 100) run.events.shift();
    this.track(run, 'record', () => this.record(entry));
    if (event !== 'timeout') this.touch(run);
    for (const check of [...run.listeners]) check();
    return Promise.resolve();
  }
  tell(run, data) {
    if (run.controller.signal.aborted) return Promise.resolve(false);
    const fact = { runId: run.id, ...data };
    // Admission is lossless even when the context transport fails or stalls.
    run.deliveredFacts.push(fact);
    this.track(run, 'notify', () => this.notify(run.parent, fact));
    return Promise.resolve(true);
  }
  start(parent, task) {
    if (this.closed) throw Error('superfast coordinator is closing');
    validateFlashTask(task, this.max);
    if (this.parents.has(parent)) throw Error('this parent already has an active superfast run; use control add');
    const prepared = prepareBranches(task.branches);
    const started = this.now(), id = randomUUID();
    const run = { id, parent, task, started, controller: new AbortController(), jobs: new Map(), pending: new Set(),
      inflight: new Set(), results: [], events: [], listeners: new Set(), deliveredFacts: [],
      reporting: { mode: 'single-final', phase: 'collecting', userSummaryAllowed: false, deliveredFactsArePublic: false },
      status: 'running', next: 0, finishing: false, phase: 'executing', phases: { startedAt: started },
      eventRevision: 0, eventSequence: 0, consumedRevision: 0, consumedHelpRevision: 0,
      sideEffects: new Set(), sideEffectErrors: [], launchQueueMs: [] };
    this.runs.set(id, run); this.parents.set(parent, run);
    this.touch(run);
    if (this.hardTimeoutMs) { run.hardTimer = setTimeout(() => this.expire(run, 'hard-timeout'), this.hardTimeoutMs); run.hardTimer.unref?.(); }
    this.launch(run, prepared);
    return this.view(run);
  }
  add(parent, id, branches) {
    const run = this.require(parent, id);
    if (this.closed || run.controller.signal.aborted || run.finishing || run.status !== 'running') throw Error('run is not accepting work; start a new run after completion');
    const live = [...run.jobs.values()].filter(job => liveStates.has(job.state));
    if (!Array.isArray(branches) || !branches.length || live.length + branches.length > this.max)
      throw Error(`at most ${this.max} concurrent executors are allowed`);
    const all = [...live.map(job => job.branch), ...branches];
    validateFlashTask({ ...run.task, branches: all.length === 1 ? [...all, { task: 'ownership sentinel', write_paths: [] }] : all }, this.max);
    const prepared = prepareBranches(branches, [...run.jobs.values()], run.next);
    this.launch(run, prepared);
    return this.view(run);
  }
  launch(run, branches) {
    // Register the entire batch before any executor or synchronous listener can observe it.
    for (const { branch, taskId, explicitId, dependencies } of branches) {
      const n = run.next++, role = n < 4 ? 'ABCD'[n] : `W${n + 1}`, sessionId = `${FLASH_PREFIX}${run.id}-${role}`;
      const job = { runId: run.id, taskId, explicitId, dependencies, role, kind: 'executor', sessionId, branch, objective: run.task.objective,
        materials: run.task.materials ?? '', constraints: run.task.constraints ?? '', acceptance: run.task.acceptance ?? '',
        signal: run.controller.signal, state: 'queued', handle: null, waiter: null,
        timing: { queuedAt: this.now(), dependencySatisfiedAt: null, dependencyWaitMs: null, schedulingMs: null,
          launchAt: null, launchQueueMs: null, readyAt: null, sessionReadyMs: null, modelReadyAt: null, modelReadyMs: null },
        artifactHistory: [], deliveredArtifacts: new Map(), artifactDeliveries: new Map(), nextArtifact: 0 };
      job.trackSideEffect = (kind, action) => this.track(run, kind, action);
      job.report = (kind, message, wait) => this.report(run, job, kind, message, wait);
      job.onReady = agent => {
        if (!['starting', 'running'].includes(job.state)) return;
        job.handle = agent; job.state = 'running';
        if (job.timing.readyAt !== null) return;
        job.timing.readyAt = this.now(); job.timing.sessionReadyMs = job.timing.readyAt - job.timing.launchAt;
        this.emit(run, 'session-ready', { taskId, role, sessionId, ...job.timing });
      };
      // Only the bridge observing actual model readiness may invoke this.
      job.onModelReady = () => {
        if (!['starting', 'running', 'waiting-help'].includes(job.state) || job.timing.modelReadyAt !== null) return;
        job.timing.modelReadyAt = this.now(); job.timing.modelReadyMs = job.timing.modelReadyAt - job.timing.launchAt;
        this.emit(run, 'model-ready', { taskId, role, sessionId, ...job.timing });
      };
      run.jobs.set(sessionId, job);
    }
    this.schedule(run);
  }
  settleQueued(run, job, state, error) {
    job.state = state;
    job.result = { taskId: job.taskId, role: job.role, agentId: job.sessionId, ok: false, state, error, branch: job.branch };
    run.results.push(job.result);
    this.emit(run, 'branch-end', { taskId: job.taskId, role: job.role, ok: false, state, error, active: run.pending.size });
  }
  schedule(run) {
    if (run.scheduling) { run.reschedule = true; return; }
    run.scheduling = true;
    try {
      do {
        run.reschedule = false;
        const nodes = new Map([...run.jobs.values()].map(job => [job.taskId, job]));
        for (const job of [...run.jobs.values()]) {
          if (job.state !== 'queued') continue;
          if (run.controller.signal.aborted) {
            this.settleQueued(run, job, 'cancelled', messageOf(run.controller.signal.reason));
            run.reschedule = true; continue;
          }
          const evidence = [], failures = [];
          for (const dep of job.dependencies) {
            const source = nodes.get(dep.id);
            if (failedStates.has(source.state)) failures.push(dep.id);
            else if (dep.event === 'artifact' && source.firstArtifact) evidence.push({ id: dep.id, event: dep.event, ...source.firstArtifact });
            else if (dep.event === 'completed' && source.result?.ok) evidence.push({ id: dep.id, event: dep.event, result: source.result });
            else if (source.state === 'completed') failures.push(dep.id);
          }
          if (failures.length) {
            this.settleQueued(run, job, 'blocked', 'dependency unavailable: ' + failures.join(', '));
            run.reschedule = true; continue;
          }
          if (evidence.length !== job.dependencies.length) continue;
          if (job.timing.dependencySatisfiedAt === null) {
            job.timing.dependencySatisfiedAt = this.now();
            job.timing.dependencyWaitMs = job.timing.dependencySatisfiedAt - job.timing.queuedAt;
            job.dependencyMaterials = evidence;
            if (evidence.length) job.materials += '\n\nUPSTREAM_DEPENDENCY_EVIDENCE_JSON\n' + JSON.stringify(evidence);
          }
          if (run.pending.size < this.max) this.startJob(run, job);
        }
      } while (run.reschedule);
    } finally { run.scheduling = false; }
    if (!run.pending.size && !run.inflight.size && ![...run.jobs.values()].some(job => job.state === 'queued') && !run.finishing)
      run.completion = this.finish(run);
  }
  startJob(run, job) {
    job.state = 'starting';
    const scheduledAt = this.now();
    const { taskId, role, sessionId, branch } = job;
    const promise = Promise.resolve().then(async () => {
      const start = this.now(); job.timing.launchAt = start;
      job.timing.launchQueueMs = start - scheduledAt;
      job.timing.schedulingMs = start - job.timing.dependencySatisfiedAt;
      run.launchQueueMs.push({ taskId, role, ms: job.timing.launchQueueMs });
      let result;
      try {
        this.emit(run, 'branch-start', { taskId, role, sessionId, ...job.timing });
        run.controller.signal.throwIfAborted();
        const output = await this.execute(job, run.parent);
        run.controller.signal.throwIfAborted();
        job.state = 'completed'; result = { taskId, role, agentId: sessionId, ok: true, output };
      } catch (error) {
        job.state = run.controller.signal.aborted ? 'cancelled' : 'failed';
        result = { taskId, role, agentId: sessionId, ok: false, error: messageOf(error), branch, checkpoint: job.latestArtifact };
      } finally {
        job.help = null; job.handle = null;
        if (job.waiter) job.waiter.reject(Error('worker finished'));
        run.pending.delete(promise);
      }
      job.result = result; run.results.push(result);
      this.schedule(run);
      this.emit(run, 'branch-end', { taskId, role, ok: result.ok, durationMs: this.now() - start, active: run.pending.size });
      this.tell(run, { kind: result.ok ? 'branch-complete' : 'branch-failed', ...this.outputDelivery(job, result),
        internalOnly: true, reporting: { ...run.reporting }, active: run.pending.size,
        remaining: [...run.jobs.values()].filter(other => liveStates.has(other.state)).length,
        capacity: Math.max(0, this.max - [...run.jobs.values()].filter(other => liveStates.has(other.state)).length) });
    }).finally(() => {
      run.pending.delete(promise); run.inflight.delete(promise);
      this.schedule(run);
    });
    run.pending.add(promise); run.inflight.add(promise);
  }
  async report(run, job, kind, message, wait = false) {
    run.controller.signal.throwIfAborted();
    if (!['progress', 'help', 'artifact'].includes(kind) || typeof message !== 'string' || !message.trim() || message.length > 6000) throw Error('invalid superfast report');
    if (wait && kind !== 'help') throw Error('only help may wait for reply');
    if (job.waiter) throw Error('a help request is already waiting');
    let answer;
    if (kind === 'help') job.help = { message, waiting: wait, revision: run.eventRevision + 1 };
    if (wait) {
      job.state = 'waiting-help';
      answer = new Promise((resolve, reject) => {
        const stop = () => job.waiter?.reject(run.controller.signal.reason);
        const cleanup = () => { run.controller.signal.removeEventListener('abort', stop); job.waiter = null; };
        job.waiter = { resolve: value => { cleanup(); job.state = 'running'; resolve(value); }, reject: error => { cleanup(); reject(error); } };
        run.controller.signal.addEventListener('abort', stop, { once: true });
      });
      answer.catch(() => {});
    }
    if (kind === 'artifact') {
      job.latestArtifact = { message, at: new Date(this.now()).toISOString() };
      job.artifactHistory.push({ ...job.latestArtifact });
      if (job.deliveredArtifacts.has(message)) { this.touch(run); return { accepted: true }; }
      const artifactId = `${job.sessionId}:artifact:${++job.nextArtifact}`;
      job.deliveredArtifacts.set(message, { kind, agentId: job.sessionId, artifactId });
      job.firstArtifact ??= { taskId: job.taskId, agentId: job.sessionId, artifactId, message, at: job.latestArtifact.at };
      this.schedule(run);
      this.tell(run, { kind, taskId: job.taskId, agentId: job.sessionId, role: job.role, message, artifactId,
        internalOnly: true, reporting: { ...run.reporting } });
    } else if (kind === 'help') this.tell(run, { kind, agentId: job.sessionId, role: job.role, message, waiting: wait });
    this.emit(run, kind, { role: job.role, message, waiting: wait });
    return wait ? await answer : { accepted: true };
  }
  wait(parent, id, options = {}) {
    const run = this.require(parent, id);
    const after = options.afterRevision ?? options.after_revision;
    if (after !== undefined && (!Number.isSafeInteger(after) || after < 0)) throw Error('after_revision must be a non-negative integer');
    // Client cursors cannot acknowledge unseen facts, including when far ahead.
    return waitForRun(run, () => this.view(run), { ...options, ready: value => {
      if (value.eventRevision > run.consumedRevision) { run.consumedRevision = value.eventRevision; return 'update'; }
    } }).then(value => {
      run.consumedRevision = Math.max(run.consumedRevision, value.eventRevision);
      if (value.waitReason === 'help') run.consumedHelpRevision = Math.max(run.consumedHelpRevision, value.eventRevision);
      return { ...value, consumedRevision: run.consumedRevision,
        ...(value.pendingHelp.some(help => help.waiting) ? { nextAction: 'reply-required', waitHint: 'Reply to waiting-help before calling wait again.' } : {}) };
    });
  }
  assemble(run) {
    return JSON.stringify({ runId: run.id, status: run.status, results: run.results,
      artifacts: [...run.jobs.values()].flatMap(job => [...job.deliveredArtifacts].map(([message, ref]) => ({ ...ref, role: job.role, message }))),
      artifactHistory: [...run.jobs.values()].map(job => ({ agentId: job.sessionId, role: job.role, reports: job.artifactHistory.slice() })),
      checkpoints: [...run.jobs.values()].filter(job => job.latestArtifact).map(job => ({ agentId: job.sessionId, role: job.role, checkpoint: job.latestArtifact })),
      timings: [...run.jobs.values()].map(job => ({ agentId: job.sessionId, role: job.role, ...job.timing })),
      facts: run.deliveredFacts, timeoutReason: run.timeoutReason ?? null });
  }
  async finish(run) {
    if (run.finishing) return;
    run.finishing = true; run.phase = 'assembling'; run.phases.workersReadyAt = this.now();
    try {
      run.status = run.controller.signal.aborted ? 'cancelled' : run.results.every(result => result.ok) ? 'completed' : 'partial';
      run.summary = this.assemble(run);
      run.endedAt = this.now(); run.phase = 'ready';
      run.phases.readyAt = run.endedAt; run.phases.executionMs = run.phases.workersReadyAt - run.started;
      run.phases.assemblyMs = run.endedAt - run.phases.workersReadyAt;
      run.reporting = { ...run.reporting, phase: 'ready', userSummaryAllowed: true };
      this.emit(run, 'completed', { status: run.status, durationMs: run.endedAt - run.started, phases: { ...run.phases } });
      this.tell(run, { kind: 'run-complete', status: run.status, reporting: { ...run.reporting }, singleReport: true, summaryAvailable: true });
    } catch (error) {
      run.error = messageOf(error); run.status = 'failed'; run.phase = 'ready'; run.endedAt = this.now();
      run.reporting = { ...run.reporting, phase: 'ready', userSummaryAllowed: true };
      this.emit(run, 'failed', { error: run.error });
    } finally {
      clearTimeout(run.idleTimer); clearTimeout(run.hardTimer); run.idleTimer = null; run.hardTimer = null;
      if (this.parents.get(run.parent) === run) this.parents.delete(run.parent);
      for (const check of [...run.listeners]) check();
      const old = [...this.runs.values()].filter(other => other !== run && !this.parents.has(other.parent));
      while (this.runs.size > 30 && old.length) this.runs.delete(old.shift().id);
    }
  }
  async cancel(parent, id, reason = 'superfast run cancelled') {
    const run = this.require(parent, id);
    if (run.status !== 'running') return this.view(run);
    run.controller.abort(Error(reason));
    this.schedule(run);
    await Promise.allSettled([...run.inflight]);
    if (!run.finishing) run.completion = this.finish(run);
    if (run.completion) await run.completion;
    return this.view(run);
  }
  async close() {
    this.closed = true;
    await Promise.allSettled([...this.parents].map(([parent, run]) => this.cancel(parent, run.id)));
    const pending = [...this.sideEffects];
    if (!pending.length) return;
    let timer;
    const drained = await Promise.race([Promise.allSettled(pending).then(() => true),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), this.sideEffectDrainMs); })]);
    clearTimeout(timer);
    if (!drained) for (const run of this.runs.values()) if (run.sideEffects.size) run.drainTimedOut = true;
  }
}