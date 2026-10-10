// End-to-end smoke test for the built client artifact.
//
// The bundle is not a module: it is a `window.__ModuleLoader__.load({ id, factory })`
// call whose factory needs React and returns `{ apply, inject, registerModelUI }`. This
// test runs that exact artifact against a small DOM stub and a scripted React shim,
// then renders the model control 鈥?the only way to catch a render-time crash or a
// wrong slider position that `node --check` cannot see.
//
// Keep this file ASCII-only: it may be rewritten by Windows PowerShell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createReactShim, assignRefs, runEffects } from './react-shim.mjs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BUNDLE = join(ROOT, 'lib', 'client.js');
const REAL_EFFORTS = [{ id: 'low' }, { id: 'medium' }, { id: 'high' }];

function makeElement(tag) {
  const element = {
    tagName: tag, children: [], attributes: {}, dataset: {}, textContent: '', className: '',
    style: { setProperty() {} },
    append(...nodes) { element.children.push(...nodes); },
    appendChild(node) { element.children.push(node); },
    remove() {}, focus() {},
    setAttribute(name, value) { element.attributes[name] = value; },
    getAttribute(name) { return element.attributes[name]; },
    // The bundle reads `data-chatgpt-ui` off <html> before setting it, so the stub has to answer
    // the question rather than only accept the write.
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(element.attributes, name); },
    toggleAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    contains() { return false; },
  };
  return element;
}

/** Register the artifact; the passed shim is the React table the bundle will use. */
function loadBundle(react = createReactShim(), storage = null, windowExtras = null) {
  // Document listeners are recorded rather than swallowed: dismissal behaviour (a menu closing on a
  // click outside) is only observable if a test can deliver the event the plugin subscribed to.
  const listeners = new Map();
  const document = {
    nodeType: 1, documentElement: makeElement('html'), head: makeElement('head'), body: makeElement('body'),
    createElement: makeElement,
    createElementNS: (_namespace, tag) => makeElement(tag),
    getElementById: () => null,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type, event) { for (const handler of [...(listeners.get(type) ?? [])]) handler(event); },
    listenerCount: type => (listeners.get(type) ?? []).length,
    querySelector: () => null, querySelectorAll: () => [],
  };
  const runtime = {
    window: { __ModuleLoader__: { load: entry => { runtime.entry = entry; } } },
    document,
    requestAnimationFrame: callback => { callback(); return 1; },
    cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} },
    // The bundle keeps a one-second style watch alive. A real timer would hold Node's event loop
    // open, so the suite would print every result and then never exit — the stub keeps the code
    // path exercised without owning the process.
    setInterval: () => 0,
    clearInterval: () => {},
  };
  if (storage) runtime.window.localStorage = storage;
  if (windowExtras) Object.assign(runtime.window, windowExtras);
  runtime.window.document = document;
  const keys = Object.keys(runtime);
  new Function(...keys, readFileSync(BUNDLE, 'utf8'))(...keys.map(key => runtime[key]));
  assert.equal(runtime.entry?.id, 'dsh-codex-ui', 'bundle must register under the package id');
  react.document = document;
  react.moduleExports = runtime.entry.factory(name => {
    if (name === 'react') return react;
    throw new Error(`unexpected require(${name})`);
  });
  return react;
}

/** useState order: open, pane, query, draftIndex, actionError, lightning, ultraFlag, turboReady, budget, ultraNotice, aliases, aliasEditor. Every mount must supply all twelve. */
const CLOSED_DISARMED = [false, 'effort', '', null, null, false, false, true, { value: 15, exact: true }, false, {}, null];
const CLOSED_ARMED = [false, 'effort', '', null, null, true, false, true, { value: 15, exact: true }, false, {}, null];
const OPEN_AT_MAX = [true, 'effort', '', null, null, false, true, true, { value: 15, exact: true }, false, {}, null];
const OPEN_ULTRA_LIGHTNING = [true, 'effort', '', null, null, true, true, true, { value: 15, exact: true }, false, {}, null];
const OPEN_REAL_TIER = [true, 'effort', '', null, null, false, false, true, { value: 15, exact: true }, false, {}, null];

function modelStore(effort = 'high') {
  return {
    groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'deepseek-chat', reasoning: { efforts: REAL_EFFORTS, defaultEffort: 'medium' } }] }],
    current: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: effort },
    pending: null, status: 'ready', failures: [], retainedEffort: null,
  };
}

/** Mount the control: returns one render plus a `rerender` that keeps the same React
 *  state queue, so an event handler can be read from the render that follows it. */
function mountControl(states, store = modelStore(), refs = {}, options = {}) {
  const noop = () => {};
  const selections = [];
  const calls = options.calls ?? [];
  const memory = new Map(Object.entries(options.memory ?? {}).map(([key, value]) => [key, JSON.stringify(value)]));
  const storage = {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, value); },
  };
  let captured = null;
  const shim = createReactShim(states, { refs, writableSlots: options.writableSlots });
  const bundle = loadBundle(shim, storage);
  const moduleExports = bundle.moduleExports;
  const doc = bundle.document;
  const slots = {
    inject: (key, callback) => { if (key === 'conversation.input.model') callback(); return noop; },
    entries: () => [], entriesOfSlot: () => [],
    register: (options2, component) => { captured = { options: options2, component }; return noop; },
  };
  const directory = { subscribe: () => noop, getSnapshot: () => store };
  // `turboRequest` uses the plugin context, so the carrier has to exist there too.
  const connection = {
    rpc: {
      call: async (_path, _method, payload) => {
        calls.push(payload);
        // `options.read` may be a function, so a test can model the Host answering
        // differently once the component has pushed a change.
        const answered = typeof options.read === 'function' ? options.read() : options.read;
        return payload.action === 'read'
          ? { ok: true, value: answered ?? { lightning: false, ultra: false, tokenMultiple: 15, tokenExact: true } }
          : { ok: true, value: {} };
      },
    },
  };
  moduleExports.registerModelUI({
    slots,
    connection,
    inject: (_deps, callback) => {
      callback({
        slots,
        connection,
        modelDirectories: { directoryFor: () => ({ store: directory }) },
        sessions: { subagentAddress: () => undefined },
      });
      return noop;
    },
  });
  assert.ok(captured, 'the model slot must be registered');
  assert.equal(captured.options.name, 'conversation.input.model');

  const hook = () => () => undefined;
  const sessions = selector => selector(options.blank === true ? { byId: { 'session-1': { blank: true } } } : { byId: {} });
  const render = () => captured.component({
    locked: false, available: true, sessionId: 'session-1',
    // The directory is a store: a selection has to change what the next snapshot reports,
    // otherwise the component would be reacting to a frozen world.
    directory, load: noop, select: selection => { selections.push(selection); if (typeof selection?.reasoningEffort === 'string' && store.current) store.current.reasoningEffort = selection.reasoningEffort; return Promise.resolve({ ok: true }); },
    useResource: hook(), useWorkspaces: hook(), usePanelInfo: hook(), useSessions: sessions,
    useSessionStatus: hook(), useSessionRetainInfo: hook(), useChat: hook(), useConversation: hook(),
    useInput: () => ({ actions: {} }), inputActions: {}, useSession: hook(),
    useProjection: hook(), useTrajectory: hook(),
  });
  // The shim records effects instead of running them and creates fresh ref handles per
  // render, so the commit order is explicit: begin a render, render, attach the test's
  // ref values to that render's handles, then run that render's effects.
  const rerender = run => {
    shim.beginRender();
    const tree = render();
    assignRefs(shim, refs);
    if (run !== false) runEffects(shim);
    return tree;
  };
  const element = rerender();
  return { element, rerender, selections, shim, document: doc, memory };
}

/** Depth-first walk over the element tree produced by the shim. */
function collect(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { for (const child of node) collect(child, predicate, found); return found; }
  if (node.__element) {
    predicate(node, found);
    collect(node.props?.children, predicate, found);
  }
  return found;
}

function byClass(tree, value) {
  return collect(tree, (node, found) => { if (node.props?.className === value) found.push(node); });
}

/** Every string in the element tree, flattened for substring assertions. */
function treeText(tree) {
  const parts = [];
  const walk = node => {
    if (typeof node === 'string') { parts.push(node); return; }
    if (typeof node === 'number') { parts.push(String(node)); return; }
    if (Array.isArray(node)) { for (const child of node) walk(child); return; }
    if (node && typeof node === 'object' && node.__element) walk(node.props?.children);
  };
  walk(tree);
  return parts.join(' ');
}

test('built client artifact registers and exposes apply/inject/registerModelUI', () => {
  const react = loadBundle();
  assert.equal(typeof react.moduleExports.apply, 'function');
  assert.equal(typeof react.moduleExports.registerModelUI, 'function');
  assert.ok(Array.isArray(react.moduleExports.inject));
  assert.ok(react.moduleExports.inject.includes('slots'));
  assert.ok(react.moduleExports.inject.includes('connection'));
});

test('closed control shows the bolt marker only while the orchestrator is armed', () => {
  const disarmed = mountControl(CLOSED_DISARMED).element;
  assert.equal(byClass(disarmed, 'cg-model-trigger').length, 1, 'exactly one trigger');
  assert.equal(byClass(disarmed, 'cg-model-trigger-bolt').length, 0, 'no bolt marker while disarmed');

  const armed = mountControl(CLOSED_ARMED).element;
  assert.equal(byClass(armed, 'cg-model-trigger-bolt').length, 1, 'bolt marker while armed');
});

