import test from 'node:test';
import assert from 'node:assert/strict';
import {FlashCoordinator} from '../src/flash-coordinator.js';

// Superfast is the fast coordinator with max: 8 — same start/add/wait/summary, wider fan-out.
const until = async fn => { for (let n = 0; n < 500; n++) { if (fn()) return; await new Promise(r => setImmediate(r)); } throw Error('condition not reached'); };
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
const branch = (name, write_paths = []) => ({task: name, write_paths});

function coordinator(leaf) {
  return new FlashCoordinator({
    max: 8, notify: async () => {},
    execute: async job => {
      job.onReady?.({id: job.sessionId, steer() {}});
      if (job.kind === 'summary') return 'summary text';
      await leaf.promise;
      return 'ok ' + job.role;
    },
  });
}

test('superfast profile runs eight executors plus one summary agent', async () => {
  const leaf = gate(), parent = {id: 'p'};
  const c = coordinator(leaf);
  try {
    const v = c.start(parent, {objective: 'eight', branches: Array.from({length: 8}, (_, i) => branch('w' + i))});
    assert.equal(v.branches.length, 8);
    assert.equal(v.active, 8);
    assert.equal(v.capacity, 0);
    assert.deepEqual(v.branches.map(b => b.role), ['A', 'B', 'C', 'D', 'W5', 'W6', 'W7', 'W8']);
    leaf.resolve();
    await until(() => !c.parents.has(parent));
    const run = c.require(parent, v.runId);
    assert.equal(run.results.length, 8);
    assert.equal(run.summary, 'summary text');
    assert.equal(run.status, 'completed');
  } finally { leaf.resolve(); await c.close(); }
});

test('superfast profile rejects a ninth executor and allows appending up to eight', async () => {
  const leaf = gate(), parent = {id: 'p2'};
  const c = coordinator(leaf);
  try {
    assert.throws(() => c.start(parent, {objective: 'nine', branches: Array.from({length: 9}, (_, i) => branch('w' + i))}), /two to 8/);
    const v = c.start(parent, {objective: 'four', branches: [branch('a'), branch('b'), branch('c'), branch('d')]});
    const appended = c.add(parent, v.runId, [branch('e'), branch('f'), branch('g'), branch('h')]);
    assert.equal(appended.branches.length, 8);
    assert.throws(() => c.add(parent, v.runId, [branch('i')]), /at most 8/);
    assert.equal(c.require(parent, v.runId).jobs.size, 8);
  } finally { leaf.resolve(); await c.close(); }
});
