import { ALIASES_KEY, readAliases, publishAliases, publishCatalogNames } from './alias-sync.js';
import { PLACEHOLDER_EFFORTS, effortBarEnabled, effortGrade, setEffortGrade } from './effort-bar.js';

// --- 峰谷（DeepSeek 官方规则，2026-08-17 生效）--------------------------------------------------------
// 峰：北京时间周一至周五 09:00-12:00、14:00-18:00，不含中国法定节假日；其余全部为谷（半价）。
// 节假日取国办发明电〔2025〕7号 2026 年放假全表；调休补班日不用建表，因为峰只认周一至周五。
const PEAK_KEY = 'dsh-codex-ui/peak-badge';
const PEAK_TZ_OFFSET_MINUTES = 8 * 60;
const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];
const PEAK_HOLIDAYS = (() => {
  const ranges = [
    ['2026-01-01', '2026-01-03'], ['2026-02-15', '2026-02-23'], ['2026-04-04', '2026-04-06'],
    ['2026-05-01', '2026-05-05'], ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-27'],
    ['2026-10-01', '2026-10-07'],
  ];
  const set = new Set();
  for (const [from, to] of ranges) {
    const day = new Date(`${from}T00:00:00+08:00`);
    const end = new Date(`${to}T00:00:00+08:00`);
    while (day <= end) { set.add(new Date(day.getTime() + PEAK_TZ_OFFSET_MINUTES * 60000).toISOString().slice(0, 10)); day.setDate(day.getDate() + 1); }
  }
  return set;
})();
const peakLocal = date => {
  const shifted = new Date(date.getTime() + PEAK_TZ_OFFSET_MINUTES * 60000);
  const weekday = shifted.getUTCDay();
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const dateKey = shifted.toISOString().slice(0, 10);
  const holiday = PEAK_HOLIDAYS.has(dateKey);
  const inWindow = weekday >= 1 && weekday <= 5 && !holiday && PEAK_WINDOWS.some(([from, to]) => minutes >= from && minutes < to);
  return { peak: inWindow, weekday, minutes, dateKey, holiday };
};
// The next boundary this side of midnight; if nothing is left today, the next day's 09:00 (or the whole weekend).
const peakNextSwitch = (date = new Date()) => {
  const now = date.getTime();
  const shifted = new Date(now + PEAK_TZ_OFFSET_MINUTES * 60000);
  const todayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - PEAK_TZ_OFFSET_MINUTES * 60000;
  // 正在峰中：下一次切换就是当前窗口结束（12:00 或 18:00）。
  if (peakLocal(date).peak) {
    const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    const current = PEAK_WINDOWS.find(([from, to]) => minutes >= from && minutes < to);
    if (current) return new Date(todayStart + current[1] * 60000);
  }
  // 谷中：向前逐日找下一个真正的峰起点，跳过周六周日与中国法定节假日。
  // 旧写法只算当天的窗口，于是周五晚上会报"13 小时后转峰"，而周末全天都是谷、真正的下一次在周一 09:00。
  for (let dayOffset = 0; dayOffset <= 10; dayOffset++) {
    const dayStart = todayStart + dayOffset * 86400000;
    const dayShifted = new Date(dayStart + PEAK_TZ_OFFSET_MINUTES * 60000);
    const weekday = dayShifted.getUTCDay();
    if (weekday < 1 || weekday > 5) continue;
    if (PEAK_HOLIDAYS.has(dayShifted.toISOString().slice(0, 10))) continue;
    for (const [from] of PEAK_WINDOWS) {
      const at = dayStart + from * 60000;
      if (at > now) return new Date(at);
    }
  }
  return new Date(now + 86400000);
};