test('open control renders the clickable switch, the Ultra track and the flags row', () => {
  // useRef creation order is source order: root, trigger, popup, focusPending, effortQueue,
  // effortSaving, effortTarget, meteorShell, meteorField, lightning, ultraSent. So the
  // track shell is handle 7 and the meteor field is handle 8.
  const shell = { clientWidth: 232 };
  const field = { style: { setProperty(name, value) { this[name] = value; } } };
  const open = mountControl(OPEN_ULTRA_LIGHTNING, modelStore(), { 7: shell, 8: field }).element;
  const switches = byClass(open, 'cg-model-zap');
  assert.equal(switches.length, 1, 'the top-left bolt must be a real button');
  assert.equal(switches[0].type, 'button');
  assert.equal(switches[0].props['data-on'], true, 'armed state must reach the DOM');
  assert.equal(switches[0].props['aria-pressed'], true);
  assert.equal(typeof switches[0].props.onClick, 'function', 'the switch must be clickable');
  assert.equal(switches[0].props.disabled, false);

  const track = byClass(open, 'cg-model-slider')[0];
  assert.equal(track.props.max, 3, 'three real efforts plus one appended Ultra step');
  assert.equal(track.props.value, 3, 'the Ultra switch pins the track on the appended step');
  assert.equal(track.props['aria-valuetext'], 'Ultra');
  assert.equal(byClass(open, 'cg-model-meteor').length, 11, 'Ultra arms the dense meteor field');
  assert.equal(byClass(open, 'cg-model-thumb').length, 1);
  // The status line that used to sit under the track is gone; the cost figure now lives only
  // in the lightning switch's tooltip.
  assert.equal(byClass(open, 'cg-model-flags').length, 0, 'no status row under the track');
  assert.match(treeText(open), /\d+\s*[x\u00d7]\s*token/i, 'the token multiplier is still stated, in the switch tooltip');
  // A meteor travels a measured pixel distance: `translateX(100%)` would resolve
  // against the meteor's own width and stop the shower halfway along the rail.
  assert.equal(field.style['--cg-meteor-travel'], '268px', 'travel must be the measured track width plus slack');
});

test('the cost line follows the multiplier the Host reports', () => {
  const permissive = mountControl([true, 'effort', '', null, null, true, false, true, { value: 4, exact: true }, false, {}, null]).element;
  assert.match(treeText(permissive), /4\s*[x\u00d7]\s*token/i, 'a different multiplier must be shown as-is');

  const inexact = mountControl([true, 'effort', '', null, null, true, false, true, { value: 15, exact: false }, false, {}, null]).element;
  assert.match(treeText(inexact), /15\s*[x\u00d7]\s*token/i, 'the fallback figure still shows');

  const disarmed = mountControl(OPEN_REAL_TIER).element;
  // The figure now lives only in the switch's tooltip, which explains itself in both states.
  assert.match(treeText(disarmed), /开启后每轮至少并发 2 个子代理/, 'the disarmed switch still explains itself');
  assert.doesNotMatch(treeText(disarmed), /已开启/, 'and does not claim to be armed');
});

test('a stored maximum without the Ultra switch stays on the real maximum', () => {
  const open = mountControl(OPEN_REAL_TIER).element;
  const track = byClass(open, 'cg-model-slider')[0];
  assert.equal(track.props.value, 2, 'the real maximum is a distinct position from Ultra');
  assert.notEqual(track.props['aria-valuetext'], 'Ultra', 'no Ultra label without the switch');
  assert.equal(track.props['aria-valuetext'], 'High', 'tier labels are the English menu words');
  assert.equal(byClass(open, 'cg-model-meteor').length, 0, 'no meteor field outside Ultra');
});

