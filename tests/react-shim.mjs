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
  // effect 按「声明顺序 + 依赖浅比较」决定跑不跑，和 React 一致。桩原来无条件重跑，
  // 于是模型面板的 read effect 每轮都先把 ultraSyncedRef 清空，后面的写入器被永久拦住。
  let effectCursor = 0;
  // ref 游标单独一支：句柄表（handles）跨渲染保留，位置由这个每渲染归零的游标给出。
  // 原来是拿 `handles.length` 当位置 —— 只要不再清空句柄表，它就成了递增的追加下标，
  // 每次渲染都新建句柄，「ref 跨渲染是同一个对象」这条 React 语义于是永远不成立。
  let refCursor = 0;
  const effectDeps = [];
  const recordEffect = (callback, deps) => {
    const index = effectCursor++;
    const previous = effectDeps[index];
    const changed = !deps || previous === undefined
      || deps.length !== previous.length
      || deps.some((value, i) => !Object.is(value, previous[i]));
    if (!changed) return;
    effectDeps[index] = deps ? [...deps] : undefined;
    effects.push(callback);
  };
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
    useState: init => {
      // Each render call restarts the queue, which is what makes calling the component
      // a second time behave like a React re-render: the same hook positions read the
      // same values, unless a setter wrote one.
      if (cursor >= queue.length) cursor = 0;
      const index = cursor++;
      // 脚本化值优先；队列里这一位没有脚本（undefined）时才退回初始化表达式，
      // 并且像 React 一样调用函数式初始化。少了这一步，`useState(() => railSnapshotList())`
      // 会把那个函数本身当成值返回，组件里 `railItems.some(...)` 于是抛
      // `railItems.some is not a function`——不是组件坏了，是桩没按 React 的方式做。
      const scripted = queue[index];
      if (scripted === undefined) {
        queue[index] = typeof init === 'function' ? init() : init;
      }
      const setter = value => {
        if (!writable.has(index)) return;
        queue[index] = typeof value === 'function' ? value(queue[index]) : value;
      };
      return [queue[index], setter];
    },
    useRef: initial => {
      // React 的 useRef(init) 会把这个初始值放进 `.current`。桩原来一律给 null，
      // 于是组件里 `useRef(railShown)` 拿到 null，紧接着 `previous.filter(...)` 抛
      // `Cannot read properties of null (reading 'filter')`——不是组件写错，是桩没照 React 做。
      // 句柄跨渲染复用（React 语义）：ref 是组件生命周期内同一个对象，不是每次渲染新建。
      // 少了这条复用，读 effect 写进 `ultraSyncedRef.current` 的值在下一渲染就被换成新句柄，
      // ultra writer 的 `ultraSyncedRef.current === sessionId` 前置条件永远不成立——
      // 「blank 会话继承上次开关」的测试因此拿不到那条 `update {ultra:true}`。
      const order = refCursor++;
      if (handles[order] === undefined || handles[order] === null) {
        handles.push({ current: initial ?? null });
      }
      return handles[order];
    },
    useEffect: (callback, deps) => { recordEffect(callback, deps); },
    useLayoutEffect: (callback, deps) => { recordEffect(callback, deps); },
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
    // 一次渲染就是一次边界：清掉上一轮收集的 effect，并且把 hook 游标归零。
    // ref 句柄不在这里清空——React 的 ref 是跨渲染的同一个对象，句柄表按创建序复用；
    // 测试仍能在 beginRender 之前覆盖 handles 里的 current（assignRefs 写的就是这些句柄）。
    // 原先清空句柄把 ref 变成了「每渲染新建」，读 effect 与 writer effect 之间传值的 ref
    // （ultraSyncedRef）于是永远读不到上一轮写入的值。
    beginRender() { effects.length = 0; cursor = 0; effectCursor = 0; refCursor = 0; },
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
