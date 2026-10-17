/**
 * The host-contract check must be measurable without a browser, must not depend on a prefix list
 * anyone keeps in date, and above all must report the direction that actually hurt: a prefix coming
 * back to life. See src/host-contract.js for why that is the dangerous direction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hostContractCheck, modulePrefixesOf, livePrefixesOf, CONTRACT_HOOKS } from '../src/host-contract.js';

const SHEET = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const PREFIXES = [...modulePrefixesOf(SHEET)];
const ALL_HOOKS = CONTRACT_HOOKS.map(hook => hook.sel);

/**
 * A document stand-in. `className` is always a string, the way a real element carries it: handed an
 * array, the classifier reads nothing and every prefix looks dead.
 */
function fakeDoc({ prefixes = [], hooks = ALL_HOOKS, dataset = {} } = {}) {
  const root = { dataset };
  return {
    root,
    doc: {
      documentElement: root,
      querySelectorAll: sel => (sel === '[class]' ? prefixes.map(p => ({ className: `${p}_x cg-rail` })) : []),
      querySelector: sel => (hooks.includes(sel) ? { ok: true } : null)
    }
  };
}

test('the prefixes it measures come from the sheet itself, not from a hardcoded list', () => {
  assert.ok(PREFIXES.length >= 5, `expected several module prefixes, got ${PREFIXES.length}`);
  const raw = new Set([...SHEET.matchAll(/\.([A-Za-z0-9]{5,7})_[A-Za-z]/g)].map(m => m[1]));
  assert.deepEqual(new Set(PREFIXES), raw, 'used must equal the sheet\'s own prefixes');
  assert.deepEqual([...livePrefixesOf(fakeDoc({ prefixes: ['AAAAAA', 'BBBBBB'] }).doc)].sort(), ['AAAAAA', 'BBBBBB']);
});

test('a referenced prefix this host does not emit reads as latent, never as ok', () => {
  // This is exactly the state 0.2.0-rc.2 was in before the band appeared: the wSkVaW_* rules matched
  // nothing and were silent, and the next host release brought the names back.
  const dormant = PREFIXES[0];
  const live = PREFIXES.filter(p => p !== dormant);
  const { doc, root } = fakeDoc({ prefixes: live });
  const result = hostContractCheck(doc, SHEET);
  assert.equal(result.state, 'latent', 'a dormant rule must never read as ok');
  assert.deepEqual(result.latent, [dormant]);
  assert.equal(result.allDead, false);
  assert.equal(root.dataset.cgContract, 'latent');
  assert.equal(root.dataset.cgContractMissing, `${dormant}_`);
});

test('nothing is judged before the host shell has rendered', () => {
  // At activation nothing has mounted yet. Reading that as "every prefix is dead" is how a healthy
  // install would light up the indicator on its first frame.
  const { doc, root } = fakeDoc({ prefixes: [], hooks: [], dataset: { cgContract: 'broken', cgContractMissing: 'stale' } });
  const result = hostContractCheck(doc, SHEET);
  assert.equal(result.skipped, true);
  assert.equal(result.state, 'unknown');
  assert.equal('cgContract' in root.dataset, false, 'no marker while the shell is missing');
  assert.equal('cgContractMissing' in root.dataset, false, 'and the stale one is cleared');
});

test('every prefix dormant at once, with the shell up, reads as broken', () => {
  const { doc } = fakeDoc({ prefixes: ['cg-rail', 'cg-tabs'] });
  const result = hostContractCheck(doc, SHEET);
  assert.equal(result.allDead, true);
  assert.equal(result.state, 'broken');
  assert.equal(result.latent.length, PREFIXES.length);
});

test('a missing mandatory hook is broken even when every prefix is live', () => {
  const { doc, root } = fakeDoc({ prefixes: PREFIXES, hooks: ALL_HOOKS.slice(1) });
  const result = hostContractCheck(doc, SHEET);
  assert.equal(result.latent.length, 0);
  assert.equal(result.state, 'broken');
  assert.deepEqual(result.absent, [ALL_HOOKS[0]]);
  assert.equal(root.dataset.cgContract, 'broken');
});

test('a fully matched host clears the marker and the stale list', () => {
  const { doc, root } = fakeDoc({ prefixes: PREFIXES, dataset: { cgContract: 'broken', cgContractMissing: 'stale' } });
  const result = hostContractCheck(doc, SHEET);
  assert.equal(result.state, 'ok');
  assert.equal(result.latent.length, 0);
  assert.equal(root.dataset.cgContract, 'ok');
  assert.equal('cgContractMissing' in root.dataset, false, 'stale list must be deleted');
});

test('hooks only cover surfaces that must always be there', () => {
  // A hook that exists only during a running turn, or only in the desktop shell, would make a healthy
  // install report itself broken — the exact failure this check must not have.
  for (const hook of CONTRACT_HOOKS) {
    assert.doesNotMatch(hook.sel, /chat-running|title-bar|desktop_chrome/,
      `${hook.sel} is conditional and must not be a mandatory hook`);
  }
});