test('dragging onto the Ultra step writes the highest real effort, never an ultra id', async () => {
  // Start below the maximum, so reaching Ultra genuinely has to write the top tier.
  const { rerender, selections } = mountControl(OPEN_REAL_TIER, modelStore('low'));
  const before = byClass(rerender(), 'cg-model-slider')[0];
  // React re-renders between the two events, so the change handler updates the shim's
  // draft slot and the pointer-up handler is read off the render that follows it.
  before.props.onChange({ target: { value: '3' } });
  const after = byClass(rerender(), 'cg-model-slider')[0];
  assert.equal(after.props.value, 3, 'the drag preview reaches the appended Ultra step');
  assert.equal(after.props['aria-valuetext'], 'Ultra');
  await after.props.onPointerUp({ currentTarget: { value: '3' } });
  assert.equal(selections.length, 1, 'exactly one directory write');
  assert.deepEqual(selections[0], { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' });
});

test('an effort already at the maximum is not rewritten when Ultra is pinned', async () => {
  const { rerender, selections } = mountControl(OPEN_REAL_TIER);
  const track = byClass(rerender(), 'cg-model-slider')[0];
  await track.props.onPointerUp({ currentTarget: { value: '3' } });
  assert.equal(selections.length, 0, 'the directory already holds the top tier');
});

test('a model with a real ultra effort keeps the directory id in the slider', () => {
  const store = modelStore('ultra');
  store.groups[0].models[0].reasoning = { efforts: [...REAL_EFFORTS, { id: 'ultra', name: 'Ultra' }], defaultEffort: 'medium' };
  const open = mountControl(OPEN_AT_MAX, store).element;
  const track = byClass(open, 'cg-model-slider')[0];
  assert.equal(track.props.max, 3, 'the real ultra level is used as-is, with no appended step');
  assert.equal(track.props['aria-valuetext'], 'Ultra');
  assert.equal(byClass(open, 'cg-model-meteor').length, 11);
});

test('a blank conversation adopts the switches the user last used', async () => {
  const calls = [];
  const memory = { 'dsh-codex-ui/composer-switches': { lightning: true, ultra: true } };
  // The mount state is before the first Host read: nothing is armed and the switches are
  // not ready yet, so only the read can turn them on. Lightning / Ultra / readiness are
  // the only slots the read is allowed to write, which is what a real re-render does.
  const beforeRead = [false, 'effort', '', null, null, false, false, false, { value: 15, exact: true }, false, {}, null];
  const writableSlots = [5, 6, 7];
  const { rerender } = mountControl(beforeRead, modelStore('medium'), {}, { blank: true, calls, memory, writableSlots });
  // The read resolves on a later microtask, so settle it, then let the sync effects run.
  await new Promise(resolve => setTimeout(resolve, 0));
  rerender();
  await new Promise(resolve => setTimeout(resolve, 0));
  rerender();
  const updates = calls.filter(call => call.action === 'update');
  assert.ok(updates.some(call => call.lightning === true), 'Lightning is armed for the new conversation');
  assert.ok(updates.some(call => call.ultra === true), 'the Ultra pin is armed for the new conversation');
  assert.ok(!updates.some(call => call.lightning === false || call.ultra === false), 'nothing is disarmed on the way in');
});

test('a running conversation never adopts the remembered switches', async () => {
  const calls = [];
  const memory = { 'dsh-codex-ui/composer-switches': { lightning: true, ultra: true } };
  const beforeRead = [false, 'effort', '', null, null, false, false, false, { value: 15, exact: true }, false, {}, null];
  const { rerender } = mountControl(beforeRead, modelStore('medium'), {}, { blank: false, calls, memory, writableSlots: [5, 6, 7] });
  await new Promise(resolve => setTimeout(resolve, 0));
  rerender();
  // The shim recreates refs per render, so the sync effect re-runs where React would have
  // skipped it; what must never happen is a running conversation arming a switch.
  const updates = calls.filter(call => call.action === 'update');
  assert.ok(!updates.some(call => call.lightning === true || call.ultra === true), 'only a blank session inherits them');
});

/** The shell carries the ramp hooks: which tier is shown, and its 0..4 depth bucket. */
function shellOf(states, store) {
  const open = mountControl(states, store).element;
  return byClass(open, 'cg-model-slider-shell')[0];
}

test('the fill deepens with the tier instead of only changing at Ultra', () => {
  const low = shellOf(OPEN_REAL_TIER, modelStore('low'));
  assert.equal(low.props['data-effort'], 'low');
  assert.equal(low.props['data-depth'], 0, 'the bottom tier is the shallowest stop');
  assert.equal(low.props['data-ultra'], false);

  const medium = shellOf(OPEN_REAL_TIER, modelStore('medium'));
  assert.equal(medium.props['data-effort'], 'medium');
  assert.equal(medium.props['data-depth'], 1);

  const high = shellOf(OPEN_REAL_TIER, modelStore('high'));
  assert.equal(high.props['data-effort'], 'high');
  assert.equal(high.props['data-depth'], 3, 'the highest real tier sits well down the ramp');
  assert.equal(high.props['data-max'], false, 'only the top position is the maximum');
});

test('the Max label is tinted through the same tier hook as the ramp', () => {
  const store = modelStore('xhigh');
  store.groups[0].models[0].reasoning = { efforts: [...REAL_EFFORTS, { id: 'xhigh' }], defaultEffort: 'medium' };
  const open = mountControl(OPEN_REAL_TIER, store).element;
  const root = byClass(open, 'cg-model-root')[0];
  const popover = byClass(open, 'cg-model-popover')[0];
  const triggerEffort = byClass(open, 'cg-model-trigger-effort')[0];
  assert.equal(root.props['data-effort'], 'xhigh', 'the composer label can be tinted from the root');
  assert.equal(popover.props['data-effort'], 'xhigh', 'the popover headline can be tinted from the popover');
  assert.equal(triggerEffort.props['data-effort'], 'xhigh');
  assert.equal(triggerEffort.props['data-ultra'], false);
  // Ultra must stay on its own colour, not inherit the Max tint.
  const ultra = mountControl(OPEN_AT_MAX, store).element;
  assert.equal(byClass(ultra, 'cg-model-root')[0].props['data-effort'], 'ultra');
  assert.equal(byClass(ultra, 'cg-model-trigger-effort')[0].props['data-ultra'], true);
});

test('the Ultra fill outranks the depth bucket, so its purple gradient survives', () => {
  // The bar is styled in CSS, so the probe cannot judge the painted result; what it can pin
  // is the precedence rule that already broke once — the top position is also depth 4.
  // The CSS is embedded inside a JS string, so unescape the quotes before searching it.
  const css = readFileSync(BUNDLE, 'utf8').replace(/\\"/g, '"');
  const depth = css.indexOf('[data-depth="4"] .cg-model-slider-fill');
  const ultra = css.indexOf('[data-effort="ultra"] .cg-model-slider-fill');
  assert.ok(depth > -1 && ultra > -1, 'both rules ship in the artifact');
  assert.ok(ultra > depth, 'the Ultra rule must be declared after the depth buckets');
  const rule = css.slice(ultra, css.indexOf('}', ultra));
  assert.match(rule, /#3f57c4 0%/, 'the bar still opens on the short blue lead-in');
  assert.match(rule, /#6f5ff2 12%/, 'the blue stretch stays small');
  assert.match(rule, /#bb74ff 100%/, 'the right end stays the bright purple');
  assert.doesNotMatch(rule, /var\(--cg-e4\)\s*;/, 'Ultra must not fall back to the flat depth colour');
  // The drifting shade is its own element, with radii of exactly half its box: a sized
  // background layer would end mid-falloff and paint a seam down each side.
  const shade = css.slice(css.indexOf('.cg-model-slider-fill::after'), css.indexOf('}', css.indexOf('.cg-model-slider-fill::after')));
  assert.match(shade, /radial-gradient\(ellipse 50% 50% at 50% 50%, #4c1d95e6/, 'the falloff reaches zero before the element edge');
  assert.match(shade, /#4c1d9500 100%/, 'the shade ends fully transparent');
  assert.match(shade, /animation: cg-model-ultra-drift 12s/, 'the shade drifts slowly');
  assert.doesNotMatch(shade, /background-size/, 'the shade must not be a sized layer again');
  const keyframes = css.slice(css.indexOf('@keyframes cg-model-ultra-drift'), css.indexOf('@keyframes cg-model-ultra-drift') + 200);
  assert.match(keyframes, /from \{ transform: translateX\(11%\)/, 'the float starts short of the blue lead-in');
  assert.match(keyframes, /to \{ transform: translateX\(50%\)/, 'and ends short of the bright right end');
  assert.doesNotMatch(keyframes, /background-position/, 'the drift moves the element, not a background');
});

test('landing on Ultra swaps the tier name for the cost notice, then restores it', async () => {
  // The drag path is the move that fires it; Ultra / draft / notice are the slots a real
  // render may write, so the pin survives the release the same way it does in the app.
  // The read answers "pinned", which is what the app would have settled on before a drag and
  // what keeps the probe's repeated reads from fighting the pin.
  const read = { lightning: false, ultra: true, tokenMultiple: 15, tokenExact: true };
  const { rerender } = mountControl(OPEN_REAL_TIER, modelStore('medium'), {}, { writableSlots: [3, 6, 9], read });
  const summary = tree => byClass(tree, 'cg-model-summary')[0].props.children[0];
  assert.equal(summary(rerender()).props.children, 'Medium', 'the tier name stands while the tier is not Ultra');
  // Let the first read settle first: in the app it lands long before anyone drags, and it
  // adopts the Host's answer for this session.
  await new Promise(resolve => setTimeout(resolve, 0));
  rerender();

  byClass(rerender(), 'cg-model-slider')[0].props.onChange({ target: { value: '3' } });
  // The move itself announces it: while the drag is still held, before any release handler.
  const previewing = byClass(rerender(), 'cg-model-popover')[0];
  assert.equal(previewing.props['data-notice'], true, 'the notice fires from the drag, not the release');
  const track = byClass(rerender(), 'cg-model-slider')[0];
  await track.props.onPointerUp({ currentTarget: { value: '3' } });

  const noticed = summary(rerender());
  assert.equal(noticed.props.children, '更快消耗 Token');
  assert.equal(noticed.props['data-notice'], true);
  assert.equal(byClass(rerender(), 'cg-model-trigger-effort')[0].props['data-notice'], true, 'the composer label carries it too');
  // The popover marks the moment so the three controls can stand down while it lasts; they
  // stay mounted, because unmounting them would collapse the row and jump the popover.
  const popover = byClass(rerender(), 'cg-model-popover')[0];
  assert.equal(popover.props['data-notice'], true);
  assert.equal(byClass(rerender(), 'cg-model-ultra-notice')[0].props.children, '更快消耗 Token');
  assert.equal(byClass(rerender(), 'cg-model-zap').length, 1, 'the lightning switch is still mounted');
  assert.equal(byClass(rerender(), 'cg-model-summary').length, 1, 'the model switch is still mounted');
  assert.equal(byClass(rerender(), 'cg-model-reset').length, 1, 'the reset control is still mounted');

  await new Promise(resolve => setTimeout(resolve, 1700));
  const restored = summary(rerender());
  assert.equal(restored.props.children, 'Ultra', 'the tier name comes back on its own');
  assert.equal(restored.props['data-notice'], false);
  assert.equal(byClass(rerender(), 'cg-model-popover')[0].props['data-notice'], false, 'and the controls come back');
  assert.equal(byClass(rerender(), 'cg-model-ultra-notice')[0].props.children, '');
});

test('releasing without previewing Ultra announces nothing', async () => {
  // The release paths run chooseLevel; a notice there announced twice (pointerup, then the
  // blur that follows), which is the bug this pins down.
  const { rerender } = mountControl(OPEN_REAL_TIER, modelStore('medium'), {}, { writableSlots: [3, 6, 9] });
  await new Promise(resolve => setTimeout(resolve, 0));
  rerender();
  await byClass(rerender(), 'cg-model-slider')[0].props.onPointerUp({ currentTarget: { value: '3' } });
  rerender();
  assert.equal(byClass(rerender(), 'cg-model-popover')[0].props['data-notice'], false, 'release alone must not announce');
  assert.equal(byClass(rerender(), 'cg-model-ultra-notice')[0].props.children, '');
});

test('an armed bolt is a rounded gradient bolt ringed by sparkles', () => {
  const armed = mountControl(OPEN_ULTRA_LIGHTNING, modelStore(), { 7: { clientWidth: 232 }, 8: { style: { setProperty() {} } } });
  const glyph = byClass(armed.element, 'cg-model-zap-glyph')[0];
  assert.match(glyph.props.fill, /url\(#cg-bolt-deep\)/, 'the bolt is filled with the shared gradient');
  assert.equal(glyph.props.strokeLinejoin, 'round', 'the joins are rounded');
  assert.equal(glyph.props.strokeLinecap, 'round');
  assert.equal(glyph.props.children.length, 4, 'the glyph is the bolt path plus three sparkles');
  // Armed, the bolt shows twice: the popover's switch and the composer's marker.
  assert.equal(byClass(armed.element, 'cg-bolt-star').length, 6, 'three sparkles ride with each bolt');
  assert.equal(byClass(armed.element, 'cg-model-trigger-bolt').length, 1, 'the composer marker is armed too');
  // The gradient definition is mounted once in the document and matches the ramp's deep end.
  const defs = armed.document.body.children.find(child => child.tagName === 'svg');
  const gradient = defs.children[0].children[0];
  assert.equal(gradient.attributes.id, 'cg-bolt-deep');
  assert.deepEqual(gradient.children.map(stop => stop.attributes['stop-color']), ['#4c1d95', '#8a4ff0', '#bb74ff']);
  assert.equal(gradient.children.some(stop => stop.tagName === 'animate'), false, 'the gradient is static, not a moving streak');

  // Disarmed, the same glyph stays a plain outline in the button's own colour.
  const off = mountControl(OPEN_REAL_TIER).element;
  const outline = byClass(off, 'cg-model-zap-glyph')[0];
  assert.equal(outline.props.fill, 'none');
  assert.equal(outline.props.stroke, 'currentColor');
  assert.equal(byClass(off, 'cg-bolt-star').length, 0, 'no sparkles while it is off');
});

test('reset leaves Ultra as well as restoring the default effort', async () => {
  // This is the bug that made reset look dead: it wrote the directory effort but left the
  // Ultra pin, and the track position follows the pin, so the bar never moved.
  const calls = [];
  // The Host answers "pinned" once, then agrees with the reset the component pushes.
  let reads = 0;
  const read = () => { reads += 1; return { lightning: false, ultra: reads === 1, tokenMultiple: 15, tokenExact: true }; };
  const { rerender, selections } = mountControl(OPEN_AT_MAX, modelStore('high'), {}, { writableSlots: [3, 6, 9], calls, read });
  await new Promise(resolve => setTimeout(resolve, 0));
  rerender();
  const before = byClass(rerender(), 'cg-model-slider')[0];
  assert.equal(before.props.value, 3, 'Ultra pins the track on the appended step');
  assert.equal(byClass(rerender(), 'cg-model-slider-shell')[0].props['data-effort'], 'ultra');

  byClass(rerender(), 'cg-model-reset')[0].props.onClick();
  rerender();
  await new Promise(resolve => setTimeout(resolve, 0));
  const after = byClass(rerender(), 'cg-model-slider')[0];
  assert.equal(after.props.value, 1, 'the track returns to the directory default');
  assert.equal(after.props['aria-valuetext'], 'Medium');
  assert.equal(byClass(rerender(), 'cg-model-slider-shell')[0].props['data-effort'], 'medium');
  assert.deepEqual(selections, [{ provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'medium' }]);
  assert.ok(calls.some(call => call.action === 'update' && call.ultra === false), 'the Host is told to drop Ultra');
});

test('the notice CSS stands the three controls down while it shows', () => {  const css = readFileSync(BUNDLE, 'utf8').replace(/\\"/g, '"');
  for (const control of ['cg-model-zap', 'cg-model-summary', 'cg-model-reset']) {
    const selector = `.cg-model-popover[data-notice="true"] .${control}`;
    const at = css.indexOf(selector);
    assert.ok(at > -1, `${control} must be faded out by the notice state`);
    assert.match(css.slice(at, css.indexOf('}', at)), /visibility: hidden/, `${control} must stop taking clicks too`);
  }
  const notice = css.slice(css.indexOf('.cg-model-popover[data-notice="true"] .cg-model-ultra-notice'), css.indexOf('}', css.indexOf('.cg-model-popover[data-notice="true"] .cg-model-ultra-notice')));
  assert.match(notice, /opacity: 1/);
  assert.match(notice, /visibility: visible/);
});

test('each dot says whether the fill has reached it', () => {
  const open = mountControl(OPEN_REAL_TIER, modelStore('medium')).element;
  const dots = byClass(open, 'cg-model-slider-dots')[0].props.children;
  assert.deepEqual(dots.map(dot => dot.props['data-on']), [true, true, false, false], 'two reached, two still ahead');
  const atTop = mountControl(OPEN_AT_MAX, modelStore('high')).element;
  const dotsAtTop = byClass(atTop, 'cg-model-slider-dots')[0].props.children;
  assert.deepEqual(dotsAtTop.map(dot => dot.props['data-on']), [true, true, true, true]);
  assert.equal(dotsAtTop[3].props['data-ultra'], true, 'the appended step is the Ultra dot');
});

test('Max carries the purple end and no shower; Ultra keeps the shower', () => {
  // A model whose own top tier is xhigh: reaching it is Max, not Ultra.
  const store = modelStore('xhigh');
  store.groups[0].models[0].reasoning = {
    efforts: [...REAL_EFFORTS, { id: 'xhigh' }],
    defaultEffort: 'medium',
  };
  const max = shellOf(OPEN_REAL_TIER, store);
  assert.equal(max.props['data-effort'], 'xhigh');
  assert.equal(max.props['data-depth'], 3);
  // With a virtual Ultra step appended, Max is the last real tier and not the top position:
  // that is why the purple rim keys on the tier and the shower on the Ultra switch.
  assert.equal(max.props['data-ultra'], false, 'Max is not the Ultra switch');
  assert.equal(max.props['data-max'], false, 'Max is the deepest tier, not the top position');
  assert.equal(byClass(mountControl(OPEN_REAL_TIER, store).element, 'cg-model-meteor').length, 0, 'no meteors are rendered for Max');

  // Pinning Ultra on the same model appends the virtual step and starts the shower.
  const open = mountControl(OPEN_AT_MAX, store).element;
  const ultra = byClass(open, 'cg-model-slider-shell')[0];
  assert.equal(ultra.props['data-effort'], 'ultra');
  assert.equal(ultra.props['data-max'], true);
  assert.equal(byClass(open, 'cg-model-meteor').length, 11);
});

test('the sidebar slot occupant renders inside its own root', () => {
  // The sidebar is this bundle's own replacement for the shipped one. A throw here is how
  // the whole left column disappears, so it is checked against the built artifact.
  const noop = () => {};
  let sidebar = null;
  // The full state queue, because the occupant reads every slot it declares: an empty queue would
  // hand `undefined` to hooks that a real render always seeds.
  const react = loadBundle(createReactShim(sidebarStates()));
  const slots = {
    inject: (key, callback) => { if (key === 'sidebar') callback(); return noop; },
    entries: () => [], entriesOfSlot: () => [],
    register: (options, component) => { if (options.name === 'sidebar') sidebar = component; return noop; },
  };
  const sessions = {
    abc: { id: 'abc', title: '示例会话', displayTitle: '示例会话', updatedAt: Date.now(), running: false, retainedBy: {}, blank: false },
  };
  const ctx = {
    slots,
    layout: { selectPanel: noop, toggleSidebar: noop },
    uiWorkspace: { openSession: noop, startSession: noop, openWorkspace: () => Promise.resolve(), archiveSession: () => Promise.resolve(), unarchiveSession: () => Promise.resolve(), pinSession: () => Promise.resolve(), unpinSession: () => Promise.resolve() },
    theme: { overrideTokens: () => noop },
    connection: { rpc: { call: () => Promise.resolve({ ok: true, value: {} }) } },
    sessions: { subagentAddress: () => undefined, binding: () => undefined },
    remote: { agentPresets: { list: () => Promise.resolve({ ok: true, value: [] }) } },
    effect: () => noop,
    on: () => noop,
    logger: { warn: noop, info: noop, error: noop },
    get: () => undefined,
    inject: (_deps, callback) => { callback(ctx); return noop; },
  };
  react.moduleExports.apply(ctx);
  assert.ok(sidebar, 'the sidebar slot must be registered');

  const selector = value => () => value;
  const props = {
    collapsed: false,
    renderSlot: () => null,
    useSessionStatus: selector(new Map()),
    useSessions: selector({ byId: sessions, ids: Object.keys(sessions) }),
    useWorkspaces: selector({ items: [], pinnedSessionIds: [], archivedSessionIds: [] }),
    usePanelInfo: selector(null),
    useStore: selector('chat'),
    useConversationViews: selector([{ id: 'chat', label: '聊天' }]),
    useSessionRetainInfo: selector(undefined),
    useResource: selector(undefined),
    useChat: selector(undefined),
    useConversation: selector(undefined),
    useInput: selector({}),
    useProjection: selector(undefined),
    useTrajectory: selector(undefined),
    inputActions: {},
  };
  const tree = sidebar(props);
  if (process.env.CG_DEBUG_SIDEBAR) console.log('sidebar tree:', typeof tree, tree && Object.keys(tree), tree?.props && Object.keys(tree.props), tree?.props?.className);
  assert.ok(tree, 'the sidebar must render a tree');
  assert.equal(tree.props.className.includes('cg-sidebar'), true, 'the sidebar root must render');
});

// ---------------------------------------------------------------------------------------------
// Sidebar: Session rename, and the two child groups
// ---------------------------------------------------------------------------------------------

/** Class names that carry a modifier (`cg-task-row cg-task-child`) need a substring match. */
function byClassPart(tree, value) {
  return collect(tree, (node, found) => {
    if (typeof node.props?.className === 'string' && node.props.className.includes(value)) found.push(node);
  });
}

function byLabel(tree, pattern) {
  return collect(tree, (node, found) => {
    // Plugin components (`Button`) stay unexpanded in the shim tree, so their `label` prop is the
    // only place the accessible name lives until they render.
    const label = node.props?.['aria-label'] ?? node.props?.label;
    if (typeof label === 'string' && pattern.test(label)) found.push(node);
  });
}

/** The sidebar's `useState` order, so a test scripts a slot by index. */
// State-slot indices, in declaration order. They shift whenever a `useState` is added or removed in
// the sidebar — deleting the rail's "更多" menu moved them down, adding `heroMarkOpen` moved them
// back — which is why every override goes through this table instead of a raw index.
const SIDEBAR_SLOT = {
  heroMarkOpen: 8, pinsOpen: 11,
  taskMenu: 13, renameTarget: 14, renameDraft: 15, renameError: 16, renamePending: 17,
  recentOpen: 19, archivedOpen: 20, childPanel: 21, subagentOpen: 22, branchOpen: 23, groupShowAll: 24,
  navigationError: 25, purgedIds: 26,
};

function sidebarStates(overrides = {}) {
  // The length of this queue must equal the occupant's hook count *exactly*. The shim resets its cursor
  // only when a hook runs past the end, so a queue that is one too long leaves the cursor short of the
  // end and every later render reads shifted values — that is what "purgedIds.has is not a function"
  // was: after a hook was deleted the array kept its old length and never wrapped.
  const states = [
    null, false, '', 'home', false, false, null, false, false, false, false, false,
    null, null, null, '', '', false, null, false, false, new Set(), new Set(), new Set(), new Set(), '',
    new Set(),
  ];
  for (const [index, value] of Object.entries(overrides)) states[Number(index)] = value;
  return states;
}

/**
 * Mount the sidebar slot occupant with a drivable state queue. `options.renameResult` answers the
 * rename hop with a success or a refusal; `options.usingError` makes the hop itself reject.
 */
function mountSidebar(sessions, options = {}) {
  const pins = [];
  const noop = () => {};
  const writes = [];
  const rpcCalls = [];
  const workspaces = options.workspaces ?? { items: [], pinnedSessionIds: [], archivedSessionIds: [] };
  let sidebar = null;
  const react = loadBundle(createReactShim(sidebarStates(options.overrides), { writableSlots: options.writableSlots }), options.storage ?? null, { confirm: options.confirm ?? (() => true) });
  const loadBundleDocument = react.document;
  const slots = {
    inject: (key, callback) => { if (key === 'sidebar') callback(); return noop; },
    entries: () => [], entriesOfSlot: () => [],
    register: (registerOptions, component) => { if (registerOptions.name === 'sidebar') sidebar = component; return noop; },
  };
  const ctx = {
    slots,
    layout: { selectPanel: noop, toggleSidebar: noop },
    uiWorkspace: {
      openSession: noop, startSession: noop, openWorkspace: () => Promise.resolve(),
      archiveSession: () => Promise.resolve(), unarchiveSession: () => Promise.resolve(),
      // Recorded rather than stubbed away: the pin action's whole job is to reach this call.
      pinSession: id => { pins.push({ action: 'pin', id }); return Promise.resolve(); },
      unpinSession: id => { pins.push({ action: 'unpin', id }); return Promise.resolve(); },
    },
    theme: { overrideTokens: () => noop },
    // `options.purgeResult` answers the delete hop, so a test can model the Host refusing it.
    connection: {
      rpc: {
        call: (path, method, payload) => {
          rpcCalls.push({ path, method, payload });
          return Promise.resolve(options.purgeResult ?? { ok: true, value: {} });
        },
      },
    },
    sessions: {
      subagentAddress: () => undefined,
      binding: () => undefined,
      // Mirrors the controller: `using` resolves to the callback's own result, a refusal rides
      // inside that result, and an acquisition failure rejects.
      using: async (id, useOptions, operation) => {
        const call = { id, source: useOptions?.source };
        writes.push(call);
        if (options.usingError) throw new Error(options.usingError);
        return operation({ binding: { session: { rename: title => { call.title = title; return Promise.resolve(options.renameResult ?? { ok: true, value: { title, seq: 1 } }); } } } });
      },
    },
    remote: { agentPresets: { list: () => Promise.resolve({ ok: true, value: [] }) } },
    effect: () => noop,
    on: () => noop,
    logger: { warn: noop, info: noop, error: noop },
    get: () => undefined,
    inject: (_deps, callback) => { callback(ctx); return noop; },
  };
  react.moduleExports.apply(ctx);
  assert.ok(sidebar, 'the sidebar slot must be registered');
  const selector = value => () => value;
  const props = {
    collapsed: false,
    renderSlot: () => null,
    useSessionStatus: selector(new Map()),
    useSessions: selector(sessions),
    useWorkspaces: selector(workspaces),
    usePanelInfo: selector(null),
    useStore: selector('chat'),
    useConversationViews: selector([{ id: 'chat', label: '聊天' }]),
  };
  const rerender = () => { react.beginRender(); const tree = sidebar(props); runEffects(react); return tree; };
  return { tree: rerender(), rerender, writes, rpcCalls, pins, document: loadBundleDocument };
}

test('an unpinned row offers pinning, and the pin reaches the workspace API', async () => {
  const sessions = { abc: { id: 'abc', title: '示例会话', createdAt: 1, updatedAt: 2, retainedBy: {} } };
  const { rerender, pins } = mountSidebar(sessions, { overrides: { [SIDEBAR_SLOT.recentOpen]: true } });
  const row = byClassPart(rerender(), 'cg-task-row')[0];
  const pin = byLabel(row, /^置顶 示例会话$/)[0];
  assert.ok(pin, 'the row action strip must offer pinning');
  assert.match(pin.props.className, /cg-pin-action/);
  assert.doesNotMatch(pin.props.className, /cg-pin-on/, 'an unpinned row is not marked as pinned');

  await pin.props.onClick();
  assert.deepEqual(pins, [{ action: 'pin', id: 'abc' }], 'the row pins its own Session through uiWorkspace.pinSession');
});

test('a pinned row reads as pinned and unpins through the same API', async () => {
  const sessions = { abc: { id: 'abc', title: '示例会话', createdAt: 1, updatedAt: 2, retainedBy: {} } };
  const { rerender, pins } = mountSidebar(sessions, {
    workspaces: { items: [], pinnedSessionIds: ['abc'], archivedSessionIds: [] },
    // The 置顶 section starts collapsed, and a pinned row lives only there.
    writableSlots: [SIDEBAR_SLOT.pinsOpen],
    overrides: { [SIDEBAR_SLOT.pinsOpen]: true },
  });
  const row = byClassPart(rerender(), 'cg-task-row')[0];
  assert.ok(row, 'a pinned Session renders in the pin section');
  const unpin = byLabel(row, /^取消置顶 示例会话$/)[0];
  assert.ok(unpin, 'a pinned row must offer unpinning');
  assert.match(unpin.props.className, /cg-pin-on/, 'and must be marked as pinned');

  await unpin.props.onClick();
  assert.deepEqual(pins, [{ action: 'unpin', id: 'abc' }]);
});

test('the row menu offers the same pin action, so it is reachable without hover', async () => {
  const sessions = { abc: { id: 'abc', title: '示例会话', createdAt: 1, updatedAt: 2, retainedBy: {} } };
  const { rerender, pins } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.taskMenu],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.taskMenu]: 'abc' },
  });
  const menu = byClass(rerender(), 'cg-task-menu')[0];
  assert.ok(menu, 'the row menu must be open');
  const item = byLabel(menu, /^置顶 示例会话$/)[0];
  assert.ok(item, 'the menu must offer pinning');
  assert.equal(item.props.children, '置顶会话');

  await item.props.onClick();
  assert.deepEqual(pins, [{ action: 'pin', id: 'abc' }]);
});

function sidebarFixture() {
  const sessions = {
    parent: { id: 'parent', title: '父会话', createdAt: 1, updatedAt: 100, retainedBy: {} },
    // A misleading title must not decide the group: only `origin` does.
    mixup: { id: 'mixup', title: '子代理（看起来像）', parentId: 'parent', createdAt: 50, retainedBy: {} },
    branch1: { id: 'branch1', title: 'dsh-codex-ui 努力滑条改进 (1)', parentId: 'parent', createdAt: 51, retainedBy: {} },
    pinned: { id: 'pinned', title: '置顶会话', createdAt: 60, retainedBy: {} },
    archived: { id: 'archived', title: '已归档会话', createdAt: 61, retainedBy: {} },
  };
  for (let index = 1; index <= 10; index += 1) {
    sessions[`sub${index}`] = { id: `sub${index}`, title: `子代理 ${index}`, parentId: 'parent', origin: 'subagent', createdAt: 10 + index, retainedBy: {} };
  }
  return sessions;
}

test('the row menu offers rename, and an accepted title closes the dialog', async () => {
  const sessions = { abc: { id: 'abc', title: '旧标题', createdAt: 1, updatedAt: 2, retainedBy: {} } };
  const { rerender, writes } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.taskMenu, SIDEBAR_SLOT.renameTarget, SIDEBAR_SLOT.renameDraft, SIDEBAR_SLOT.renameError, SIDEBAR_SLOT.renamePending],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.taskMenu]: 'abc' },
  });
  const menu = byClass(rerender(), 'cg-task-menu')[0];
  if (process.env.CG_DEBUG_SIDEBAR) console.log('DEBUG rows:', byClassPart(rerender(), 'cg-task-row').map(row => row.props.className), 'menus:', byClass(rerender(), 'cg-task-menu').length, 'text:', treeText(rerender()).slice(0, 160));
  assert.ok(menu, 'the row menu must be open');
  const rename = byLabel(menu, /^重命名/)[0];
  assert.ok(rename, 'the menu must offer rename');
  assert.equal(rename.props.children, '重命名');

  rename.props.onClick();
  const input = byClass(rerender(), 'cg-rename-input')[0];
  assert.ok(input, 'the rename dialog must open');
  assert.equal(input.props.value, '旧标题', 'the draft starts from the current title');
  input.props.onChange({ target: { value: '  新标题  ' } });
  assert.equal(byClass(rerender(), 'cg-rename-input')[0].props.value, '  新标题  ', 'the draft follows the field');

  await byClass(rerender(), 'cg-rename-dialog')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(writes.length, 1, 'exactly one rename hop');
  assert.equal(writes[0].id, 'abc', 'the hop targets the row that opened the menu');
  assert.equal(writes[0].source, 'workspaceOperation', 'the same scope the native sidebar uses');
  assert.equal(writes[0].title, '新标题', 'the Host receives the trimmed title');
  assert.equal(byClass(rerender(), 'cg-rename-dialog').length, 0, 'an accepted rename closes the dialog');
});

test('a refused or rejected rename keeps the dialog open and states the reason', async () => {
  const sessions = { abc: { id: 'abc', title: '旧标题', createdAt: 1, updatedAt: 2, retainedBy: {} } };
  const dialogState = {
    writableSlots: [SIDEBAR_SLOT.renameTarget, SIDEBAR_SLOT.renameDraft, SIDEBAR_SLOT.renameError, SIDEBAR_SLOT.renamePending],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.renameTarget]: 'abc', [SIDEBAR_SLOT.renameDraft]: '新标题' },
  };
  const refused = mountSidebar(sessions, { ...dialogState, renameResult: { ok: false, error: { message: '标题无效' } } });
  assert.ok(byClass(refused.rerender(), 'cg-rename-dialog')[0], 'the dialog must be open');
  await byClass(refused.rerender(), 'cg-rename-dialog')[0].props.onSubmit({ preventDefault() {} });
  const afterRefusal = refused.rerender();
  assert.equal(byClass(afterRefusal, 'cg-rename-error')[0].props.children, '标题无效', 'the Host refusal is shown');
  assert.ok(byClass(afterRefusal, 'cg-rename-dialog')[0], 'the dialog stays open for a retry');

  // An empty title never reaches the Host, and neither does a rejected hop's silence.
  const empty = mountSidebar(sessions, { ...dialogState, overrides: { ...dialogState.overrides, [SIDEBAR_SLOT.renameDraft]: '   ' } });
  assert.equal(byClass(empty.rerender(), 'cg-rename-save')[0].props.disabled, true, 'a blank title cannot be submitted');

  const rejected = mountSidebar(sessions, { ...dialogState, usingError: '会话打不开' });
  await byClass(rejected.rerender(), 'cg-rename-dialog')[0].props.onSubmit({ preventDefault() {} });
  const afterRejection = rejected.rerender();
  assert.equal(byClass(afterRejection, 'cg-rename-error')[0].props.children, '会话打不开');
  assert.ok(byClass(afterRejection, 'cg-rename-dialog')[0], 'a rejected hop keeps the draft');
});

test('a spawning row splits its children into a subagent group and a branch group', () => {
  const { rerender } = mountSidebar(sidebarFixture(), {
    writableSlots: [SIDEBAR_SLOT.pinsOpen, SIDEBAR_SLOT.recentOpen, SIDEBAR_SLOT.archivedOpen, SIDEBAR_SLOT.childPanel, SIDEBAR_SLOT.subagentOpen, SIDEBAR_SLOT.branchOpen],
    overrides: { [SIDEBAR_SLOT.pinsOpen]: true, [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.archivedOpen]: true },
    workspaces: { items: [], pinnedSessionIds: ['pinned'], archivedSessionIds: ['archived'] },
  });
  const tree = rerender();
  // Compact by default: one chevron, no headers, no child rows, and the split is still exact.
  const toggles = byClass(tree, 'cg-children-toggle');
  assert.equal(toggles.length, 1, 'one chevron per row that has children');
  assert.equal(toggles[0].props['aria-expanded'], false, 'the panel starts closed');
  assert.equal(toggles[0].props['data-count'], 12, 'ten subagents plus two branches');
  assert.equal(toggles[0].props['data-subagents'], 10, 'the ten origin=subagent children are subagents');
  assert.equal(toggles[0].props['data-branches'], 2, 'the two others are branches, whatever their titles say');
  assert.equal(byClass(tree, 'cg-group-toggle').length, 0, 'no group header is painted while collapsed');
  assert.equal(byClassPart(tree, 'cg-task-child').length, 0, 'no child row renders before a click');
  // The row is a fixed 31px box and not a flex container, so the chevron is positioned absolutely
  // and the title reserves its 22px through this class. Dropping the class moves every title.
  assert.equal(byClassPart(tree, 'cg-task-with-children').length, 1, 'only the spawning row reserves room for the chevron');
  assert.doesNotMatch(treeText(tree), /还有 \d+ 条/, 'the page note lives inside an open group only');
  assert.doesNotMatch(treeText(tree), /子代理/, 'the group names are not painted either');

  // One click opens the panel and nothing more: two headers with their counts, still no rows.
  toggles[0].props.onClick({ stopPropagation: () => {} });
  const panel = rerender();
  const headers = byClass(panel, 'cg-group-toggle');
  assert.equal(headers.length, 2, 'both group headers appear at once');
  assert.equal(headers.find(header => header.props['data-group'] === 'subagents').props['data-count'], 10);
  assert.equal(headers.find(header => header.props['data-group'] === 'branches').props['data-count'], 2);
  assert.equal(byClass(panel, 'cg-group-badge').length, 2, 'each group carries its own count badge');
  assert.equal(byClass(panel, 'cg-children-toggle')[0].props['aria-expanded'], true, 'the row chevron reports the open panel');
  assert.equal(headers.every(header => header.props['aria-expanded'] === false), true, 'the groups themselves stay shut');
  assert.equal(byClassPart(panel, 'cg-task-child').length, 0, 'a panel costs two lines, not a page of rows');
  assert.doesNotMatch(treeText(panel), /还有 \d+ 条/, 'the page note waits for a group');

  // A second click on a group header is what brings that group's page in.
  headers.find(header => header.props['data-group'] === 'subagents').props.onClick({ stopPropagation: () => {} });
  const subagents = rerender();
  assert.equal(byClassPart(subagents, 'cg-task-child').length, 8, 'one page of subagents');
  assert.match(treeText(subagents), /还有 2 条/);
  assert.doesNotMatch(treeText(subagents), /努力滑条/, 'the branch group is still shut');

  // Closing the row folds everything, so reopening starts at the two headers again.
  byClass(subagents, 'cg-children-toggle')[0].props.onClick({ stopPropagation: () => {} });
  const folded = rerender();
  assert.equal(byClass(folded, 'cg-group-toggle').length, 0, 'the panel is gone');
  byClass(folded, 'cg-children-toggle')[0].props.onClick({ stopPropagation: () => {} });
  const reopened = rerender();
  assert.equal(byClass(reopened, 'cg-group-toggle').length, 2, 'the headers come back');
  assert.equal(byClassPart(reopened, 'cg-task-child').length, 0, 'and no group stays open behind them');

  // The main lists keep working, and a child never becomes an entry of its own there.
  assert.match(treeText(tree), /置顶会话/);
  assert.match(treeText(tree), /已归档会话/);
  assert.equal(byLabel(tree, /^取消归档 已归档会话$/).length, 1, 'the archived row still offers unarchive');
  assert.equal(byLabel(tree, /^归档会话 父会话$/).length, 1, 'a live row still offers archive');
  assert.equal(byClassPart(tree, 'cg-task-row').length, 3, 'parent, pinned and archived only');
});

test('one group opens without moving the other, pages at eight, and survives an action', async () => {
  const noop = () => {};
  const { rerender } = mountSidebar(sidebarFixture(), {
    writableSlots: [SIDEBAR_SLOT.taskMenu, SIDEBAR_SLOT.recentOpen, SIDEBAR_SLOT.childPanel, SIDEBAR_SLOT.subagentOpen, SIDEBAR_SLOT.branchOpen, SIDEBAR_SLOT.groupShowAll],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.childPanel]: new Set(['parent']), [SIDEBAR_SLOT.subagentOpen]: new Set(['parent']) },
  });
  const opened = rerender();
  assert.equal(byClassPart(opened, 'cg-task-child').length, 8, 'a long group renders one page');
  assert.match(treeText(opened), /还有 2 条/);
  assert.doesNotMatch(treeText(opened), /努力滑条/, 'the branch group stays closed');

  const branches = byClass(opened, 'cg-group-toggle').find(header => header.props['data-group'] === 'branches');
  branches.props.onClick({ stopPropagation: noop });
  const both = rerender();
  assert.equal(byClass(both, 'cg-group-toggle').find(header => header.props['data-group'] === 'subagents').props['aria-expanded'], true, 'the subagent group is untouched');
  assert.match(treeText(both), /努力滑条/, 'the branch row appears');
  assert.equal(byClassPart(both, 'cg-task-child').length, 10, 'eight subagents plus two branches');

  const more = byClass(both, 'cg-group-more')[0];
  assert.equal(more.props.children, '还有 2 条');
  more.props.onClick({ stopPropagation: noop });
  const all = rerender();
  assert.equal(byClass(all, 'cg-group-more').length, 0, 'the note goes away once every child renders');
  assert.equal(byClassPart(all, 'cg-task-child').length, 12);

  // Closing one group leaves the other exactly where it was.
  byClass(all, 'cg-group-toggle').find(header => header.props['data-group'] === 'subagents').props.onClick({ stopPropagation: noop });
  const closed = rerender();
  assert.equal(byClassPart(closed, 'cg-task-child').length, 2, 'only the branch children remain');
  assert.equal(byLabel(closed, /^子代理 \d+$/).length, 0, 'the subagent rows are gone');

  // An unrelated action must not touch either disclosure.
  const reopened = mountSidebar(sidebarFixture(), {
    writableSlots: [SIDEBAR_SLOT.recentOpen, SIDEBAR_SLOT.childPanel, SIDEBAR_SLOT.subagentOpen, SIDEBAR_SLOT.branchOpen],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.childPanel]: new Set(['parent']), [SIDEBAR_SLOT.branchOpen]: new Set(['parent']) },
  });
  const archive = byClassPart(reopened.rerender(), 'cg-task-actions')[0].props.children[0];
  await archive.props.onClick();
  const afterArchive = reopened.rerender();
  assert.equal(byClassPart(afterArchive, 'cg-task-child').length, 2, 'archiving neither expands nor collapses a group');
  assert.equal(byClass(afterArchive, 'cg-group-toggle').find(header => header.props['data-group'] === 'branches').props['aria-expanded'], true);
});

