import test from 'node:test';
import assert from 'node:assert/strict';
import {SuperfastCoordinator} from '../src/superfast-coordinator.js';

const parent = {id: 'root'};
const b = task => ({task, write_paths: []});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(10); } return false; };
const ready = job => job.onReady({id: job.sessionId, steer() {}});
// A real executor observes the run signal; the test double has to do the same, otherwise an abort
// could never settle `run.completion` and the cancellation would look like a hang.
const abortable = (job, work) => new Promise((resolve, reject) => {
  let settled = false;
  const stop = () => { if (settled) return; settled = true; clearTimeout(timer); reject(job.signal.reason ?? Error('aborted')); };
  const timer = setTimeout(() => { if (settled) return; settled = true; job.signal.removeEventListener('abort', stop); resolve(work); }, 0);
  job.signal.addEventListener('abort', stop, {once: true});
});
function coordinator(options, execute) {
  return new SuperfastCoordinator({notify: async () => {}, record: async () => {}, ...options, execute});
}

test('a run that never reports progress is cancelled by the idle deadline, and the reason says so', async () => {
  const c = coordinator({validationRequired: false, timeoutMs: 120}, async job => {
    ready(job);
    return new Promise((resolve, reject) => job.signal.addEventListener('abort', () => reject(job.signal.reason), {once: true}));
  });
  try {
    const view = c.start(parent, {objective: 'idle', branches: [b('A'), b('B')]});
    const run = c.require(parent, view.runId);
    assert.equal(await until(() => run.status !== 'running'), true, 'the idle deadline never fired');
    assert.equal(run.status, 'cancelled');
    assert.match(run.error, /idle deadline exceeded/);
    assert.ok(run.lastProgressAt >= run.started);
  } finally { await c.close(); }
});

test('periodic progress re-arms the idle window, so a healthy run outlives the window and completes', async () => {
  const c = coordinator({validationRequired: false, timeoutMs: 200}, async job => {
    ready(job);
    for (let i = 0; i < 8; i++) { await sleep(50); await job.report('progress', 'tick ' + i); }
    return 'done ' + job.role;
  });
  try {
    const view = c.start(parent, {objective: 'busy', branches: [b('A'), b('B')]});
    const run = c.require(parent, view.runId);
    await sleep(420);
    assert.equal(run.status, 'running', 'progress did not keep the run alive past the idle window');
    assert.equal(await until(() => run.status !== 'running'), true);
    assert.equal(run.status, 'completed');
    assert.match(run.summary, /done A/);
  } finally { await c.close(); }
});

test('the hard ceiling still cancels a run that keeps reporting progress forever', async () => {
  let ticks = 0;
  const c = coordinator({validationRequired: false, timeoutMs: 5000, hardTimeoutMs: 150}, async job => {
    ready(job);
    const tick = setInterval(() => { if (!job.signal.aborted) { ticks++; job.report('progress', 'tick').catch(() => {}); } }, 30);
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve('slow ' + job.role), 5000);
        job.signal.addEventListener('abort', () => { clearTimeout(timer); clearInterval(tick); reject(job.signal.reason); }, {once: true});
      });
    } finally { clearInterval(tick); }
  });
  try {
    const view = c.start(parent, {objective: 'forever', branches: [b('A'), b('B')]});
    const run = c.require(parent, view.runId);
    assert.equal(await until(() => run.status !== 'running'), true, 'the hard ceiling never fired');
    assert.equal(run.status, 'cancelled');
    assert.match(run.error, /hard deadline exceeded/);
    assert.ok(ticks > 0, 'the test never produced progress, so it did not exercise the hard ceiling');
  } finally { await c.close(); }
});

test('parent acceptance counts as progress and leaves the idle window armed', async () => {
  const c = coordinator({validationRequired: true, timeoutMs: 300}, async job => { ready(job); return 'output ' + job.role; });
  try {
    const view = c.start(parent, {objective: 'accept', branches: [b('A'), b('B')]});
    const run = c.require(parent, view.runId);
    const w = await c.waitRoot(parent, view.runId, {timeoutMs: 3000});
    assert.equal(w.waitReason, 'validation-required');
    const before = run.lastProgressAt;
    await sleep(30);
    c.acceptValidation(run, c.validation(run).revision);
    assert.ok(run.lastProgressAt > before, 'acceptance did not refresh the progress clock');
    assert.equal(await until(() => run.status === 'completed'), true);
  } finally { await c.close(); }
});

test('the view exposes both clocks and how much time is left on each', async () => {
  const c = coordinator({validationRequired: false, timeoutMs: 60000, hardTimeoutMs: 120000}, async job => { ready(job); return 'x'; });
  try {
    const view = c.start(parent, {objective: 'clocks', branches: [b('A'), b('B')]});
    assert.equal(view.deadline.idleTimeoutMs, 60000);
    assert.equal(view.deadline.hardTimeoutMs, 120000);
    assert.ok(view.deadline.idleRemainingMs > 0 && view.deadline.idleRemainingMs <= 60000);
    assert.ok(view.deadline.hardRemainingMs > 0 && view.deadline.hardRemainingMs <= 120000);
  } finally { await c.close(); }
});