const peakCountdown = (target, now = new Date()) => {
  let ms = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(ms / 86400000); ms -= days * 86400000;
  const hours = Math.floor(ms / 3600000); ms -= hours * 3600000;
  const minutes = Math.floor(ms / 60000);
  return days > 0 ? `${days}天${hours}小时${minutes}分` : hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分`;
};
const peakReadMode = () => { try { const raw = window.localStorage?.getItem?.(PEAK_KEY); return raw === 'on' || raw === 'off' ? raw : 'auto'; } catch { return 'auto'; } };
let peakMode = peakReadMode();
const peakListeners = new Set();
const peakSubscribe = listener => {
  peakListeners.add(listener);
  // The settings menu lives in another module of this bundle and writes the same key directly, so it announces
  // the change on a DOM event instead: without this the badge only picked the new mode up after a reload.
  const onMode = () => { peakMode = peakReadMode(); for (const l of peakListeners) l(); };
  const target = typeof window !== 'undefined' ? window : undefined;
  try { target?.addEventListener?.('dsh-codex-ui:peak-mode', onMode); } catch { /* 无 DOM 的环境（组件测试替身）直接跳过 */ }
  return () => {
    try { target?.removeEventListener?.('dsh-codex-ui:peak-mode', onMode); } catch { /* 同上 */ }
    peakListeners.delete(listener);
  };
};
const peakModeSnapshot = () => peakMode;
const peakSetMode = next => { peakMode = next === 'on' || next === 'off' ? next : 'auto'; try { window.localStorage?.setItem?.(PEAK_KEY, peakMode); } catch { /* 存储不可用时退回内存 */ } for (const listener of peakListeners) listener(); };
const peakModeLabel = mode => mode === 'on' ? '总是显示' : mode === 'off' ? '隐藏' : '跟随模型';
const peakDirectories = new Map();
// sessionId -> 首次判定出的"是否 DeepSeek"，避免目录晚到时把已经画出来的徽标又撤掉。
const peakVerdict = new Map();
const peakIsDeepSeek = provider => typeof provider === 'string' && provider.startsWith('deepseek');


// The directory is shared with the native /model command and session projection.

// No imports here. `React`, `h`, `paths` and `Icon` come from ui-kit.js, `providerGroups` from
// providers.js, and `ALIASES_KEY` / `readAliases` / `publishAliases` / `publishCatalogNames` from
// alias-sync.js: the build concatenates those three modules into the same factory body *before* this
// one (the same order dsh-codex-ui uses in scripts/build.mjs), which is why they are free symbols.

// One registration per context: the slot below is single-kind, and a second register throws from inside
// the fiber, where the failure reads as a vanished panel rather than a double mount.
//
// Keyed by ctx rather than a plain boolean, because a hot reload mounts the new instance before it
// disposes the old one: a shared flag would make the new instance skip its own registration and then be
// cleared by the old disposer, leaving the slot empty until something applied a third time.
const modelUiRegistered = new WeakSet()

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
    // Three answers about the Host's record for one session, and whose record it is. A boolean made
    // "not read yet" and "the read failed" the same value, and the writer below refuses to speak while
    // it is false — so one failed read disabled the Ultra switch for the rest of the session while the
    // track went on showing Ultra. `phase` names all three cases, `sessionId` makes an answer that
    // belongs to another conversation read as no answer at all, and `retrySeq` is the retry lever:
    // only the user raises it, so a retry can never re-trigger itself.
    const [turboState, setTurboState] = React.useState({ sessionId: null, phase: 'idle', retrySeq: 0 });
    // Token multiplier the armed contract states, as reported by the Host. Defaults to
    // the contract's own figure so the label is never blank before the first read.
    const [budget, setBudget] = React.useState({ value: 1.5, exact: true });
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
    // The knob's position is a `translate` (see the thumb's style below), and this ref is the node the hover
    // test writes `data-over` to.
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
    // The slider track's own width, measured by the same observer that feeds the meteor travel. It no longer decides
    // where the knob is drawn — that is a container-unit calc now, so no missing measurement can strand the knob at
    // the track's start — but the hover hit-test below still wants the travel in pixels.
    const [shellWidth, setShellWidth] = React.useState(0);
    // One hover gesture's worth of the shell's client box. The pointer test used to read the thumb's box on
    // every move; read once instead, and drop the copy whenever it can go stale (leave, resize, scroll).
    const shellRectRef = React.useRef(null);
    // The session whose Host answer the local pin currently mirrors — null between sessions. A ref, not
    // state, because the read effect that clears it runs earlier in the same commit than the writer that
    // has to see it: a `setState` there would still read as the previous session for that whole pass.
    const ultraSyncedRef = React.useRef(null);
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
    //
    // A layout effect, not a passive one: the field mounts with `rows: 1` and the stylesheet gives
    // `.cg-model-alias-input` `overflow: hidden`, so every frame between mount and measurement shows
    // one line with the second one cut and no scrollbar to admit it. A passive effect runs after the
    // paint, which is exactly that frame.
    //
    // The dependency is the editor *object*, not its fields. `openEditor` builds a fresh object on
    // every click, so reopening a row is always a dependency change even when the draft and the model
    // id are byte for byte identical; keying on those two fields dropped precisely the case that
    // matters — a newly mounted textarea whose name had not changed — while still re-running for the
    // case that does not (a keystroke that changes the draft but keeps the node).
    React.useLayoutEffect(() => {
      const field = aliasFieldRef.current;
      if (field == null || typeof field.style?.setProperty !== 'function') return;
      field.style.height = 'auto';
      const measured = field.scrollHeight;
      if (typeof measured === 'number' && measured > 0) field.style.height = `${measured}px`;
    }, [aliasEditor]);
    /** Show the Ultra cost notice for a moment, restarting it if it is already up. */
    const showUltraNotice = () => {
      setUltraNotice(true);
      if (ultraNoticeTimer.current !== null) clearTimeout(ultraNoticeTimer.current);
      ultraNoticeTimer.current = setTimeout(() => { ultraNoticeTimer.current = null; setUltraNotice(false); }, 1600);
    };
    // A session is blank only while the user has not sent anything in it; the client is the
    // only side that knows, and the inherited switches must not leak into running ones.
    //
    // Three answers, not two: a missing row reads `undefined`, and collapsing that to `false` said
    // "this is not a new conversation" about a row that simply had not arrived yet — so the first
    // read of a brand new chat skipped the inherited switches, and nothing re-read once the row did
    // land. `blankRow` keeps the distinction; the read effect below watches `blank` and so runs
    // again when the row turns out to be blank after all.
    const blankRow = useSessions?.(state => state?.byId?.[sessionId]?.blank);
    const blank = blankRow === true;
    // An answer belongs to one session. Derived from the *prop* rather than from state, so the first
    // render after a switch already reads `idle`: `ultraFlag`, `lightning` and `superfast` still hold
    // the conversation we just left, and painting those as this one's state is exactly the dot and
    // the mode tick that sat in the wrong place until the read came back.
    const turboPhase = turboState.sessionId === sessionId ? turboState.phase : 'idle';
    const turboSynced = turboPhase === 'ready';
    const turboFailed = turboPhase === 'error';
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
    // 目录里一个档位都没有（中转站转发的那类模型）：开关开着就把占位档位当成真实档位往下走，
    // 位置取自本机记住的那一格。挂成「真实档位」而不是替换整个 steps，虚拟 Ultra 才会照常追加到
    // 队尾 —— 它在本包眼里就是第五格，紫色和流星都挂在那一格上。
    // `chosen` 这一半不能省：目录还没回来时 `levels` 同样是空的，那不是「这个模型没有档位」，
    // 只是「还不知道」。少了它，占位模式会在加载窗口里冒充事实，下面那个 writer 就会把
    // `ultra: false` 覆盖到宿主刚报上来的 pin 上 —— 正是旧守卫原本要挡的那个缺陷。
    const placeholderMode = levels.length === 0 && Boolean(chosen) && effortBarEnabled();
    const realLevels = placeholderMode ? PLACEHOLDER_EFFORTS : levels.filter(level => level.id !== 'ultra');
    const hasRealUltra = !placeholderMode && levels.some(level => level.id === 'ultra');
    const virtualUltra = realLevels.length > 0 && !hasRealUltra;
    const steps = virtualUltra ? [...realLevels, { id: '__ultra__', name: 'Ultra' }] : levels;
    const maxIndex = Math.max(0, steps.length - 1);
    const effectiveValue = placeholderMode ? effortGrade() : hasRealUltra ? 'ultra' : state.current?.reasoningEffort ?? reasoning?.defaultEffort;
    const effectiveIndex = steps.findIndex(step => step.id === effectiveValue);
    // `-1` is a state of its own, not tier 0. `findIndex` answers it whenever the directory's effort
    // is not one of the steps at all — an `off` the model omits, a level the catalog has not listed —
    // and every reader below used to clamp it with `Math.max(0, ...)`: the knob parked at the lowest
    // tier while the text beside it printed `state.retainedEffort`, two claims that cannot both be
    // true. A pinned Ultra is the one exception: `virtualUltra` derives its position from the step
    // list instead of from the effort id, so that branch knows where the knob goes.
    const indexUnknown = effectiveIndex < 0 && !(ultraFlag && virtualUltra);
    // The pinned Ultra position. The directory only ever holds the real maximum, so
    // the switch is the only thing that separates "Ultra" from "maximum"; a drag
    // preview always wins over whichever position was stored.
    const pinnedIndex = ultraFlag ? (virtualUltra ? maxIndex : Math.max(0, effectiveIndex)) : Math.max(0, effectiveIndex);
    const shownIndex = draftIndex !== null ? Math.min(draftIndex, maxIndex) : pinnedIndex;
    const shownUltra = virtualUltra && shownIndex === maxIndex
      || hasRealUltra && shownIndex === effectiveIndex && effectiveValue === 'ultra';
    const displayLevel = draftIndex === null ? steps[shownIndex] : steps[draftIndex];
    // What the track is allowed to claim, and when it may claim nothing at all: with no answer from
    // the Host for this session, or no step that matches its effort, `shownIndex` is a number by
    // construction — the range input needs one — but it is not a fact. A drag is the user's own
    // input, so it always counts, which is also why the knob comes back the moment the pointer moves.
    // 占位模式停在哪儿是本机存的，不依赖宿主回话，所以它不算「未同步」——否则填充和旋钮都不画，
    // 画出来的还是一条空轨道。
    const trackUnknown = draftIndex === null && !placeholderMode && (!turboSynced || indexUnknown);
    // The tier text follows the same rule as the track, in one place: while the position is unknown
    // the only honest name is the one the directory retained, never the step the clamp landed on.
    // A drag has already chosen a real step, so it passes straight through.
    const label = trackUnknown ? state.retainedEffort || 'Off' : shownUltra ? 'Ultra' : displayLevel ? effortLabel(displayLevel) : state.retainedEffort || 'Off';
    const ultraOn = shownUltra;
    // Everything painted reads this rather than `ultraOn`: the pin can be one session behind until
    // the read answers, and the Ultra paint — purple track, meteors, the cost notice — is a claim
    // about the Host, not a local preference.
    const claimUltra = shownUltra && !trackUnknown;
    // The mode ticks make the same promise, and get the same treatment: before this session's answer
    // arrives neither switch is known — and 标准 is not a default, it is one of three options — so
    // none of the three is ticked instead of the panel guessing.
    const modeFast = turboSynced && lightning;
    const modeTree = turboSynced && superfast;
    // The visible tier name is what carries the transient Ultra cost notice; the accessible
    // name stays the tier itself.
    const displayLabel = claimUltra && ultraNotice ? '更快消耗 Token' : label;
    // Hooks for the depth ramp: the tier the slider shows, plus a 0..4 bucket so a model
    // with a level id the CSS does not know still deepens instead of staying flat. An unknown
    // position has no tone — it is not the lowest tier, it is no tier.
    const effortTone = trackUnknown ? 'off' : shownUltra ? 'ultra' : (effectiveIndex >= 0 ? steps[shownIndex]?.id ?? 'off' : 'off');
    const effortDepth = trackUnknown || maxIndex <= 0 ? 0 : Math.round(shownIndex / maxIndex * 4);
    // The budget figure is measured, not guessed: one delegation costs a delegated turn about 1.5x a plain turn, and a
// superfast turn about 3x — see CHANGELOG 1.0.0 for the ledger numbers behind those two ratios.
    // The tree runs one extra tier (each tier-1 child opens two grandchildren), so it costs several flat
  // rounds at once. The figure is the Host's own per-round multiple, not a second measurement: the UI must
  // not invent a number it cannot source.
  const treeTokenLabel = `每层再开 2 个，至少 2.5× token`;
  const tokenLabel = `${budget.exact ? '至少 ' : '约 '}${budget.value}× token`;
    const modelName = chosen ? aliasOf(chosen.group.id, chosen.model) : state.current?.model || '选择模型';
    const busy = locked || state.pending !== null;
    const close = React.useCallback(() => { setOpen(false); setDraftIndex(null); triggerRef.current?.focus(); }, []);
    // Track width feeds the meteor travel distance and the knob's hover hit-test — the knob's own position is a
    // container-unit calc now — so it is measured whenever the track can exist and re-measured whenever it resizes.
    // The dependency on `open` is the load-bearing
    // one: the rail only mounts inside the popover, so measuring on `ultraOn` alone found a null ref whenever
    // Ultra was switched on with the popover shut, and the fallback then stopped the shower at the
    // meteor's own width instead of the width of the track.
    //
    // `steps.length` is a dependency too, not only `open`: the rail also needs the directory's levels, so opening the
    // picker before the catalog arrived mounted no shell at all, this pass found a null ref, and nothing re-ran it
    // once the shell appeared — the width stayed 0 until an unrelated resize fired the observer.
    //
    // A layout effect, not a passive one: the meteor travel is drawn from the measured width, so a passive effect
    // would paint one frame of the shower at the wrong distance. The width comes from
    // `getComputedStyle().width` — the layout width, so the popover's entrance `scale(.985)` cannot leak into it
    // the way it leaked into an earlier `getBoundingClientRect` measurement of this same element (227.2px
    // instead of the settled 230.4px) — and not from `clientWidth`, which rounds: on a 268.4px track the top
    // tier would stop 0.4px short.
    React.useLayoutEffect(() => {
      if (!open) return undefined;
      const shell = meteorShellRef.current;
      if (!shell) return undefined;
      const measure = () => {
        const parsed = parseFloat(getComputedStyle(shell).width);
        const width = Number.isFinite(parsed) ? parsed : shell.clientWidth;
        setShellWidth(previous => (previous === width ? previous : width));
        if (ultraOn) meteorFieldRef.current?.style.setProperty('--cg-meteor-travel', `${Math.round(width + 36)}px`);
        // A resize moves the shell out from under the pointer test's cached box.
        shellRectRef.current = null;
      };
      measure();
      if (typeof ResizeObserver !== 'function') return undefined;
      const observer = new ResizeObserver(measure);
      observer.observe(shell);
      // Scroll moves the shell just as surely, and scroll does not bubble out of a scroller: a capture
      // listener on the window is what hears it, whichever element did the scrolling.
      const forget = () => { shellRectRef.current = null; };
      window.addEventListener('scroll', forget, { capture: true, passive: true });
      return () => { observer.disconnect(); window.removeEventListener('scroll', forget, { capture: true }); };
    }, [ultraOn, open, steps.length]);
    // The knob travels the track on the compositor, not through layout.
    //
    // `left` re-laid the slider out on every tier change, and its 100ms transition did that on every frame of a
    // drag — that is the stutter this replaces. The knob's centre stays 12px in from the track's edge because the
    // stylesheet holds `left: 12px` with the knob's own `-12px` margin cancelling it.
    const knobRatio = maxIndex > 0 ? shownIndex / maxIndex : 0;
    // The travel is the track's width minus the knob's diameter — the very box the fill above measures against —
    // and the browser resolves it, so nothing JS measures can leave the knob at the track's start. A percentage
    // inside `translate` cannot express it: that percentage refers to the element's OWN box, so `100%` is the
    // knob's 24px and `calc((100% - 24px) * ratio)` collapses to 0 (measured in Chromium 152: `translate: 100%`
    // moves a 24px knob 24px, not the track's 230px). `100cqw` is the track's own content width instead, because
    // the stylesheet makes the shell a size container; it resolves to the same box as the fill's `100%`, so the
    // bar and the dot cannot disagree, and it measures itself even on the frame the popover first paints.
    //
    // The `12px` term is the knob's own half-width, and leaving it out was the "圆点对不齐" report: the stylesheet
    // gives the knob `margin-left: -12px`, so `translate` positions its LEFT EDGE, while the tier dots are laid out
    // `space-between` inside `inset: 0 12px` — their centres sit at `12 + (width - 24) * i / max`. Without the
    // term the knob's centre lands exactly 12px left of the dot it is supposed to be sitting on, at every tier,
    // and at the top tier it stops short of the last dot by that same amount.
    const knobTravel = `calc(12px + (100cqw - 24px) * ${knobRatio})`;
    // Still measured, and still 0 until the track exists: only the hover hit-test reads this now, so a missing
    // measurement can shift neither the dot nor the fill.
    const thumbX = Math.max(0, shellWidth - 24) * knobRatio;
    React.useEffect(() => { if (effortTarget.current === null || effortTarget.current === effectiveValue) setDraftIndex(null); }, [effectiveValue]);
    React.useEffect(() => { effortQueue.current = null; effortTarget.current = null; setDraftIndex(null); }, [state.current?.provider, state.current?.model]);
    React.useEffect(() => { if (locked || !available) setOpen(false); }, [locked, available]);
    React.useEffect(() => {
      if (!open) return;
      const outside = event => { if (!rootRef.current?.contains(event.target)) { setOpen(false); setDraftIndex(null); } };
      // Esc walks one level out per press, innermost first, and the listener only exists while the
      // popover is open — so Esc belongs to the panel and never reaches the host.
      //
      // This listener is registered in the *capture* phase, and that is why the rename field's own
      // handler can never fire: a capture listener on document runs before the event reaches its
      // target, and `stopPropagation` there stops the event from reaching the target element too
      // (DOM standard: nothing but the current object receives it). So the cancel has to happen
      // here. It used to not, and Esc inside the rename field fell through to the pane step below —
      // jumping to 强度 with a half-typed name, or closing the whole popover when no model was
      // selected yet.
      const escape = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        // A live rename draft is the innermost level, but only while its field is on screen: the
        // editor renders inside the model pane, so that is the one case where Esc has to give the
        // row back. Dropping the draft here — rather than by delegation to the field's own
        // onKeyDown, which the stopPropagation above makes unreachable — is what keeps a draft from
        // outliving the Esc that leaves the row and reappearing when a later visit paints the row
        // in editing state again. A draft left behind in another pane costs no press: the same Esc
        // clears it and goes on to the pane step, so the key never reads as doing nothing.
        const draftOnScreen = aliasEditor != null && pane === 'model';
        if (aliasEditor != null) setAliasEditor(null);
        if (draftOnScreen) return;
        // A sub-page steps back to the view it was opened from, so one Esc never throws away the
        // whole panel: 编排模式 lives under 强度, and 提供商 under 模型.
        if (pane === 'lightning') { setPane('effort'); focusPending.current = true; return; }
        if (pane === 'providers') { setPane('model'); focusPending.current = true; return; }
        if (pane === 'model' && state.current !== null) { setPane('effort'); focusPending.current = true; }
        else close();
      };
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', escape, true);
      return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
    // `aliasEditor` is a dependency because the handler reads it: without it the listener would keep
    // the closure from before the field opened, and Esc inside the field would still fall through to
    // the pane step.
    }, [open, pane, state.current, close, aliasEditor]);
    React.useEffect(() => {
      if (!open || !focusPending.current) return;
      focusPending.current = false;
      const handle = requestAnimationFrame(() => (popupRef.current?.querySelector(pane === 'model' ? 'input[type="search"]' : 'input[type="range"]:not(:disabled)') || popupRef.current?.querySelector('button:not(:disabled)'))?.focus());
      return () => cancelAnimationFrame(handle);
    }, [open, pane]);
    // The arming state lives on the Host so it survives a page reload; read it once
    // per session and adopt the answer, then let local intent win until it changes.
    //
    // Three ways in: the session changes, a blank row lands (see the `blank` note above), and the
    // user presses 重试 in the popover. None of them can loop — this effect only ever writes `phase`,
    // and `retrySeq` is raised by the retry alone.
    React.useEffect(() => {
      if (typeof sessionId !== 'string' || !sessionId) return;
      let cancelled = false;
      // The pin still in local state belonged to the session we are leaving, so the writer below must
      // not read it as this session's answer. Without this, switching from an Ultra session to one
      // whose row says "no Ultra" wrote the old pin onto the new session before the read answered,
      // and the read then settled the track back to Max against a row that now said `ultra: true`.
      //
      // Only a *new* session reopens that hole. A re-read of the same session — a blank row arriving,
      // a retry — keeps `ultraSentRef` as it is: nulling it there made the writer treat a pin it had
      // already adopted as "not adopted yet" and push the track's own position over the Host's.
      if (ultraSyncedRef.current !== sessionId) ultraSentRef.current = null;
      ultraSyncedRef.current = null;
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
        ultraSyncedRef.current = sessionId;
        setLightning(nextLightning);
        setSuperfast(nextSuperfast);
        setUltraFlag(nextUltra);
        if (Number.isFinite(value.tokenMultiple) && value.tokenMultiple > 0) setBudget({ value: value.tokenMultiple, exact: value.tokenExact === true });
        setTurboState(current => ({ sessionId, phase: 'ready', retrySeq: current.retrySeq }));
      }).catch(error => {
        if (cancelled) return;
        // A failed read is its own answer, not "not ready yet". It still leaves the writer off —
        // nothing about this session is known — but the surface says 未同步 and offers 重试, instead
        // of the old silent dead switch that showed Ultra while the contract never moved.
        setTurboState(current => ({ sessionId, phase: 'error', retrySeq: current.retrySeq }));
        setActionError(error.message || String(error));
      });
      return () => { cancelled = true; };
    }, [sessionId, blank, turboState.retrySeq]);
    // The retry lever for the popover's 未同步 line: raising `retrySeq` is the only way back into the
    // effect above, and it also clears the stale phase so the surface reads "reading" while it runs.
    const retryTurboRead = () => setTurboState(current => ({ sessionId, phase: 'idle', retrySeq: (current.retrySeq ?? 0) + 1 }));
    // Keep the Host flag equal to what the track shows, so every path that leaves the
    // Ultra step (drag, arrow keys, reset, model switch) — and the first sync after a
    // reload — converges on one writer.
    //
    // `ultraOn` only speaks for the Host once this model's levels are known. While the catalog is
    // still empty the track cannot sit on Ultra at all (`virtualUltra` is false), so reading that
    // "off" as the user's intent wrote `ultra: false` over a pin the Host had just reported as armed:
    // the switch came back as Max and the stored row was rewritten on the way. Both inputs of this
    // writer — the Host's answer for this session, and the level list — have to be in hand first.
    //
    // `indexUnknown` is the same rule for the other input: when the directory's effort matches no
    // step, the position the writer would read is the clamp from `Math.max(0, ...)`, not a choice —
    // writing `ultra: false` from it overwrote a pin the Host had legitimately reported as armed.
    // Every path that leaves the unknown state (a drag, a model switch, a reset) makes the position
    // a fact again and this writer catches up on the next pass.
    React.useEffect(() => {
      if (!turboSynced || indexUnknown || ultraSyncedRef.current !== sessionId) return;
      // 占位模式是这里唯一放行 `reasoning === undefined` 的情形。这个判据本来防的是「目录还没回话，
      // 别把 ultra: false 覆盖到宿主刚报上来的 pin 上」；而占位模式的档位本来就是本机造的，位置来自
      // 用户明确拖过去的那一下（或本机记住的那一格），是事实而不是缺席时的默认值。
      //
      // 放行之后 Ultra 是真的生效，不只是画面：宿主侧不看模型有没有声明 efforts
      // （`turbo-policy.js` 只判布尔与注入开关），收到 `ultra` 就把 ULTRA_POLICY 整段拼进提示词。
      if (reasoning === undefined && !placeholderMode) return;
      if (typeof sessionId !== 'string' || !sessionId) return;
      if (ultraSentRef.current === ultraOn) return;
      ultraSentRef.current = ultraOn;
      setUltraFlag(ultraOn);
      turboRequest('update', sessionId, { ultra: ultraOn }).catch(error => {
        ultraSentRef.current = null;
        setActionError(error.message || String(error));
      });
    }, [turboSynced, indexUnknown, ultraOn, sessionId, reasoning, placeholderMode]);
    // Landing on Ultra briefly replaces the tier name with what that tier costs. The notice
    // is fired by the move itself (see chooseLevel) rather than by watching the pinned flag,
    // so a session that merely opens already pinned does not flash it.
    React.useEffect(() => () => { if (ultraNoticeTimer.current !== null) clearTimeout(ultraNoticeTimer.current); }, []);
    // An inherited Ultra pin must also reach the directory, otherwise the track would claim
    // Ultra while the session still runs at the previous effort. Wait for the levels, then
    // take the same path a drag to the Ultra step takes.
    React.useEffect(() => {
      if (!inheritEffortRef.current) return;
      if (!turboSynced || !blank) { inheritEffortRef.current = false; return; }
      if (!ultraOn || !virtualUltra || !steps.length) return;
      if (effectiveIndex < 0 || effectiveIndex >= maxIndex) { inheritEffortRef.current = false; return; }
      inheritEffortRef.current = false;
      chooseLevel(String(maxIndex));
    }, [turboSynced, blank, ultraOn, virtualUltra, steps.length, effectiveIndex, maxIndex]);
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
      if (placeholderMode) {
        // 目录里没有档位，`reasoningEffort` 没有可设的值，发过去只会被拒，所以档位只记在本机：
        // 滑条停在新位置、档位名跟着换。Ultra 那一格是例外 —— 它不是档位，是宿主的一个开关，
        // 由上面那个 writer 照常发出去，这里只负责把位置和名字落到本机。
        setEffortGrade(step.id);
        setDraftIndex(index);
        setActionError(null);
        return;
      }
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
      // Opening the panel is the user's own next interaction after a failed read, so it is where the
      // retry naturally belongs: no timer, no polling, and nothing happens at all unless the read is
      // known to have failed. The line the user is looking at says 未同步; opening the panel is the
      // cheapest way to ask again.
      if (turboFailed) retryTurboRead();
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
    return h('div', { className: 'cg-model-root', ref: rootRef, 'data-ultra': claimUltra, 'data-superfast': turboSynced ? superfast : 'unknown', 'data-lightning': turboSynced ? lightning : 'unknown', 'data-turbo': turboPhase, 'data-effort': effortTone },
      h('button', { className: 'cg-model-trigger', type: 'button', ref: triggerRef, disabled: busy, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': `选择模型，当前 ${modelName}${steps.length || state.retainedEffort ? `，推理强度 ${turboFailed ? '未同步' : label}` : ''}${modeFast ? '，闪电编排已开启' : ''}${modeTree ? '，超快编排已开启' : ''}`, onClick: () => open ? close() : show() },
        // No leading bolt here: the lightning switch lives in the popover, and an armed
        // session shows its marker after the effort label instead.
        h('span', { className: 'cg-model-trigger-name' }, modelName),
        (steps.length > 0 || state.retainedEffort) && h('span', { className: 'cg-model-trigger-effort', 'data-ultra': claimUltra, 'data-effort': effortTone, 'data-notice': claimUltra && ultraNotice },
          turboFailed
            ? h('span', { className: 'cg-model-sync-warn', role: 'status', title: '读不到本会话的编排状态，打开面板重试' }, '未同步')
            : displayLabel),
        (modeFast || modeTree) && h('span', { className: 'cg-model-trigger-bolt', 'data-tree': modeTree }, boltGlyph(undefined, true, modeTree ? 'gold' : undefined)),
        h(Icon, { name: 'down', size: 12 })),
      open && h('div', { className: 'cg-model-popover', ref: popupRef, role: 'dialog', 'aria-label': '模型与推理强度', 'data-ultra': claimUltra, 'data-superfast': turboSynced ? superfast : 'unknown', 'data-turbo': turboPhase, 'data-pane': pane, 'data-effort': effortTone, 'data-notice': claimUltra && ultraNotice },
        // Keyed on the pane so switching replays the entrance: the two views cross over instead of
        // swapping in one frame. The wrapper changes nothing about layout — the popover styles no
        // direct children.
        pane === 'lightning' ? h('div', { className: 'cg-model-pane', key: 'lightning' },
          h('div', { className: 'cg-model-modes', role: 'menu', 'aria-label': '编排模式' },
            h('button', { className: 'cg-model-mode', type: 'button', role: 'menuitemradio', 'aria-checked': turboSynced && !lightning && !superfast, 'data-on': turboSynced && !lightning && !superfast, 'data-mode': 'standard', disabled: busy || !sessionId, onClick: () => chooseMode('standard') },
              h('span', { className: 'cg-model-mode-text' },
                h('strong', null, '标准'),
                h('span', null, '默认速度')),
              h('span', { className: 'cg-model-mode-check', 'aria-hidden': true }, turboSynced && !lightning && !superfast && h(Icon, { name: 'check', size: 14 }))),
            h('button', { className: 'cg-model-mode', type: 'button', role: 'menuitemradio', 'aria-checked': modeFast, 'data-on': modeFast, 'data-mode': 'fast', disabled: busy || !sessionId, onClick: () => chooseMode('fast') },
              h('span', { className: 'cg-model-mode-text' },
                h('strong', null, '快速'),
                h('span', null, '至少 1.5× 消耗 甚至更多')),
              h('span', { className: 'cg-model-mode-check', 'aria-hidden': true }, modeFast && h(Icon, { name: 'check', size: 14 }))),
            h('button', { className: 'cg-model-mode', type: 'button', role: 'menuitemradio', 'aria-checked': modeTree, 'data-on': modeTree, 'data-mode': 'tree', disabled: busy || !sessionId, onClick: () => chooseMode('tree') },
              h('span', { className: 'cg-model-mode-text' },
                h('strong', null, '超快'),
                h('span', null, '至少 2.5× token 消耗 甚至更多')),
              h('span', { className: 'cg-model-mode-check', 'aria-hidden': true }, modeTree && h(Icon, { name: 'check', size: 14 })))))
        : pane === 'effort' ? h('div', { className: 'cg-model-pane', key: 'effort' },
          h('div', { className: 'cg-model-top' },
            h('button', { className: 'cg-model-zap', type: 'button', 'data-on': modeFast || modeTree, 'data-mode': !turboSynced ? 'unknown' : modeTree ? 'tree' : modeFast ? 'fast' : 'off', disabled: busy || !sessionId, 'aria-haspopup': 'menu', 'aria-expanded': pane === 'lightning', 'aria-label': !turboSynced ? '编排模式：状态未同步，点击查看' : modeTree ? '编排模式：超快已开启，点击更换' : modeFast ? '编排模式：快速已开启，点击更换' : '编排模式：选择快速或超快', onClick: () => setPane(pane === 'lightning' ? 'effort' : 'lightning') },
              modeTree ? boltGlyph('cg-model-zap-glyph', true, 'gold') : boltGlyph('cg-model-zap-glyph', modeFast),
              h('span', { className: 'cg-model-tooltip', role: 'tooltip' }, !turboSynced ? '编排模式：正在读取本会话的状态' : modeTree ? `超快编排：已开启，每个子代理再开两个孙代理，${treeTokenLabel}` : modeFast ? `快速编排：已开启，${tokenLabel}` : `编排模式：快速每轮至少并发 2 个子代理，${tokenLabel}`)),
            h('button', { className: 'cg-model-summary', type: 'button', disabled: busy, 'aria-label': '更换模型', onClick: () => { setPane('model'); focusPending.current = true; } }, h('strong', { 'aria-live': 'polite', 'data-notice': claimUltra && ultraNotice }, turboFailed ? '未同步' : steps.length ? displayLabel : '选择模型'), h('span', { className: 'cg-model-summary-name' }, modelName, h(Icon, { name: 'chevron', size: 11 }))),
            h('button', { className: 'cg-model-reset', type: 'button', 'aria-label': '恢复默认强度', disabled: busy || !reasoning || !state.current, onClick: reset }, glyph('reset'), h('span', { className: 'cg-model-tooltip', role: 'tooltip' }, '重置为默认')),
            // The burst lives on the row, not inside the bolt: when the knob lands on Ultra the notice hides the
            // three controls — .cg-model-zap gets opacity:0 — and a parent's opacity cannot be undone by any child,
            // so a burst nested in the button was invisible for its whole 620ms on the one path that matters.
            // The three controls fade out while this stands in their row, so the popover
            // keeps its height and nothing jumps when the notice comes and goes.
            h('div', { className: 'cg-model-ultra-notice', role: 'status', 'aria-live': 'polite' },
              ultraNotice && claimUltra ? '更快消耗 Token' : '')),
          // The one place the surface says out loud that it does not know. It sits where the track
          // is, reuses two classes that already carry the styling (`cg-model-error` for the red,
          // `cg-model-choice` for the retry row), and offers the same retry `show()` does — a failed
          // read must never look like a settled answer.
          turboFailed && h('div', null,
            h('p', { className: 'cg-model-error', role: 'alert' }, '未同步：读不到本会话的编排状态，强度与开关可能未生效。'),
            h('button', { className: 'cg-model-choice', type: 'button', disabled: busy || !sessionId, onClick: retryTurboRead }, '重试读取')),
          steps.length > 0 ? h('div', {
          className: 'cg-model-slider-shell', ref: meteorShellRef, 'data-max': !trackUnknown && shownIndex === maxIndex && maxIndex > 0, 'data-ultra': claimUltra, 'data-unknown': trackUnknown, 'data-effort': effortTone, 'data-depth': effortDepth,
          // Grow the knob only when the pointer is actually over it. The knob cannot receive pointer events
          // itself (`pointer-events: none`, or it would swallow the press and the native range could not be
          // dragged), so the test is geometric: distance from the pointer to the knob's centre against the
          // knob's own radius. The attribute is written straight onto the node — a state update here would
          // re-render the whole popover on every mouse move.
          onPointerMove: event => {
            const thumb = thumbRef.current;
            if (!thumb) return;
            // The shell's box is read once per hover gesture and reused: this used to call
            // `thumb.getBoundingClientRect()` on every pointer sample, which is a forced synchronous layout, and
            // it landed between React's writes to the knob's position. The centre does not need it — the shell's
            // box plus the knob's own travel is the same point, and the travel is already in hand.
            const box = shellRectRef.current || (shellRectRef.current = event.currentTarget.getBoundingClientRect());
            const alreadyOver = thumb.getAttribute('data-over') === 'true';
            // The knob is 1.08× while `data-over` holds, and the old test measured that grown box, so leaving the
            // hit area took 1px more travel than entering it did. Same numbers here, kept on purpose.
            const radius = alreadyOver ? 12 * 1.08 : 12;
            const dx = event.clientX - (box.left + 12 + thumbX);
            const dy = event.clientY - (box.top + 14);
            const over = Math.sqrt(dx * dx + dy * dy) <= radius + 2;
            if (over && !alreadyOver) thumb.setAttribute('data-over', 'true');
            else if (!over && alreadyOver) thumb.removeAttribute('data-over');
          },
          onPointerLeave: () => { shellRectRef.current = null; thumbRef.current?.removeAttribute('data-over'); }
        },
            // The fill ends where the knob *ends*: `24px + (100% − 24px) × ratio` is the knob's right edge, so
            // the bar reaches the far side of the circle at every tier. The bare `ratio × 100%` stopped short of
            // it by `24 × (1 − ratio)` px — 18px at the low tier — and the owner read that, correctly, as the bar
            // not being covered by the dot. This form equals `100%` exactly at ratio 1, so the top tier cannot get
            // shorter; the earlier `ratio × (width − 24)` attempt did shorten it, which is what "you just made the
            // purple shorter" was about.
            // A track with no known position draws no fill: `knobRatio` is `Math.max(0, ...)`-derived
            // and would claim the first tier, which is the same lie the knob used to tell.
            h('div', { className: 'cg-model-slider-fill', style: { width: trackUnknown ? '0px' : `calc(24px + (100% - 24px) * ${knobRatio})` } }),
            claimUltra && meteorField(meteorFieldRef),
            // A dot states whether the fill has reached it: inside the fill it has to read
            // against the tier colour, outside it stays a track marker. With no known position no
            // dot is lit — the bare tick marks stay, so the track still reads as a slider.
            h('div', { className: 'cg-model-slider-dots', 'aria-hidden': true }, ...steps.map((step, index) => h('span', { key: step.id, 'data-ultra': step.id === '__ultra__', 'data-on': !trackUnknown && index <= shownIndex }))),
            // Positioned by `translate` rather than `left`: `left` re-runs layout for the slider on every tier
            // change, while this property is compositor work. The centre stays 12px in from the track's left edge
            // because the stylesheet's `left: 12px` is cancelled by the knob's `-12px` margin and this travel is
            // then added to it; the travel itself is the container-unit calc built above, so the browser — not a
            // measurement — decides it. Not rendered at all while the position is unknown: any place it could
            // stand would be an assertion, and the pointer test above already tolerates a missing node.
            !trackUnknown && h('span', { className: 'cg-model-thumb', 'aria-hidden': true, ref: thumbRef, style: { translate: `${knobTravel} 0 0` } }),
            h('input', { className: 'cg-model-slider', type: 'range', min: 0, max: maxIndex, step: 1, value: shownIndex, disabled: locked || maxIndex < 1, 'aria-label': '推理强度', 'aria-valuetext': trackUnknown ? '未同步' : label,
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
  // `conversation.input.model` is a single slot: registering it twice throws, and that throw happens
  // inside the fiber rather than at the call site, so it reads as "the panel vanished" instead of "you
  // mounted twice". The flag is reset by the disposer, so a reload re-registers as a fresh page would.
  if (modelUiRegistered.has(ctx)) return
  modelUiRegistered.add(ctx)
  ctx.effect(() => {
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
    return () => { modelUiRegistered.delete(ctx); };
  });
}

// Exported so the built artifact can be mounted by a test without running the whole
// client surface; the bundle's own `apply` calls it exactly as a plugin would.
// `ModelControl` stays inside `registerModelUI` (it closes over `ctx`, the tier table and the
// glyph builders), so it is not exported — the same shape as dsh-codex-ui, whose bundle exports only
// `registerModelUI`. `menuPlacement` / `runningTailOf` are client.js bindings and do not live here.
export { registerModelUI };