test('an archived row offers deletion, and the Host confirmation removes it here', async () => {
  const sessions = { archived: { id: 'archived', title: '已归档会话', createdAt: 1, retainedBy: {} } };
  const { rerender, rpcCalls } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.archivedOpen, SIDEBAR_SLOT.navigationError, SIDEBAR_SLOT.purgedIds],
    overrides: { [SIDEBAR_SLOT.archivedOpen]: true },
    workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: ['archived'] },
  });
  const button = byLabel(rerender(), /^删除会话日志/)[0];
  assert.ok(button, 'an archived row must offer deletion');
  await button.props.onClick();
  // Filtered to the delete route on purpose: activation also pushes the model display names, and a
  // statement about "exactly one delete hop" must count delete hops rather than every RPC.
  const purges = rpcCalls.filter(call => call.method === 'dsh-codex-ui/purge-session');
  assert.equal(purges.length, 1, 'exactly one delete hop');
  assert.equal(purges[0].path, '/api');
  assert.deepEqual(purges[0].payload, { sessionId: 'archived' });
  const after = rerender();
  assert.equal(byLabel(after, /^删除会话日志/).length, 0, 'the deleted row is gone from the sidebar');
  // A confirmation banner used to appear here. It was removed at the owner's request, and the row
  // leaving the list is the feedback — so this asserts the silence, not the banner.
  assert.doesNotMatch(treeText(after), /已删除/);
});

