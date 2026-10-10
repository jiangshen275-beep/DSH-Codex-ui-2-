// Minimal React shim, just enough to execute the built client artifact and read the
// element tree it produces. This is a test double, not a React implementation: hooks
// read from a scripted state queue and effects never run.
//
// Values pass through untouched — a `?? false` here would turn a `null` initial state
// (draftIndex, actionError) into `false` and silently change what the component compares
// against. `options.draftIndexSlot` is the queue index that must track `setDraftIndex`,
// so an event handler followed by a read of the same render sees the write, as it would
// after a React re-render.
export function createReactShim(states = [], options = {}) {
  const draftIndexSlot = options.draftIndexSlot ?? 3;
  // Only the draft slot is writable by default, which keeps every other slot scripted.
  // A test that needs a render-dependent state (an async read flipping turboReady) opts
  // those slots in explicitly, so nothing else starts depending on live setters.
  const writable = new Set(options.writableSlots ?? [draftIndexSlot]);
  let cursor = 0;
  const handles = [];
  const effects = [];
  const queue = [...states];
  const noop = () => {};
  const react = {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      const flat = children.length <= 1 ? children[0] : children;
      const { key, ...rest } = props ?? {};
      return { __element: true, type, key: key ?? null, props: children.length === 0 ? { ...rest } : { ...rest, children: flat } };
    },
    cloneElement(element, props, ...children) {
      return { ...element, props: { ...element.props, ...(props ?? {}), ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } };
    },
    isValidElement: value => Boolean(value && value.__element === true),
    Children: { map: (children, mapper) => (Array.isArray(children) ? children.map(mapper) : children ? [mapper(children, 0)] : []) },
    useState: () => {
      // Each render call restarts the queue, which is what makes calling the component
      // a second time behave like a React re-render: the same hook positions read the
      // same values, unless a setter wrote one.
      if (cursor >= queue.length) cursor = 0;
      const index = cursor++;
      const setter = value => {
        if (!writable.has(index)) return;
        queue[index] = typeof value === 'function' ? value(queue[index]) : value;
      };
      return [queue[index], setter];
    },
    useRef: () => {
      const handle = { current: null };
      handles.push(handle);
      return handle;
    },
    useEffect: callback => { effects.push(callback); },
    useLayoutEffect: callback => { effects.push(callback); },
    // A memo value is recomputed on every shim render: the shim has no dependency
    // tracking, and recomputing is what a changed dependency would do anyway.
    useMemo: factory => factory(),
    useCallback: fn => fn,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    // Test-facing hooks: every ref object and effect callback from the last render, in
    // creation order. A render is a boundary: `beginRender()` clears both lists, so what
    // `runEffects` sees is exactly the render that just finished.
    handles,
    effects,
    beginRender() { handles.length = 0; effects.length = 0; },
  };
  return react;
}

/**
 * Run the effects recorded by the most recent render and return their cleanups. React
 * would do this after the commit; a test drives it explicitly when it needs to observe
 * what an effect does to the DOM.
 * @param shim - value returned by `createReactShim`.
 * @returns the cleanup functions returned by those effects.
 */
export function runEffects(shim) {
  return shim.effects.map(effect => effect());
}

/**
 * Attach reference values to the refs created so far. React assigns refs during commit,
 * after render and before effects, and a shim render creates a fresh handle each time —
 * so a test assigns after the render whose effect would have read the ref.
 * @param shim - value returned by `createReactShim`.
 * @param refs - map from `useRef` creation order to the value for `ref.current`.
 */
export function assignRefs(shim, refs) {
  for (const [order, value] of Object.entries(refs)) {
    const handle = shim.handles[Number(order)];
    if (handle) handle.current = value;
  }
}
