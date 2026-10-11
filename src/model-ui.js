import { ALIASES_KEY, readAliases, publishAliases, publishCatalogNames } from './alias-sync.js';

// The directory is shared with the native /model command and session projection.
function registerModelUI(ctx) {
  // Tier labels follow the model menu's own convention: an English word, a capital and
  // the rest lower case — Off / Low / Medium / High / Max / Ultra.
  const effortNames = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Max', max: 'Max', ultra: 'Ultra', off: 'Off' };
  const effortLabel = level => effortNames[level?.id] || level?.name || level?.id || 'Off';
  const glyph = (kind, className) => h('svg', { className, width: 16, height: 16, viewBox: '0 0 24 24', fill: kind === 'zap' ? 'currentColor' : 'none', stroke: kind === 'zap' ? 'none' : 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: kind === 'zap' ? 'm13.8 2-10 12H11l-1 8 10.2-13H13l.8-7Z' : 'M3 10a9 9 0 1 1 2.7 8.4M3 4v6h6' }));
  // Codex-style lightning: a fat bolt with rounded joins, painted in the deep purple
  // gradient and ringed by three sparkles — stars, not a meteor streak.
  const BOLT_PATH = 'M14.1 2.3 6.2 12.9c-.5.7 0 1.7.9 1.7h3.7l-1.3 6c-.2 1 1.1 1.6 1.7.8l7.9-10.6c.5-.7 0-1.7-.9-1.7h-3.7l1.3-6c.2-1-1.1-1.6-1.7-.8Z';
  const BOLT_STARS = [
    { d: 'M4.5 3.2 5.1 4.9 6.8 5.5 5.1 6.1 4.5 7.8 3.9 6.1 2.2 5.5 3.9 4.9Z', delay: '0s' },
    { d: 'M19.6 12.9 20.1 14.4 21.6 14.9 20.1 15.4 19.6 16.9 19.1 15.4 17.6 14.9 19.1 14.4Z', delay: '0.62s' },
    { d: 'M9.3 18.9 9.7 20 10.8 20.4 9.7 20.8 9.3 21.9 8.9 20.8 7.8 20.4 8.9 20Z', delay: '1.24s' },
  ];
  // The pair needs its own positioning context. The second bolt is absolutely positioned, and an absolutely
  // positioned box resolves against the nearest *positioned ancestor* — not against its sibling — so two bare
  // sibling <svg> elements let it escape the icon box entirely. One relative wrapper fixes it; the CSS paints
  // the second one as an outline and hides its sparkles.
  const boltGlyph = (className, armed, variant) => h('svg', {
    className, width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true,
    fill: armed ? `url(#${variant === 'gold' ? 'cg-bolt-gold' : 'cg-bolt-deep'})` : 'none',
    stroke: armed || variant === 'gold' ? `url(#${variant === 'gold' ? 'cg-bolt-gold' : 'cg-bolt-deep'})` : 'currentColor',
    strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
  },
  h('path', { d: BOLT_PATH }),
  ...(armed ? BOLT_STARS.map((star, index) => h('path', { key: index, className: 'cg-bolt-star', d: star.d, stroke: 'none', style: { animationDelay: star.delay } })) : []));
  // Eleven meteors on staggered delays; geometry lives in CSS, this only seeds the field.
  // The ref is where the measured track width is written (see the measuring effect).
  const meteorField = shellRef => h('span', { className: 'cg-model-meteors', ref: shellRef, 'aria-hidden': true },
    ...Array.from({ length: 11 }, (_, index) => h('span', { key: index, className: 'cg-model-meteor' })));

  /** Post one turbo patch/read over the authenticated DSH connection carrier. */
  async function turboRequest(action, sessionId, change) {
    const result = await ctx.connection.rpc.call('/api', 'dsh-codex-ui/turbo', { action, sessionId, ...(change ?? {}) });
    if (!result?.ok) throw new Error(result?.error?.message || '推理编排状态更新失败，请重试。');
    return result.value ?? {};
  }

  // The composer switches are per session, but a conversation the user has not started yet
  // should keep the ones they were just using instead of silently reporting "off". The
  // memory is client-side because only the client knows whether a session is still blank.
  const SWITCH_MEMORY = 'dsh-codex-ui/composer-switches';

  function rememberedSwitches() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(SWITCH_MEMORY) ?? '{}');
      return { lightning: raw?.lightning === true, ultra: raw?.ultra === true, superfast: raw?.superfast === true };
    } catch {
      return { lightning: false, ultra: false, superfast: false };
    }
  }

  function rememberSwitches(change) {
    try {
      window.localStorage.setItem(SWITCH_MEMORY, JSON.stringify({ ...rememberedSwitches(), ...change }));
    } catch {
      // Storage may be unavailable; the switches then simply do not carry over.
    }
  }

  // A model's display name is the user's own business: aliases live in the client, keyed by
  // provider and model id. An alias used to change only what this plugin paints; it is now also
  // pushed to the Host, which puts it in the system prompt so the assistant answers to that name.
  // The real model id is still what the Host is asked for, so an alias can be any text at all —
  // Chinese, English, emoji — without touching routing.
  const MODEL_ALIASES = ALIASES_KEY;

  function readModelAliases() {
    return readAliases();
  }

  function writeModelAliases(next) {
    try {
      window.localStorage.setItem(MODEL_ALIASES, JSON.stringify(next));
    } catch {
      // Display-only: a refused write costs the next page load, nothing else.
    }
    // One publish per write: the Host keeps the map the prompt section reads.
    publishAliases();
  }

  function ModelControl({ locked, available, directory, load, select, sessionId, useSessions }) {
    const subscribe = React.useCallback(listener => directory.subscribe(listener), [directory]);
    const snapshot = React.useCallback(() => directory.getSnapshot(), [directory]);
    const state = React.useSyncExternalStore(subscribe, snapshot);
    const [open, setOpen] = React.useState(false);
    const [pane, setPane] = React.useState('effort');
    const [query, setQuery] = React.useState('');
    const [draftIndex, setDraftIndex] = React.useState(null);
    const [actionError, setActionError] = React.useState(null);
    const [lightning, setLightning] = React.useState(false);
  // The tree switch. The Host deliberately keeps the two flags independent (`superfast` never writes
  // `lightning`), so exclusivity is the UI's job — see chooseMode below.
  const [superfast, setSuperfast] = React.useState(false);
    // The Host's record of the Ultra switch. It only re-pins the slider on the first
    // sync; after that the slider position is the truth and this is the last value we
    // pushed, which keeps a slow Host response from fighting the user's drag.
    const [ultraFlag, setUltraFlag] = React.useState(false);
    const [turboReady, setTurboReady] = React.useState(false);
    // Token multiplier the armed contract states, as reported by the Host. Defaults to
    // the contract's own figure so the label is never blank before the first read.
    const [budget, setBudget] = React.useState({ value: 15, exact: false });
    const rootRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    const popupRef = React.useRef(null);
    const focusPending = React.useRef(false);
    const effortQueue = React.useRef(null);
    const effortSaving = React.useRef(false);
    const effortTarget = React.useRef(null);
    // A meteor must cross the whole track, and `translateX(100%)` inside the keyframes
    // resolves against the meteor's own width — not the track. So the track is measured
    // and handed over as a pixel distance; without this the shower stops around the
    // middle of the rail. The effect body is declared below the derived `ultraOn`.
    const meteorShellRef = React.useRef(null);
    const meteorFieldRef = React.useRef(null);
    // The knob is positioned from a percentage plus `translateX(-50%)`, which lands its edges on
    // fractional device pixels at a fractional DPR — and a circle rasterised off the grid reads as a
    // rounded square. This ref lets the effect below rewrite `left` on the device-pixel grid.
    const thumbRef = React.useRef(null);
    const lightningRef = React.useRef(false);
  const superfastRef = React.useRef(false);
    const ultraSentRef = React.useRef(null);
    // Set when a blank conversation adopted the remembered switches, so the Ultra pin also
    // reaches the model directory once its effort levels are known.
    const inheritEffortRef = React.useRef(false);
    // Landing on Ultra briefly replaces the tier name with what that tier costs. Declared
    // last so every ref index the tests script against keeps its position.
    const ultraNoticeTimer = React.useRef(null);
    // Also last: a ref index the tests script against must not move. This one measures the rename
    // field so a long name makes the box taller instead of overflowing it.
    const aliasFieldRef = React.useRef(null);
    const [ultraNotice, setUltraNotice] = React.useState(false);
    // Declared last so every state index the tests script against keeps its position: the alias
    // map, and the row currently being renamed (`{ key, name, draft }` or null).
    const [aliases, setAliases] = React.useState(readModelAliases);
    const [aliasEditor, setAliasEditor] = React.useState(null);
    // The catalog the menu is showing is published to the Host too: a model whose displayed name comes
    // from the catalog rather than from the rename box must still be named in the prompt.
    React.useEffect(() => { publishCatalogNames(state.groups); }, [state.groups]);
    // Opening the model menu is another natural moment to push: by then the connection is certainly up.
    React.useEffect(() => { if (open) publishAliases(); }, [open]);
    const aliasKey = (providerId, modelId) => `${providerId}/${modelId}`;
    // A name belongs to one account's model, not to the model id at large: two keys can offer the
    // same model id, and naming one must not rename the other. So the key is `provider/model`, and
    // a bare-id entry is only read for legacy storage — it is dropped the moment that model is
    // renamed under any account, because until then it would keep bleeding across accounts.
    const aliasOf = (providerId, model) => aliases?.[aliasKey(providerId, model.id)] || model.name;
    const hasAlias = (providerId, model) => Boolean(aliases?.[aliasKey(providerId, model.id)]);
    const clearAlias = (providerId, model) => {
      const next = { ...aliases };
      delete next[aliasKey(providerId, model.id)];
      delete next[model.id];
      return next;
    };
    const commitAlias = next => { setAliases(next); writeModelAliases(next); };
    // Storage is the truth whenever the panel opens: a name saved in another tab, or in a session
    // whose state was seeded before the write, must still show up in this list. Closing the panel
    // also drops a half-typed editor, so reopening never resumes a stale draft.
    React.useEffect(() => {
      if (!open) { setAliasEditor(null); return; }
      const stored = readModelAliases();
      setAliases(current => (JSON.stringify(current ?? {}) === JSON.stringify(stored) ? current : stored));
    }, [open]);
    // A long display name wraps and the field grows downward. Measured rather than guessed: the
    // browser knows how tall the wrapped text is, so the field is reset to auto and then to that
    // height. `scrollHeight` is absent in the test shim, which is why it is optional here.
    React.useEffect(() => {
      const field = aliasFieldRef.current;
      if (field == null || typeof field.style?.setProperty !== 'function') return;
      field.style.height = 'auto';
      const measured = field.scrollHeight;
      if (typeof measured === 'number' && measured > 0) field.style.height = `${measured}px`;
    }, [aliasEditor?.draft, aliasEditor?.modelId]);
    /** Show the Ultra cost notice for a moment, restarting it if it is already up. */
    const showUltraNotice = () => {
      setUltraNotice(true);
      if (ultraNoticeTimer.current !== null) clearTimeout(ultraNoticeTimer.current);
      ultraNoticeTimer.current = setTimeout(() => { ultraNoticeTimer.current = null; setUltraNotice(false); }, 1600);
    };
    // A session is blank only while the user has not sent anything in it; the client is the
    // only side that knows, and the inherited switches must not leak into running ones.
    const blank = useSessions?.(state => state?.byId?.[sessionId]?.blank) === true;
    // The armed bolt is painted with a shared deep purple gradient. SVG resolves
    // `url(#id)` against the document, so the definition is mounted once per
    // component and removed on unmount — never by parsing another plugin's DOM.
    React.useEffect(() => {
      const namespace = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(namespace, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.position = 'absolute';
      const defs = document.createElementNS(namespace, 'defs');
      // Two gradients, built the same way: the bolt's own paint is a mode colour, and 超快 is gold while Fast
      // stays purple. One gradient per mode rather than one recoloured, because both modes render the same glyph.
      const addGradient = (id, stops) => {
        const gradient = document.createElementNS(namespace, 'linearGradient');
        gradient.setAttribute('id', id);
        gradient.setAttribute('x1', '0');
        gradient.setAttribute('y1', '0');
        gradient.setAttribute('x2', '24');
        gradient.setAttribute('y2', '24');
        gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        for (const [offset, color] of stops) {
          const stop = document.createElementNS(namespace, 'stop');
          stop.setAttribute('offset', offset);
          stop.setAttribute('stop-color', color);
          gradient.append(stop);
        }
        defs.append(gradient);
      };
      // Fast lightning keeps the three stops the effort ramp ends on, so that bolt and the track agree.
      addGradient('cg-bolt-deep', [['0%', '#4c1d95'], ['46%', '#8a4ff0'], ['100%', '#bb74ff']]);
      // 超快: its own gold, so repainting one mode never touches the other.
      addGradient('cg-bolt-gold', [['0%', '#c8860d'], ['46%', '#f0b429'], ['100%', '#ffe08a']]);
      svg.append(defs);
      document.body.append(svg);
      return () => { svg.remove(); };
    }, []);
    const choices = state.groups.flatMap(group => group.models.map(model => ({ group, model })));
    const chosen = choices.find(choice => choice.group.id === state.current?.provider && choice.model.id === state.current?.model);
    const reasoning = chosen?.model.reasoning;
    // Ultra is a virtual step appended to the model's real efforts, so the slider
    // shows one more position than the directory holds and never sends `ultra` as
    // an effort id. A model that advertises a real `ultra` level keeps it as-is.
    const levels = reasoning?.efforts || [];
    const realLevels = levels.filter(level => level.id !== 'ultra');
    const hasRealUltra = levels.some(level => level.id === 'ultra');
    const virtualUltra = realLevels.length > 0 && !hasRealUltra;
    const steps = virtualUltra ? [...realLevels, { id: '__ultra__', name: 'Ultra' }] : levels;
    const maxIndex = Math.max(0, steps.length - 1);
    const effectiveValue = hasRealUltra ? 'ultra' : state.current?.reasoningEffort ?? reasoning?.defaultEffort;
    const effectiveIndex = steps.findIndex(step => step.id === effectiveValue);
    // The pinned Ultra position. The directory only ever holds the real maximum, so
    // the switch is the only thing that separates "Ultra" from "maximum"; a drag
    // preview always wins over whichever position was stored.
    const pinnedIndex = ultraFlag ? (virtualUltra ? maxIndex : Math.max(0, effectiveIndex)) : Math.max(0, effectiveIndex);
    const shownIndex = draftIndex !== null ? Math.min(draftIndex, maxIndex) : pinnedIndex;
    const shownUltra = virtualUltra && shownIndex === maxIndex
      || hasRealUltra && shownIndex === effectiveIndex && effectiveValue === 'ultra';
    const displayLevel = draftIndex === null ? steps[shownIndex] : steps[draftIndex];
    const label = shownUltra ? 'Ultra' : displayLevel ? effortLabel(displayLevel) : state.retainedEffort || 'Off';
    const ultraOn = shownUltra;
    // The visible tier name is what carries the transient Ultra cost notice; the accessible
    // name stays the tier itself.
    const displayLabel = ultraOn && ultraNotice ? '更快消耗 Token' : label;
    // Hooks for the depth ramp: the tier the slider shows, plus a 0..4 bucket so a model
    // with a level id the CSS does not know still deepens instead of staying flat.
    const effortTone = shownUltra ? 'ultra' : (effectiveIndex >= 0 ? steps[shownIndex]?.id ?? 'off' : 'off');
    const effortDepth = maxIndex > 0 ? Math.round(shownIndex / maxIndex * 4) : 0;
    // "at least 15x the tokens": the contract's own budget figure, not a second guess.
    // The tree runs one extra tier (each tier-1 child opens two grandchildren), so it costs several flat
  // rounds at once. The figure is the Host's own per-round multiple, not a second measurement: the UI must
  // not invent a number it cannot source.
  const treeTokenLabel = `每层 ${budget.value}×token消耗`;
  const tokenLabel = `${budget.exact ? '至少 ' : '约 '}${budget.value}× token`;
    const modelName = chosen ? aliasOf(chosen.group.id, chosen.model) : state.current?.model || '选择模型';
    const busy = locked || state.pending !== null;
    const close = React.useCallback(() => { setOpen(false); setDraftIndex(null); triggerRef.current?.focus(); }, []);
    // Track width feeds the meteor travel distance, so it is measured whenever the track can exist
    // and re-measured whenever it resizes. The dependency on `open` is the load-bearing one: the
    // rail only mounts inside the popover, so measuring on `ultraOn` alone found a null ref whenever
    // Ultra was switched on with the popover shut, and the fallback then stopped the shower at the
    // meteor's own width instead of the width of the track.
    React.useEffect(() => {
      if (!ultraOn || !open) return undefined;
      const shell = meteorShellRef.current;
      if (!shell) return undefined;
      const measure = () => {
        const travel = `${Math.round(shell.clientWidth + 36)}px`;
        meteorFieldRef.current?.style.setProperty('--cg-meteor-travel', travel);
      };
      measure();
      if (typeof ResizeObserver !== 'function') return undefined;
      const observer = new ResizeObserver(measure);
      observer.observe(shell);
      return () => observer.disconnect();
    }, [ultraOn, open]);
    // The knob's position is CSS, not a measurement.
    //
    // It used to be written from a layout effect that read the shell's width. Reported symptom: at Ultra the
    // knob stopped 3.2px short of the track's end while the fill reached it, which reads as the knob
    // "bouncing back" and leaving a gap. Measured cause: the effect read the width during the popover's
    // entrance — 227.2px instead of the settled 230.4px — and no later pass corrected it. A `calc` cannot
    // measure early: `12px + (100% - 24px) × ratio` is the same band (centre from 12 to width−12, so at
    // ratio 0 and 1 the circle's edge sits exactly on the track's edge) evaluated by the browser at whatever
    // width the track actually has.
    const knobRatio = maxIndex > 0 ? shownIndex / maxIndex : 0;
    React.useEffect(() => { if (effortTarget.current === null || effortTarget.current === effectiveValue) setDraftIndex(null); }, [effectiveValue]);
    React.useEffect(() => { effortQueue.current = null; effortTarget.current = null; setDraftIndex(null); }, [state.current?.provider, state.current?.model]);
    React.useEffect(() => { if (locked || !available) setOpen(false); }, [locked, available]);
    React.useEffect(() => {
      if (!open) return;
      const outside = event => { if (!rootRef.current?.contains(event.target)) { setOpen(false); setDraftIndex(null); } };
      const escape = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (pane === 'model' && state.current !== null) { setPane('effort'); focusPending.current = true; }
        else close();
      };
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', escape, true);
      return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
    }, [open, pane, state.current, close]);
    React.useEffect(() => {
      if (!open || !focusPending.current) return;
      focusPending.current = false;
      const handle = requestAnimationFrame(() => (popupRef.current?.querySelector(pane === 'model' ? 'input[type="search"]' : 'input[type="range"]:not(:disabled)') || popupRef.current?.querySelector('button:not(:disabled)'))?.focus());
      return () => cancelAnimationFrame(handle);
    }, [open, pane]);
    // The arming state lives on the Host so it survives a page reload; read it once
    // per session and adopt the answer, then let local intent win until it changes.
    React.useEffect(() => {
      if (typeof sessionId !== 'string' || !sessionId) return;
      let cancelled = false;
      ultraSentRef.current = null;
      turboRequest('read', sessionId).then(value => {
        if (cancelled) return;
        let nextLightning = value.lightning === true;
        let nextSuperfast = value.superfast === true;
        let nextUltra = value.ultra === true;
        // A conversation that has not started yet keeps the switches the user last used, so
        // opening New Chat no longer drops Lightning or the Ultra pin. A running session is
        // never touched: only its own row counts there.
        if (blank && (!nextLightning || !nextSuperfast || !nextUltra)) {
          const memory = rememberedSwitches();
          if (!nextUltra && memory.ultra) {
            nextUltra = true;
            inheritEffortRef.current = true;
          }
          // The tree is the heavier of the two, so it is inherited as the tree: the flat switch stays off,
          // and the Host's own rule (`lightning || superfast`) still yields that contract underneath it.
          if (!nextSuperfast && memory.superfast) {
            nextSuperfast = true;
            nextLightning = false;
            turboRequest('update', sessionId, { lightning: false, superfast: true }).catch(error => setActionError(error.message || String(error)));
          }
          if (!nextLightning && !nextSuperfast && memory.lightning) {
            nextLightning = true;
            turboRequest('update', sessionId, { lightning: true }).catch(error => setActionError(error.message || String(error)));
          }
        }
        lightningRef.current = nextLightning;
        superfastRef.current = nextSuperfast;
        // Adopting the Host value also satisfies the sync below, so merely opening a
        // session does not write it back: a no-op write would materialise a state row and
        // freeze whatever default happened to be in force at that moment. Only the Host's
        // own value counts as adopted — an inherited Ultra still has to be pushed.
        ultraSentRef.current = value.ultra === true;
        setLightning(nextLightning);
        setSuperfast(nextSuperfast);
        setUltraFlag(nextUltra);
        if (Number.isFinite(value.tokenMultiple) && value.tokenMultiple > 0) setBudget({ value: value.tokenMultiple, exact: value.tokenExact === true });
        setTurboReady(true);
      }).catch(error => {
        if (cancelled) return;
        setTurboReady(false);
        setActionError(error.message || String(error));
      });
      return () => { cancelled = true; };
    }, [sessionId]);
    // Keep the Host flag equal to what the track shows, so every path that leaves the
    // Ultra step (drag, arrow keys, reset, model switch) — and the first sync after a
    // reload — converges on one writer.
    React.useEffect(() => {
      if (!turboReady || typeof sessionId !== 'string' || !sessionId) return;
      if (ultraSentRef.current === ultraOn) return;
      ultraSentRef.current = ultraOn;
      setUltraFlag(ultraOn);
      turboRequest('update', sessionId, { ultra: ultraOn }).catch(error => {
        ultraSentRef.current = null;
        setActionError(error.message || String(error));
      });
    }, [turboReady, ultraOn, sessionId]);
    // Landing on Ultra briefly replaces the tier name with what that tier costs. The notice
    // is fired by the move itself (see chooseLevel) rather than by watching the pinned flag,
    // so a session that merely opens already pinned does not flash it.
    React.useEffect(() => () => { if (ultraNoticeTimer.current !== null) clearTimeout(ultraNoticeTimer.current); }, []);
    // An inherited Ultra pin must also reach the directory, otherwise the track would claim
    // Ultra while the session still runs at the previous effort. Wait for the levels, then
    // take the same path a drag to the Ultra step takes.
    React.useEffect(() => {
      if (!inheritEffortRef.current) return;
      if (!turboReady || !blank) { inheritEffortRef.current = false; return; }
      if (!ultraOn || !virtualUltra || !steps.length) return;
      if (effectiveIndex < 0 || effectiveIndex >= maxIndex) { inheritEffortRef.current = false; return; }
      inheritEffortRef.current = false;
      chooseLevel(String(maxIndex));
    }, [turboReady, blank, ultraOn, virtualUltra, steps.length, effectiveIndex, maxIndex]);
    // One writer for the pair. 快速 and 超快 are mutually exclusive here even though the Host stores the two
    // flags independently: `superfast` already implies the flat Lightning contract in the prompt
    // (`turbo-policy.js`: `if (lightning || superfast) parts.push(LIGHTNING_POLICY)`), so showing both as on
    // would misdescribe what is running. Choosing the option that is already active clears it.
    const chooseMode = mode => {
      const nextFast = mode === 'fast' && lightningRef.current === false;
      const nextTree = mode === 'tree' && superfastRef.current === false;
      const previous = { lightning: lightningRef.current, superfast: superfastRef.current };
      lightningRef.current = nextFast;
      superfastRef.current = nextTree;
      setLightning(nextFast);
      setSuperfast(nextTree);
      setPane('effort');
      setActionError(null);
      rememberSwitches({ lightning: nextFast, superfast: nextTree });
      if (typeof sessionId !== 'string' || !sessionId) return;
      turboRequest('update', sessionId, { lightning: nextFast, superfast: nextTree }).catch(error => {
        lightningRef.current = previous.lightning;
        superfastRef.current = previous.superfast;
        setLightning(previous.lightning);
        setSuperfast(previous.superfast);
        setActionError(error.message || String(error));
      });
    };
    async function choose(selection) {
      if (locked || !available || directory.getSnapshot().pending !== null) return false;
      setActionError(null);
      try {
        const result = await select(selection);
        if (!result?.ok) {
          if (result) setActionError(result.error.code === 'session/writer-held' ? '当前会话已被占用，请退出其他正在运行的 DSH 后重试。' : `${result.error.code}: ${result.error.message}`);
          setDraftIndex(null);
          return false;
        }
        return true;
      } catch (error) {
        setActionError(error.message || String(error));
        setDraftIndex(null);
        return false;
      }
    }
    const chooseLevel = async value => {
      const index = Number(value), step = steps[index];
      if (!state.current || !step || locked || !available) return;
      // The virtual Ultra step writes the highest real tier, never the literal id.
      const effortId = step.id === '__ultra__' ? realLevels[realLevels.length - 1].id : step.id;
      // A deliberate move to or away from the Ultra step is what the next conversation
      // inherits; a hydration no-op never reaches here.
      rememberSwitches({ ultra: step.id === '__ultra__' });
      setDraftIndex(index);
      effortTarget.current = effortId;
      effortQueue.current = { provider: state.current.provider, model: state.current.model, reasoningEffort: effortId };
      if (effortSaving.current) return;
      effortSaving.current = true;
      setActionError(null);
      try {
        while (effortQueue.current) {
          const selection = effortQueue.current;
          effortQueue.current = null;
          const current = directory.getSnapshot().current;
          if (current?.reasoningEffort === selection.reasoningEffort) continue;
          const result = await select(selection);
          if (!result?.ok) throw new Error(result?.error?.message || '强度更新失败，请重试。');
        }
        const current = directory.getSnapshot().current;
        if (current?.reasoningEffort === effortTarget.current) setDraftIndex(null);
      } catch (error) {
        effortQueue.current = null;
        effortTarget.current = null;
        setDraftIndex(null);
        setActionError(error.message || String(error));
      } finally { effortSaving.current = false; }
    };
    const show = () => {
      if (busy) return;
      setActionError(null);
      setQuery('');
      setPane(state.current === null ? 'model' : 'effort');
      setOpen(true);
      focusPending.current = true;
      load();
    };
    const reset = () => {
      if (!state.current) return;
      // Reset means "leave Ultra". The pin has to go with the effort: the track position is
      // `ultraFlag ? maxIndex : effectiveIndex`, so clearing only the directory effort left
      // the bar parked on Ultra and the session still carrying the Ultra contract.
      rememberSwitches({ ultra: false });
      setUltraFlag(false);
      setDraftIndex(null);
      choose({ provider: state.current.provider, model: state.current.model, ...(reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: reasoning.defaultEffort }) });
    };
    if (!available) return null;
    const error = actionError || state.error;
    // Renaming is display-only, so the row says so: a name that reads like a model id but is not one
    // would otherwise be a trap. An empty draft (or the original name) clears the alias.
    const saveAlias = () => {
      const draft = String(aliasEditor?.draft ?? '').trim();
      const next = { ...aliases };
      // One account's model, one name. Any legacy bare-id entry for this model id is removed as
      // well: it could not be told apart per account, which is exactly what it kept doing wrong.
      delete next[aliasEditor?.modelId];
      if (draft === '' || draft === aliasEditor?.name) delete next[aliasEditor?.key];
      else next[aliasEditor.key] = draft;
      commitAlias(next);
      setAliasEditor(null);
    };
    // No dialog, no backdrop, no floating panel: the editor replaces the row it belongs to. A panel
    // sized and positioned by hand was clipped by its own popover, and clicking the pencil could
    // leave the reader with nothing on screen — the row itself cannot go missing.
    const filteredGroups = state.groups.map(group => ({ ...group, models: group.models.filter(model => {
      // Coerced on purpose: a render can arrive with the search slot unset, and an unset slot must
      // read as "no query" instead of taking the panel down.
      const needle = String(query ?? '').trim().toLowerCase();
      // Search finds a model by either of its names: the real one, and the alias the user gave it.
      return model.name.toLowerCase().includes(needle) || String(aliases?.[aliasKey(group.id, model.id)] ?? '').toLowerCase().includes(needle);
    }) })).filter(group => group.models.length);
    const catalogGroups = filteredGroups.map(group => h('div', { key: group.id },
      h('div', { className: 'cg-model-provider' }, filteredGroups.length === 1 ? '推荐模型集' : group.id === 'deepseek-account' ? 'DeepSeek 账号' : group.name),
      ...group.models.map(model => {
        const rowHasAlias = hasAlias(group.id, model);
        // Compared by the full key, not by the model id: two accounts can offer the same model id,
        // and matching on the id put *both* of their rows into editing at once.
        const editing = aliasEditor != null && aliasEditor.key === aliasKey(group.id, model.id);
        const openEditor = () => setAliasEditor({
          key: aliasKey(group.id, model.id), modelId: model.id, name: model.name,
          draft: aliases?.[aliasKey(group.id, model.id)] ?? aliases?.[model.id] ?? ''
        });
        const row = h('div', { key: model.id, className: editing ? 'cg-model-row cg-model-row-editing' : 'cg-model-row' },
          editing ? h('div', { className: 'cg-model-editor' },
            // The name's own place becomes the field. It is a textarea so that a long name wraps and
            // the box grows downward instead of the text running off the edge; Enter still commits,
            // because a display name is one line's worth of text.
            h('textarea', {
              className: 'cg-model-alias-input', ref: aliasFieldRef, rows: 1, autoFocus: true,
              value: aliasEditor.draft, placeholder: model.name,
              'aria-label': `为 ${model.name} 输入显示名`,
              title: '回车保存；留空恢复原名；Esc 取消',
              onChange: event => setAliasEditor({ ...aliasEditor, draft: event.target.value }),
              onKeyDown: event => {
                if (event.key === 'Enter') { event.preventDefault?.(); saveAlias(); }
                if (event.key === 'Escape') setAliasEditor(null);
              }
            }),
            // Two glyphs, not a button bar: confirm and cancel on the ends of the field they belong
            // to. No blur handler any more — clicking the ✓ must not race a focus loss that would
            // have closed the editor out from under the click.
            h('button', { type: 'button', className: 'cg-model-alias-cancel', 'aria-label': '取消改名', title: '取消', onClick: () => setAliasEditor(null) }, h(Icon, { name: 'close', size: 13 })),
            h('button', { type: 'button', className: 'cg-model-alias-save', 'aria-label': `保存 ${model.name} 的显示名`, title: '保存', onClick: saveAlias }, h(Icon, { name: 'check', size: 13 })))
          : h('div', { className: 'cg-model-viewer' },
            h('button', {
              key: model.id, type: 'button', role: 'menuitemradio',
              'aria-checked': state.current?.provider === group.id && state.current?.model === model.id,
              className: 'cg-model-option', disabled: busy,
              title: rowHasAlias ? `原名 ${model.name}` : undefined,
              onClick: async () => {
                const same = state.current?.provider === group.id && state.current?.model === model.id;
                const effort = same ? state.current.reasoningEffort ?? model.reasoning?.defaultEffort : model.reasoning?.defaultEffort;
                if (await choose({ provider: group.id, model: model.id, ...(effort === undefined ? {} : { reasoningEffort: effort }) })) {
                  setDraftIndex(null); setPane('effort'); focusPending.current = true;
                }
              }
            }, h('span', null, aliasOf(group.id, model)), state.current?.provider === group.id && state.current?.model === model.id && h(Icon, { name: 'check', size: 14 })),
            // The rename affordance is back as its own control, because a click on the row already
            // means "use this model": a double click there selects first and edits second, which is
            // not a gesture a reader can act on. It is a sibling of the selector (a button inside a
            // button is invalid markup) and it only fades in under the pointer.
            h('button', {
              type: 'button', className: rowHasAlias ? 'cg-model-rename cg-model-alias-on' : 'cg-model-rename', disabled: busy,
              'aria-label': rowHasAlias ? `修改 ${aliasOf(group.id, model)} 的显示名（原名 ${model.name}）` : `自定义 ${model.name} 的显示名`,
              title: rowHasAlias ? `改名或清空以恢复原名 ${model.name}` : '自定义显示名（只影响这里显示的叫法）',
              onClick: () => { setPane('model'); openEditor(); }
            }, h(Icon, { name: 'edit', size: 12 }))));
        return row;
      })));
    return h('div', { className: 'cg-model-root', ref: rootRef, 'data-ultra': ultraOn, 'data-superfast': superfast, 'data-lightning': lightning, 'data-effort': effortTone },
      h('button', { className: 'cg-model-trigger', type: 'button', ref: triggerRef, disabled: busy, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': `选择模型，当前 ${modelName}${steps.length || state.retainedEffort ? `，推理强度 ${label}` : ''}${lightning ? '，闪电编排已开启' : ''}${superfast ? '，超快编排已开启' : ''}`, onClick: () => open ? close() : show() },
        // No leading bolt here: the lightning switch lives in the popover, and an armed
        // session shows its marker after the effort label instead.
        h('span', { className: 'cg-model-trigger-name' }, modelName),
        (steps.length > 0 || state.retainedEffort) && h('span', { className: 'cg-model-trigger-effort', 'data-ultra': ultraOn, 'data-effort': effortTone, 'data-notice': ultraOn && ultraNotice }, effectiveIndex >= 0 ? displayLabel : state.retainedEffort || 'Off'),
        (lightning || superfast) && h('span', { className: 'cg-model-trigger-bolt', 'data-tree': superfast }, boltGlyph(undefined, true, superfast ? 'gold' : undefined)),
        h(Icon, { name: 'down', size: 12 })),
      open && h('div', { className: 'cg-model-popover', ref: popupRef, role: 'dialog', 'aria-label': '模型与推理强度', 'data-ultra': ultraOn, 'data-superfast': superfast, 'data-pane': pane, 'data-effort': effortTone, 'data-notice': ultraOn && ultraNotice },
        // Keyed on the pane so switching replays the entrance: the two views cross over instead of
        // swapping in one frame. The wrapper changes nothing about layout — the popover styles no
        // direct children.
        pane === 'lightning' ? h('div', { className: 'cg-model-pane', key: 'lightning' },
          h('div', { className: 'cg-model-modes', role: 'menu', 'aria-label': '编排模式' },
            h('button', { className: 'cg-model-mode', type: 'button', role: 'menuitemradio', 'aria-checked': !lightning && !superfast, 'data-on': !lightning && !superfast, 'data-mode': 'standard', disabled: busy || !sessionId, onClick: () => chooseMode('standard') },
              h('span', { className: 'cg-model-mode-text' },
                h('strong', null, '标准'),
                h('span', null, '默认速度')),
              h('span', { className: 'cg-model-mode-check', 'aria-hidden': true }, !lightning && !superfast && h(Icon, { name: 'check', size: 14 }))),
            h('button', { className: 'cg-model-mode', type: 'button', role: 'menuitemradio', 'aria-checked': lightning, 'data-on': lightning, 'data-mode': 'fast', disabled: busy || !sessionId, onClick: () => chooseMode('fast') },
              h('span', { className: 'cg-model-mode-text' },
                h('strong', null, '快速'),
                h('span', null, `${tokenLabel} 用量更多`)),
              h('span', { className: 'cg-model-mode-check', 'aria-hidden': true }, lightning && h(Icon, { name: 'check', size: 14 }))),
            h('button', { className: 'cg-model-mode', type: 'button', role: 'menuitemradio', 'aria-checked': superfast, 'data-on': superfast, 'data-mode': 'tree', disabled: busy || !sessionId, onClick: () => chooseMode('tree') },
              h('span', { className: 'cg-model-mode-text' },
                h('strong', null, '超快'),
                h('span', null, `${treeTokenLabel} 更快更好的回答`)),
              h('span', { className: 'cg-model-mode-check', 'aria-hidden': true }, superfast && h(Icon, { name: 'check', size: 14 })))))
        : pane === 'effort' ? h('div', { className: 'cg-model-pane', key: 'effort' },
          h('div', { className: 'cg-model-top' },
            h('button', { className: 'cg-model-zap', type: 'button', 'data-on': lightning || superfast, 'data-mode': superfast ? 'tree' : lightning ? 'fast' : 'off', disabled: busy || !sessionId, 'aria-haspopup': 'menu', 'aria-expanded': pane === 'lightning', 'aria-label': superfast ? '编排模式：超快已开启，点击更换' : lightning ? '编排模式：快速已开启，点击更换' : '编排模式：选择快速或超快', onClick: () => setPane(pane === 'lightning' ? 'effort' : 'lightning') },
              superfast ? boltGlyph('cg-model-zap-glyph', true, 'gold') : boltGlyph('cg-model-zap-glyph', lightning),
              h('span', { className: 'cg-model-tooltip', role: 'tooltip' }, superfast ? `超快编排：已开启，每个子代理再开两个孙代理，${treeTokenLabel}` : lightning ? `快速编排：已开启，${tokenLabel}` : `编排模式：快速每轮至少并发 2 个子代理，${tokenLabel}`)),
            h('button', { className: 'cg-model-summary', type: 'button', disabled: busy, 'aria-label': '更换模型', onClick: () => { setPane('model'); focusPending.current = true; } }, h('strong', { 'aria-live': 'polite', 'data-notice': ultraOn && ultraNotice }, steps.length ? displayLabel : '选择模型'), h('span', { className: 'cg-model-summary-name' }, modelName, h(Icon, { name: 'chevron', size: 11 }))),
            h('button', { className: 'cg-model-reset', type: 'button', 'aria-label': '恢复默认强度', disabled: busy || !reasoning || !state.current, onClick: reset }, glyph('reset'), h('span', { className: 'cg-model-tooltip', role: 'tooltip' }, '重置为默认')),
            // The burst lives on the row, not inside the bolt: when the knob lands on Ultra the notice hides the
            // three controls — .cg-model-zap gets opacity:0 — and a parent's opacity cannot be undone by any child,
            // so a burst nested in the button was invisible for its whole 620ms on the one path that matters.
            // The three controls fade out while this stands in their row, so the popover
            // keeps its height and nothing jumps when the notice comes and goes.
            h('div', { className: 'cg-model-ultra-notice', role: 'status', 'aria-live': 'polite' },
              ultraNotice && ultraOn ? '更快消耗 Token' : '')),
          steps.length > 0 ? h('div', {
          className: 'cg-model-slider-shell', ref: meteorShellRef, 'data-max': shownIndex === maxIndex && maxIndex > 0, 'data-ultra': ultraOn, 'data-effort': effortTone, 'data-depth': effortDepth,
          // Grow the knob only when the pointer is actually over it. The knob cannot receive pointer events
          // itself (`pointer-events: none`, or it would swallow the press and the native range could not be
          // dragged), so the test is geometric: distance from the pointer to the knob's centre against the
          // knob's own radius. The attribute is written straight onto the node — a state update here would
          // re-render the whole popover on every mouse move.
          onPointerMove: event => {
            const thumb = thumbRef.current;
            if (!thumb) return;
            const box = thumb.getBoundingClientRect();
            const dx = event.clientX - (box.left + box.width / 2);
            const dy = event.clientY - (box.top + box.height / 2);
            const over = Math.sqrt(dx * dx + dy * dy) <= box.width / 2 + 2;
            if (over && thumb.getAttribute('data-over') !== 'true') thumb.setAttribute('data-over', 'true');
            else if (!over && thumb.getAttribute('data-over') === 'true') thumb.removeAttribute('data-over');
          },
          onPointerLeave: () => thumbRef.current?.removeAttribute('data-over')
        },
            // The fill ends where the knob *ends*: `24px + (100% − 24px) × ratio` is the knob's right edge, so
            // the bar reaches the far side of the circle at every tier. The bare `ratio × 100%` stopped short of
            // it by `24 × (1 − ratio)` px — 18px at the low tier — and the owner read that, correctly, as the bar
            // not being covered by the dot. This form equals `100%` exactly at ratio 1, so the top tier cannot get
            // shorter; the earlier `ratio × (width − 24)` attempt did shorten it, which is what "you just made the
            // purple shorter" was about.
            h('div', { className: 'cg-model-slider-fill', style: { width: `calc(24px + (100% - 24px) * ${knobRatio})` } }),
            ultraOn && meteorField(meteorFieldRef),
            // A dot states whether the fill has reached it: inside the fill it has to read
            // against the tier colour, outside it stays a track marker.
            h('div', { className: 'cg-model-slider-dots', 'aria-hidden': true }, ...steps.map((step, index) => h('span', { key: step.id, 'data-ultra': step.id === '__ultra__', 'data-on': index <= shownIndex }))),
            h('span', { className: 'cg-model-thumb', 'aria-hidden': true, ref: thumbRef, style: { left: `calc(12px + (100% - 24px) * ${knobRatio})` } }),
            h('input', { className: 'cg-model-slider', type: 'range', min: 0, max: maxIndex, step: 1, value: shownIndex, disabled: locked || maxIndex < 1, 'aria-label': '推理强度', 'aria-valuetext': label,
              // The notice belongs to the move itself, so it fires while the drag is still
              // held — not on release. Release paths (pointerup, keyup, blur) call
              // chooseLevel, and a blur right after a pointerup would announce it twice.
              onChange: event => { const next = Number(event.target.value); setDraftIndex(next); const target = steps[next]; if (target?.id === '__ultra__' || target?.id === 'ultra') showUltraNotice(); },
              onPointerUp: event => chooseLevel(event.currentTarget.value), onKeyUp: event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) chooseLevel(event.currentTarget.value); }, onBlur: event => { if (draftIndex !== null) chooseLevel(event.currentTarget.value); } }))
            : h('p', { className: 'cg-model-message' }, '当前模型未提供推理强度设置。'))
        : pane === 'providers' ? h('div', { className: 'cg-model-pane', key: 'providers' },
          h('div', { className: 'cg-model-catalog-head' },
            h('div', { className: 'cg-model-catalog-title' }, '提供商与模型'),
            h('button', {
              type: 'button', className: 'cg-model-providers-button',
              title: '回到模型列表', 'aria-label': '回到模型列表',
              onClick: () => setPane('model')
            }, '返回')),
          h('p', { className: 'cg-model-provider-note' }, '上半部分是本机模型列表里**已经有**的模型（含你改过的显示名）；下半部分是各家的公开系列参考，不代表这里就能选用，版本很多、可能滞后。'),
          h('div', { className: 'cg-model-providers', 'aria-label': '模型参考清单' },
            // Everything the picker can actually choose, first. The reference list below answers "who makes
            // what"; this answers "what is on this machine", which is what the reader is comparing against
            // when a name from their own list seems to be missing from the catalogue.
            h('div', { className: 'cg-model-provider-group' },
              h('div', { className: 'cg-model-provider-region' }, '本机可用'),
              ...state.groups.map(group => h('details', { className: 'cg-model-provider', key: `local-${group.id}`, open: true },
                h('summary', { className: 'cg-model-provider-name' },
                  h('span', null, group.name ?? group.id),
                  h('span', { className: 'cg-model-provider-count' }, `${group.models.length} 个模型`)),
                h('ul', { className: 'cg-model-provider-models' },
                  ...group.models.map(model => h('li', { key: model.id },
                    hasAlias(group.id, model) ? `${aliasOf(group.id, model)}（${model.name}）` : model.name))))),
              state.groups.length === 0 && h('p', { className: 'cg-model-message' }, '模型列表还没加载。')),
            ...providerGroups().map(group => h('div', { className: 'cg-model-provider-group', key: group.region },
              h('div', { className: 'cg-model-provider-region' }, group.region),
              ...group.providers.map(provider => h('details', { className: 'cg-model-provider', key: provider.id },
                h('summary', { className: 'cg-model-provider-name' },
                  h('span', null, provider.name),
                  h('span', { className: 'cg-model-provider-count' }, provider.verified === undefined ? `${provider.models.length} 个系列` : `${provider.models.length} 个系列 · 已核 ${provider.verified}`)),
                h('ul', { className: 'cg-model-provider-models' },
                  ...provider.models.map(model => h('li', { key: model }, model))),
                provider.site && h('a', { className: 'cg-model-provider-site', href: provider.site, target: '_blank', rel: 'noreferrer noopener' }, '官网')))))))
        : h('div', { className: 'cg-model-pane', key: 'model' },
          h('div', { className: 'cg-model-catalog-head' },
            h('div', { className: 'cg-model-catalog-title' }, '选择模型'),
            // Opens the reference catalogue of providers. A view inside this popover rather than a dialog:
            // it answers a question about the list, so it belongs where the list is.
            h('button', {
              type: 'button', className: 'cg-model-providers-button', 'aria-expanded': false,
              title: '看看各家的模型（参考清单，可能滞后）', 'aria-label': '打开提供商与模型参考清单',
              onClick: () => { setPane('providers'); setQuery(''); }
            }, '提供商')),
          h('div', { className: 'cg-model-catalog-default' }, '默认'),
          choices.length > 4 && h('input', { type: 'search', className: 'cg-model-search', 'aria-label': '搜索模型', placeholder: '搜索模型…', value: query, onChange: event => setQuery(event.target.value), disabled: busy }),
          h('div', { className: 'cg-model-catalog', role: 'menu', 'aria-label': '可用模型' }, ...catalogGroups,
          state.status === 'loading' && h('p', { className: 'cg-model-message', role: 'status' }, '正在加载模型…'),
          state.status !== 'loading' && !filteredGroups.length && h('p', { className: 'cg-model-message' }, query ? '没有匹配的模型。' : '暂无可用模型。'))),
        state.routable === false && h('p', { className: 'cg-model-error' }, '当前模型暂不可用，请选择可用模型。'),
        ...state.failures.map(failure => h('p', { className: 'cg-model-error', key: failure.id }, `${failure.name}: ${failure.message}`)),
        error && h('p', { className: 'cg-model-error', role: 'alert' }, error),
        state.status === 'error' && h('button', { className: 'cg-model-choice', type: 'button', onClick: () => { setActionError(null); load(); }, disabled: busy }, '重新加载')))
  }
  ctx.inject(['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'], scope => {
    const models = scope.modelDirectories;
    const sessions = scope.sessions;
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      priority: -10,
      inject: sessionId => {
        const directory = models.directoryFor(sessionId);
        const available = sessions.subagentAddress(sessionId) === undefined;
        return { available, directory: directory.store, load: () => { if (available) directory.load().catch(() => {}); }, select: selection => available ? directory.select(selection) : Promise.resolve(undefined) };
      }
    }, ModelControl));
  });
}

// Exported so the built artifact can be mounted by a test without running the whole
// client surface; the bundle's own `apply` calls it exactly as a plugin would.
export { registerModelUI };