test('cancelling the confirmation leaves the Session alone', async () => {
  const sessions = { archived: { id: 'archived', title: '已归档会话', createdAt: 1, retainedBy: {} } };
  const { rerender, rpcCalls } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.archivedOpen, SIDEBAR_SLOT.navigationError, SIDEBAR_SLOT.purgedIds],
    overrides: { [SIDEBAR_SLOT.archivedOpen]: true },
    workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: ['archived'] },
    confirm: () => false,
  });
  await byLabel(rerender(), /^删除会话日志/)[0].props.onClick();
  // Filtered to the delete route on purpose: activation now also pushes the model display names, and an
  // assertion about "exactly one delete hop" must count delete hops, not every RPC in the session.
  assert.equal(rpcCalls.filter(call => call.method === 'dsh-codex-ui/purge-session').length, 0, 'nothing is sent when the user cancels');
  assert.equal(byLabel(rerender(), /^删除会话日志/).length, 1, 'the row stays');
});

test('the model display names are pushed to the Host when the client activates', () => {
  const storage = {
    'dsh-codex-ui/model-aliases': JSON.stringify({ 'deepseek/deepseek-chat': '阿斯特拉' }),
  };
  const { rpcCalls } = mountSidebar({}, {
    storage: { getItem: key => storage[key] ?? null, setItem: (key, value) => { storage[key] = value; }, removeItem: key => { delete storage[key]; } },
  });
  // The push rides the turbo route, which is the one this environment has always answered.
  const push = rpcCalls.find(call => call.method === 'dsh-codex-ui/turbo' && call.payload?.action === 'aliases');
  assert.ok(push, 'the map is published once on activation');
  // The payload carries both maps: the owner's names and the catalog names the menu prints, because a
  // model's displayed name may come from either.
  assert.deepEqual(push.payload.aliases, { 'deepseek/deepseek-chat': '阿斯特拉' });
  assert.equal(push.payload.sessionId, '', 'not tied to a session: the map is global');
  assert.ok('names' in push.payload, 'the catalog map travels with it');
});

