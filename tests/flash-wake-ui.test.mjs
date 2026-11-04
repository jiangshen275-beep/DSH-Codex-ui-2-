import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
const start = source.indexOf('// ---- Flash wake presentation:');
const end = source.indexOf('// ---- End flash wake presentation. ----', start);
assert.ok(start >= 0 && end > start, 'flash wake helpers must remain extractable');
// Exercise the shipped helpers, without importing the browser-only plugin or copying its predicate.
const { isFlashWakeNode, registerFlashWakeFilters } = new Function('h', `${source.slice(start, end)}\nreturn { isFlashWakeNode, registerFlashWakeFilters };`)(
  (type, props) => ({ type, props })
);
const wakeSource = { kind: 'plugin:dsh-codex-ui:flash-wake', form: 'instructions' };
const nodeOf = (source, kind = 'turn-trigger') => ({ kind, data: { source } });

function fixture(keys = ['turn-trigger', 'context']) {
  const natives = keys.map(key => ({
    options: { name: 'conversation.chat.node', key, priority: key === 'context' ? -20 : 0, scope: 'session', children: { nested: { kind: 'single' } } },
    // A React.memo-shaped object deliberately cannot be called as a function.
    component: key === 'context' ? { $$typeof: Symbol.for('react.memo'), type() {} } : function NativeTrigger() {},
    inject: () => ({ hooks: { retained: true } }),
    store: { [key]: true },
    locale: { namespace: key }
  }));
  const registered = [];
  const pending = [];
  const ctx = { slots: {
    entries(name) { assert.equal(name, 'conversation.chat.node'); return natives; },
    register(options, component) {
      const entry = { options, component };
      registered.push(entry);
      return entry;
    }
  } };
  registerFlashWakeFilters(ctx, (name, factory) => {
    assert.equal(name, 'conversation.chat.node');
    pending.push(factory);
  });
  return { ctx, natives, registered, pending, mount() { return pending.map(factory => factory()); } };
}

test('only the exact durable flash-wake instructions source matches', () => {
  for (const key of ['turn-trigger', 'context']) assert.equal(isFlashWakeNode(nodeOf(wakeSource, key)), true);
  for (const kind of ['user', 'agent', 'schedule', 'subagent', 'job', 'request', 'plugin:other:flash-wake', 'plugin:dsh-codex-ui:flash-wake-extra']) {
    assert.equal(isFlashWakeNode(nodeOf({ kind, form: 'instructions' })), false, kind);
  }
  for (const form of [undefined, null, '', 'notice', 'Instructions']) {
    assert.equal(isFlashWakeNode(nodeOf({ ...wakeSource, form })), false, String(form));
  }
  for (const node of [undefined, null, {}, { data: null }, { data: {} }, nodeOf(null), nodeOf('flash-wake'), { source: wakeSource }, { data: { form: 'instructions', source: { kind: wakeSource.kind } } }]) {
    assert.equal(isFlashWakeNode(node), false);
  }
});

test('both native keyed slots are wrapped lazily with their service contracts intact', () => {
  const f = fixture();
  assert.equal(f.registered.length, 0, 'native lookup waits for slot injection');
  assert.equal(f.pending.length, 2);
  f.mount();
  assert.equal(f.registered.length, 2);
  for (const entry of f.registered) {
    const native = f.natives.find(item => item.options.key === entry.options.key);
    for (const field of ['inject', 'store', 'locale']) assert.equal(entry.options[field], native[field], field);
    for (const field of ['name', 'key', 'scope', 'children']) assert.equal(entry.options[field], native.options[field], field);
    assert.ok(entry.options.priority < native.options.priority);
    assert.equal(entry.component({ node: nodeOf(wakeSource, native.options.key) }), null);
  }
});

test('all other source rows delegate unchanged through native React elements', () => {
  const f = fixture();
  f.mount();
  for (const entry of f.registered) {
    const native = f.natives.find(item => item.options.key === entry.options.key);
    for (const source of [{ kind: 'agent', form: 'instructions' }, { kind: 'schedule', form: 'instructions' }, { kind: 'user' }, { ...wakeSource, form: 'notice' }, { kind: 'plugin:other:flash-wake', form: 'instructions' }]) {
      const props = { node: nodeOf(source, entry.options.key), t: () => 'translated', useStore() {}, actions: {} };
      const rendered = entry.component(props);
      assert.equal(rendered.type, native.component);
      assert.equal(rendered.props, props);
    }
  }
});

test('missing native slots preserve the host fallback rather than install an empty renderer', () => {
  const f = fixture([]);
  assert.deepEqual(f.mount(), [undefined, undefined]);
  assert.equal(f.registered.length, 0);
});

test('activation installs the filters through the existing safe mountSlot boundary', () => {
  assert.match(source, /registerFlashWakeFilters\(ctx, mountSlot\);/);
});