test('a refused deletion keeps the row and states why', async () => {
  const sessions = { archived: { id: 'archived', title: '已归档会话', createdAt: 1, retainedBy: {} } };
  const { rerender } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.archivedOpen, SIDEBAR_SLOT.navigationError, SIDEBAR_SLOT.purgedIds],
    overrides: { [SIDEBAR_SLOT.archivedOpen]: true },
    workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: ['archived'] },
    purgeResult: { ok: false, error: { message: '找不到该会话的日志目录' } },
  });
  await byLabel(rerender(), /^删除会话日志/)[0].props.onClick();
  const after = rerender();
  assert.equal(byLabel(after, /^删除会话日志/).length, 1, 'a refusal must not hide the row');
  assert.match(treeText(after), /找不到该会话的日志目录/);
});

test('a missing delete route tells the user to restart DSH', async () => {
  const sessions = { archived: { id: 'archived', title: '已归档会话', createdAt: 1, retainedBy: {} } };
  const { rerender } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.archivedOpen, SIDEBAR_SLOT.navigationError, SIDEBAR_SLOT.purgedIds],
    overrides: { [SIDEBAR_SLOT.archivedOpen]: true },
    workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: ['archived'] },
    purgeResult: { ok: false, error: { code: 'not-found', message: 'not found' } },
  });
  await byLabel(rerender(), /^删除会话日志/)[0].props.onClick();
  assert.match(treeText(rerender()), /删除服务未加载：请重启 DSH 后再试。/);
});

test('a live row offers no deletion at all', () => {
  const sessions = { live: { id: 'live', title: '普通会话', createdAt: 1, retainedBy: {} } };
  const { rerender } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.recentOpen, SIDEBAR_SLOT.taskMenu],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.taskMenu]: 'live' },
  });
  const tree = rerender();
  assert.equal(byClass(tree, 'cg-task-menu').length, 1, 'the row menu is open');
  assert.equal(byLabel(tree, /^删除会话日志/).length, 0, 'deletion is offered for archived Sessions only');
  assert.equal(byLabel(tree, /^归档会话 普通会话$/).length, 1, 'the archive action is still there');
});

test('a model alias repaints the name and leaves the request alone', () => {
  const store = modelStore();
  const alias = { 'deepseek/deepseek-chat': '小闪' };
  // The alias map is state seeded from storage, so the mount carries both: the queued slot is what
  // this render reads, and the storage entry is what the next page load would read.
  const seeded = [true, 'model', '', null, null, false, false, true, { value: 15, exact: true }, false, alias, null];
  const { element, selections } = mountControl(seeded, store, {}, { memory: { 'dsh-codex-ui/model-aliases': alias } });
  assert.equal(byClass(element, 'cg-model-trigger-name')[0].props.children, '小闪', 'the composer label uses the alias');
  const option = byClass(element, 'cg-model-option')[0];
  assert.match(treeText(option), /小闪/, 'and so does the row');

  // Selecting it still names the real model: an alias is a label, not a route.
  option.props.onClick();
  assert.deepEqual(selections[0], { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' });
});

test('a model can be found by either of its names', () => {
  const alias = { 'deepseek/deepseek-chat': '小闪' };
  const byAlias = mountControl([true, 'model', '小闪', null, null, false, false, true, { value: 15, exact: true }, false, alias, null], modelStore(), {}, { memory: { 'dsh-codex-ui/model-aliases': alias } });
  assert.equal(byClass(byAlias.element, 'cg-model-option').length, 1, 'searching the alias finds the model');
  const byReal = mountControl([true, 'model', 'deepseek-chat', null, null, false, false, true, { value: 15, exact: true }, false, alias, null], modelStore(), {}, { memory: { 'dsh-codex-ui/model-aliases': alias } });
  assert.equal(byClass(byReal.element, 'cg-model-option').length, 1, 'and so does the real name');
  const byNothing = mountControl([true, 'model', 'zzz', null, null, false, false, true, { value: 15, exact: true }, false, alias, null], modelStore(), {}, { memory: { 'dsh-codex-ui/model-aliases': alias } });
  assert.equal(byClass(byNothing.element, 'cg-model-option').length, 0, 'an unrelated query still filters it out');
});

test('renaming from the picker stores the alias, trims it, and clears on reset', () => {
  // The row keeps a rename control of its own: a click on the row already means "use this model",
  // so the gesture cannot be a double click. The editor it opens carries no buttons at all.
  const seeded = [true, 'model', '', null, null, false, false, true, { value: 15, exact: true }, false, {}, null];
  const { rerender, memory } = mountControl(seeded, modelStore(), {}, { writableSlots: [10, 11] });
  // Found by class, the same way the sidebar tests find their row actions. The label is checked for
  // content rather than for an exact sentence: the wording is not the contract.
  const found = () => byClassPart(rerender(), 'cg-model-rename')[0];
  assert.ok(byClass(rerender(), 'cg-model-option')[0], 'the row is a selector');
  assert.match(found().props['aria-label'], /显示名/, 'and offers renaming beside it');

  found().props.onClick();
  const input = byClass(rerender(), 'cg-model-alias-input')[0];
  assert.ok(input, 'the row becomes a field');
  assert.equal(input.props.rows, 1, 'the field is a wrapping textarea, one line tall to start');
  assert.equal(byClassPart(rerender(), 'cg-model-alias-save').length, 1, 'with a confirm glyph');
  assert.equal(byClassPart(rerender(), 'cg-model-alias-cancel').length, 1, 'and a cancel glyph');
  assert.match(input.props.title, /回车保存/, 'the field states its own keys');
  input.props.onChange({ target: { value: '  小闪  ' } });
  // Read the handler off the render that follows the keystroke: the shim's draft slot holds the
  // new text, and the handler captured in the previous render still sees the old one.
  byClass(rerender(), 'cg-model-alias-input')[0].props.onKeyDown({ key: 'Enter' });

  assert.equal(byClass(rerender(), 'cg-model-alias-input').length, 0, 'Enter puts the row back');
  assert.equal(byClass(rerender(), 'cg-model-trigger-name')[0].props.children, '小闪', 'the trimmed alias reaches the label');
  const stored = JSON.parse(memory.get('dsh-codex-ui/model-aliases'));
  assert.equal(stored['deepseek/deepseek-chat'], '小闪', 'and is persisted per account, so another key with the same model is unaffected');
  assert.match(found().props['aria-label'], /小闪/, 'and the row now speaks about the alias');

  // An emptied field restores the original name: that is the reset, with no control of its own.
  found().props.onClick();
  assert.equal(byClass(rerender(), 'cg-model-alias-input')[0].props.value, '小闪', 'reopening starts from the current name');
  byClass(rerender(), 'cg-model-alias-input')[0].props.onChange({ target: { value: '   ' } });
  byClass(rerender(), 'cg-model-alias-input')[0].props.onKeyDown({ key: 'Enter' });
  assert.equal(byClass(rerender(), 'cg-model-trigger-name')[0].props.children, 'deepseek-chat');
  assert.deepEqual(JSON.parse(memory.get('dsh-codex-ui/model-aliases')), {});
  assert.doesNotMatch(found().props['aria-label'], /小闪/, 'and the row reads as unaliased again');
});
test('a name belongs to one account, not to the model id at large', () => {
  // Two keys can offer the same model id. Naming one account's copy must leave the other alone:
  // the alias is stored per `provider/model` for exactly this reason.
  const store = {
    groups: [
      { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'deepseek-chat', reasoning: { efforts: REAL_EFFORTS, defaultEffort: 'medium' } }] },
      { id: 'deepseek-account', name: 'DeepSeek 账号', models: [{ id: 'deepseek-chat', name: 'deepseek-chat', reasoning: { efforts: REAL_EFFORTS, defaultEffort: 'medium' } }] },
    ],
    current: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
    pending: null, status: 'ready', failures: [], retainedEffort: null,
  };
  const alias = { 'deepseek/deepseek-chat': '小闪' };
  const seeded = [true, 'model', '', null, null, false, false, true, { value: 15, exact: true }, false, alias, null];
  const { element } = mountControl(seeded, store, {}, { memory: { 'dsh-codex-ui/model-aliases': alias } });
  const rows = byClassPart(element, 'cg-model-option');
  assert.equal(rows.length, 2, 'the same model id is offered by both accounts');
  assert.match(treeText(rows[0]), /小闪/, 'the named account reads its own name');
  assert.doesNotMatch(treeText(rows[1]), /小闪/, 'and the other account keeps the original one');
  assert.match(treeText(rows[1]), /deepseek-chat/, 'the untouched row still shows the model id');
});
test('renaming happens inside the row, and the picker stays on screen', () => {
  // The editor used to be a floating panel: it was clipped by its own popover, and clicking the
  // pencil could leave the reader with nothing. So the assertions here are about what survives.
  const seeded = [true, 'model', '', null, null, false, false, true, { value: 15, exact: true }, false, {}, null];
  const { rerender } = mountControl(seeded, modelStore(), {}, { writableSlots: [10, 11] });
  const rows = () => byClassPart(rerender(), 'cg-model-row');
  assert.equal(rows().length, 1, 'the picker lists the model');
  const found = () => byClassPart(rerender(), 'cg-model-rename')[0];
  found().props.onClick();
  const input = byClass(rerender(), 'cg-model-alias-input')[0];
  assert.ok(input, 'the field replaces the row it belongs to');
  assert.match(rows()[0].props.className, /cg-model-row-editing/, 'and the row says so');
  assert.equal(rows().length, 1, 'the list is still there while typing');
  assert.equal(byClass(rerender(), 'cg-model-option').length, 0, 'the selector is out of the way during the edit');

  // Escape abandons the draft and brings the row back untouched.
  input.props.onKeyDown({ key: 'Escape' });
  assert.equal(byClass(rerender(), 'cg-model-alias-input').length, 0, 'Escape closes the editor');
  assert.equal(byClass(rerender(), 'cg-model-option').length, 1, 'and the selector returns');
  assert.equal(byClass(rerender(), 'cg-model-trigger-name')[0].props.children, 'deepseek-chat', 'with no name changed');

  // The cross beside the field abandons the draft and brings the row back untouched.
  found().props.onClick();
  byClassPart(rerender(), 'cg-model-alias-cancel')[0].props.onClick();
  assert.equal(byClass(rerender(), 'cg-model-alias-input').length, 0, 'the cross closes the editor');
  assert.equal(byClass(rerender(), 'cg-model-option').length, 1, 'and the selector returns');
  assert.equal(byClass(rerender(), 'cg-model-trigger-name')[0].props.children, 'deepseek-chat', 'with no name changed');

  // Losing focus no longer closes it: the glyphs are the way out, and a click on the tick must not
  // race a blur that would have removed the editor before the click landed.
  found().props.onClick();
  assert.equal(typeof byClass(rerender(), 'cg-model-alias-input')[0].props.onBlur, 'undefined', 'the field has no blur handler');
  // The tick commits.
  byClass(rerender(), 'cg-model-alias-input')[0].props.onChange({ target: { value: '小闪' } });
  byClassPart(rerender(), 'cg-model-alias-save')[0].props.onClick();
  assert.equal(byClass(rerender(), 'cg-model-trigger-name')[0].props.children, '小闪', 'the tick commits the name');
  assert.equal(byClass(rerender(), 'cg-model-option').length, 1, 'and the row is a selector again');
});

test('editing one account does not put the other account row into editing', () => {
  // Both rows are the same model id, so a predicate on the id alone opened both editors at once.
  const store = {
    groups: [
      { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'deepseek-chat', reasoning: { efforts: REAL_EFFORTS, defaultEffort: 'medium' } }] },
      { id: 'deepseek-account', name: 'DeepSeek 账号', models: [{ id: 'deepseek-chat', name: 'deepseek-chat', reasoning: { efforts: REAL_EFFORTS, defaultEffort: 'medium' } }] },
    ],
    current: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
    pending: null, status: 'ready', failures: [], retainedEffort: null,
  };
  const seeded = [true, 'model', '', null, null, false, false, true, { value: 15, exact: true }, false, {}, null];
  const { rerender } = mountControl(seeded, store, {}, { writableSlots: [10, 11] });
  const rows = () => byClassPart(rerender(), 'cg-model-row');
  assert.equal(rows().length, 2, 'two accounts list the same model');

  byClassPart(rerender(), 'cg-model-rename')[0].props.onClick();
  assert.equal(byClass(rerender(), 'cg-model-alias-input').length, 1, 'exactly one field opens');
  assert.equal(byClass(rerender(), 'cg-model-option').length, 1, 'the other row stays a selector');
  assert.match(rows()[0].props.className, /cg-model-row-editing/, 'the clicked row is the one editing');
  assert.doesNotMatch(rows()[1].props.className, /cg-model-row-editing/, 'and the other is not');
});
test('a row menu closes on a click anywhere else, not only on its own trigger', async () => {
  const sessions = { abc: { id: 'abc', title: '示例会话', createdAt: 1, updatedAt: 2, retainedBy: {} } };
  const { rerender, document: doc } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.taskMenu],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.taskMenu]: 'abc' },
  });
  assert.ok(byClass(rerender(), 'cg-task-menu')[0], 'the menu starts open');
  assert.ok(doc.listenerCount('pointerdown') > 0, 'and it subscribes to outside clicks while open');

  // A click on the menu itself must not dismiss it.
  const inside = { closest: selector => (selector.includes('cg-task-menu') ? {} : null) };
  doc.dispatch('pointerdown', { target: inside });
  assert.ok(byClass(rerender(), 'cg-task-menu')[0], 'a click inside keeps it open');

  // A click anywhere else closes it, in one click.
  doc.dispatch('pointerdown', { target: { closest: () => null } });
  assert.equal(byClass(rerender(), 'cg-task-menu').length, 0, 'a click outside closes it');

  // The trigger is exempt so its own click can toggle the menu shut.
  const { rerender: again, document: doc2 } = mountSidebar(sessions, {
    writableSlots: [SIDEBAR_SLOT.taskMenu],
    overrides: { [SIDEBAR_SLOT.recentOpen]: true, [SIDEBAR_SLOT.taskMenu]: 'abc' },
  });
  const trigger = { closest: selector => (selector.includes('data-menu-trigger') ? {} : null) };
  doc2.dispatch('pointerdown', { target: trigger });
  assert.ok(byClass(again(), 'cg-task-menu')[0], 'clicking the trigger leaves the toggle to the trigger');
});

test('the hero-mark upload accepts pictures and animated pictures only, within a 2MB ceiling', () => {
  const { validateHeroMarkFile } = loadBundle().moduleExports;
  assert.equal(validateHeroMarkFile({ type: 'image/png', size: 1024 }).ok, true);
  assert.equal(validateHeroMarkFile({ type: 'image/gif', size: 1024 }).ok, true, 'an animated picture is a picture');
  assert.equal(validateHeroMarkFile({ type: 'image/webp', size: 2 * 1024 * 1024 }).ok, true, 'the ceiling itself is allowed');
  assert.equal(validateHeroMarkFile({ type: 'application/pdf', size: 1024 }).ok, false, 'not a picture');
  assert.equal(validateHeroMarkFile({ type: 'text/html', size: 10 }).ok, false);
  assert.equal(validateHeroMarkFile({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }).ok, false, 'one byte past the ceiling');
  assert.equal(validateHeroMarkFile({ type: 'image/png', size: 0 }).ok, false, 'an empty file');
  assert.equal(validateHeroMarkFile(null).ok, false, 'nothing at all');
});

test('the hero mark resolves to one of four states, and survives a lost picture', () => {
  const { resolveHeroMark } = loadBundle().moduleExports;
  assert.deepEqual(resolveHeroMark({ kind: 'none' }), { kind: 'none', src: null });
  assert.deepEqual(resolveHeroMark({ kind: 'deepseek' }), { kind: 'deepseek', src: null });
  assert.deepEqual(resolveHeroMark({ kind: 'codex' }), { kind: 'codex', src: null });
  const custom = resolveHeroMark({ kind: 'custom', dataUrl: 'data:image/gif;base64,R0lGOD' });
  assert.deepEqual(custom, { kind: 'custom', src: 'data:image/gif;base64,R0lGOD' });
  // An unknown kind, a missing picture, and a non-image data URL all fall back rather than breaking.
  assert.equal(resolveHeroMark({ kind: 'wat' }).kind, 'deepseek');
  assert.equal(resolveHeroMark({ kind: 'custom' }).kind, 'deepseek');
  assert.equal(resolveHeroMark({ kind: 'custom', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }).kind, 'deepseek');
  assert.equal(resolveHeroMark(undefined).kind, 'deepseek', 'a first run shows the shipped mark');
});

// ---------------------------------------------------------------------------------------------
// Where the agent-preset picker lands, and why it stopped landing there
// ---------------------------------------------------------------------------------------------

/** A DOM stub good enough for the placement rules: rectangles, a style bag, and attributes. */
function box(left, top, width, height, position = 'static') {
  const attributes = {};
  const element = {
    parentElement: null, offsetParent: null, position, style: {},
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
    getAttribute: name => (Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null),
    setAttribute: (name, value) => { attributes[name] = String(value); },
    removeAttribute: name => { delete attributes[name]; },
  };
  return element;
}


test('the running label keeps the host elapsed time and drops the host wording', () => {
  // The host renders 「深度求索中」 or 「深度求索中，用时 12 秒 ···」; the plugin redraws the label as Codex's
  // and reuses only the elapsed-time half, which is the part the host computes and this plugin must not.
  const { runningTailOf } = loadBundle().moduleExports;
  assert.equal(runningTailOf('深度求索中'), '');
  assert.equal(runningTailOf('深度求索中，用时 12 秒 ···'), '，用时 12 秒 ···');
  assert.equal(runningTailOf('  深度求索中 ···'), ' ···', 'leading space is the host copy, not the clock');
  // Anything unexpected is passed through untouched: the label is not a place to invent text.
  assert.equal(runningTailOf('别的文案'), '别的文案');
  assert.equal(runningTailOf(''), '');
  assert.equal(runningTailOf(undefined), '');
});
