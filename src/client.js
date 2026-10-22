import React from 'react';
const h = React.createElement;
// New-session hero copy. The native headline and brand mark come from the `conversation`
// locale dictionary and the client UI primitives, which a plugin must not replace, so the
// hero is re-rendered here: a DeepSeek mark in the brand-mark slot and one title element
// that appends the project name the hero already shows in its workspace chip.
const HERO_TITLE = '我们要构建什么?';
/** DeepSeek mark geometry, taken from the harness brand mark (23.16 x 17.04 user units). */
const DEEPSEEK_MARK_PATH = 'M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z';
const DEEPSEEK_MARK_VIEWBOX = '0 0 23.16 17.04';
function DeepSeekMark({ size = 34, className }) {
  return h('svg', { className, width: size, height: size * 17.04 / 23.16, viewBox: DEEPSEEK_MARK_VIEWBOX, fill: 'currentColor', 'aria-hidden': true },
    h('path', { d: DEEPSEEK_MARK_PATH }));
}

// ---- New-chat hero mark: 无 / DeepSeek / Codex / 用户上传 --------------------------------------
//
// The hero's brand mark is this plugin's own slot occupant (`conversation.hero.brand.mark`), so the
// four choices are a client-side setting: which mark to paint. Everything lives in localStorage —
// an uploaded picture is stored as a data URL, which is why uploads are capped and validated.

const HERO_MARK_KEY = 'dsh-codex-ui/hero-mark';
const HERO_MARK_KINDS = ['none', 'deepseek', 'codex', 'custom'];
const HERO_MARK_MAX_BYTES = 2 * 1024 * 1024;

const heroMarkListeners = new Set();
let heroMarkCache = null;

function readHeroMark() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(HERO_MARK_KEY) ?? 'null');
    return raw !== null && typeof raw === 'object' ? raw : { kind: 'deepseek' };
  } catch {
    return { kind: 'deepseek' };
  }
}

function heroMarkSnapshot() {
  if (heroMarkCache === null) heroMarkCache = readHeroMark();
  return heroMarkCache;
}

function writeHeroMark(next) {
  heroMarkCache = next;
  try {
    window.localStorage.setItem(HERO_MARK_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable or full; the choice then lasts this page only.
  }
  for (const listener of [...heroMarkListeners]) listener();
}

function subscribeHeroMark(listener) {
  heroMarkListeners.add(listener);
  return () => { heroMarkListeners.delete(listener); };
}

/**
 * What the settings panel will accept. Pictures and animated pictures only: the hero mark is an
 * image slot, and a 2MB ceiling is what a data URL can carry without filling localStorage.
 * Exported because a rule about what may be uploaded deserves a test, not a click.
 */
function validateHeroMarkFile(file) {
  const type = typeof file?.type === 'string' ? file.type : '';
  const size = typeof file?.size === 'number' ? file.size : 0;
  if (size === 0) return { ok: false, error: '这个文件是空的。' };
  if (!type.startsWith('image/')) return { ok: false, error: '只允许图片或动图。' };
  if (size > HERO_MARK_MAX_BYTES) return { ok: false, error: `文件太大（上限 ${Math.round(HERO_MARK_MAX_BYTES / 1024 / 1024)}MB）。` };
  return { ok: true };
}

/** The stored choice, reduced to something renderable. Exported for the same reason. */
function resolveHeroMark(stored) {
  const kind = HERO_MARK_KINDS.includes(stored?.kind) ? stored.kind : 'deepseek';
  if (kind !== 'custom') return { kind, src: null };
  const src = typeof stored?.dataUrl === 'string' && stored.dataUrl.startsWith('data:image/') ? stored.dataUrl : null;
  // A custom choice whose picture is gone falls back to the built-in mark rather than a broken image.
  return src === null ? { kind: 'deepseek', src: null } : { kind, src };
}

/**
 * The Codex mark, animated when clicked.
 *
 * The outline is **traced from the shipped asset**, not drawn by eye: the reference silhouette was
 * measured as a radius per angle (filled by flood fill first, so the glyph holes do not skew it), then
 * fitted as a union of seven circles plus a centre disc whose radius is held *below* the smallest
 * scallop — that last part matters, because a centre disc larger than the valleys fills the bumps in
 * and the mark reads as a plain circle. Fit quality: radius RMS 0.66px, IoU 0.906 against the
 * reference. The chevron and the dash come from the measured glyph boxes (232px and 156px of bright
 * interior pixels) with their stroke widths derived from those areas.
 */
const CODEX_BLOB = 'M45.8 24L45.91 24.57L45.99 25.15L46.03 25.73L46.05 26.32L46.04 26.9L46 27.49L45.94 28.07L45.84 28.64L45.72 29.21L45.56 29.78L45.38 30.33L45.17 30.88L44.94 31.41L44.68 31.94L44.39 32.45L44.08 32.94L43.74 33.42L43.39 33.88L43.01 34.32L42.6 34.74L42.18 35.14L41.74 35.52L41.28 35.88L40.81 36.21L40.32 36.52L39.82 36.81L39.3 37.07L38.77 37.3L38.23 37.51L37.81 37.81L37.61 38.34L37.39 38.87L37.14 39.38L36.86 39.88L36.56 40.37L36.24 40.85L35.89 41.3L35.52 41.75L35.13 42.17L34.72 42.57L34.29 42.95L33.84 43.32L33.38 43.66L32.89 43.97L32.39 44.26L31.88 44.53L31.36 44.77L30.82 44.99L30.27 45.18L29.72 45.34L29.16 45.47L28.59 45.58L28.01 45.66L27.44 45.71L26.86 45.73L26.28 45.72L25.71 45.69L25.13 45.62L24.56 45.53L24 45.41L23.44 45.26L22.89 45.09L22.36 44.89L21.83 44.66L21.31 44.41L20.81 44.14L20.32 43.84L19.85 43.51L19.4 43.17L18.96 42.8L18.45 42.75L17.88 42.83L17.31 42.89L16.74 42.92L16.16 42.92L15.59 42.89L15.01 42.84L14.44 42.76L13.88 42.65L13.31 42.51L12.76 42.34L12.21 42.15L11.67 41.93L11.15 41.69L10.63 41.42L10.13 41.12L9.65 40.8L9.18 40.46L8.73 40.09L8.29 39.71L7.88 39.3L7.49 38.87L7.12 38.42L6.77 37.96L6.44 37.47L6.14 36.98L5.86 36.47L5.61 35.94L5.38 35.41L5.18 34.86L5.01 34.31L4.87 33.75L4.75 33.18L4.66 32.61L4.6 32.04L4.57 31.46L4.56 30.88L4.58 30.31L4.63 29.74L4.71 29.17L4.82 28.61L4.44 28.16L4.09 27.69L3.76 27.21L3.45 26.71L3.17 26.19L2.92 25.66L2.7 25.12L2.5 24.56L2.33 24L2.19 23.43L2.08 22.85L2 22.27L1.95 21.68L1.93 21.09L1.93 20.51L1.97 19.92L2.04 19.33L2.14 18.75L2.27 18.18L2.43 17.61L2.61 17.05L2.83 16.5L3.07 15.97L3.34 15.44L3.64 14.93L3.96 14.44L4.3 13.96L4.67 13.51L5.07 13.07L5.48 12.65L5.92 12.26L6.37 11.88L6.84 11.53L7.33 11.21L7.84 10.91L8.36 10.64L8.89 10.39L9.43 10.18L9.99 9.99L10.29 9.56L10.5 9.01L10.74 8.47L11 7.94L11.29 7.43L11.6 6.94L11.94 6.46L12.31 6L12.7 5.56L13.11 5.14L13.54 4.74L14 4.37L14.47 4.02L14.96 3.69L15.46 3.39L15.99 3.12L16.52 2.88L17.07 2.66L17.62 2.47L18.19 2.31L18.76 2.18L19.34 2.09L19.93 2.02L20.51 1.98L21.1 1.97L21.69 2L22.27 2.05L22.85 2.14L23.43 2.25L24 2.4L24.56 2.57L25.11 2.77L25.65 3L26.18 3.26L26.69 3.55L27.19 3.86L27.67 4.2L28.13 4.56L28.57 4.95L28.99 5.36L29.53 5.34L30.1 5.22L30.68 5.13L31.27 5.07L31.85 5.05L32.44 5.05L33.02 5.09L33.6 5.15L34.18 5.25L34.75 5.37L35.32 5.53L35.88 5.71L36.42 5.93L36.96 6.17L37.48 6.44L37.98 6.73L38.47 7.06L38.94 7.4L39.4 7.77L39.83 8.17L40.24 8.59L40.63 9.02L41 9.48L41.34 9.96L41.66 10.45L41.95 10.96L42.21 11.49L42.44 12.02L42.65 12.57L42.83 13.13L42.98 13.7L43.1 14.27L43.18 14.85L43.24 15.43L43.27 16.02L43.27 16.6L43.23 17.19L43.17 17.77L43.07 18.35L43.29 18.83L43.65 19.28L43.99 19.75L44.3 20.24L44.6 20.74L44.86 21.25L45.1 21.78L45.32 22.32L45.51 22.87L45.67 23.43Z';

function CodexMark({ size = 34 }) {
  // The animation is restarted by removing and re-adding its class one frame later. An earlier version
  // remounted the element with `key`, which is a heavier way to do the same thing and re-ran every
  // path's setup on each click.
  const [pulse, setPulse] = React.useState(false);
  const play = () => {
    setPulse(false);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setPulse(true));
    else setPulse(true);
  };
  return h('svg', {
    className: 'cg-hero-mark cg-hero-mark-codex' + (pulse ? ' cg-hero-mark-pulse' : ''),
    width: size, height: size, viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
    // Deliberately not focusable and not announced: this is a decorative flourish, and `tabIndex` here
    // meant a click also focused the mark — which drew the platform's focus ring around it ("a box
    // appeared") and could scroll it. Marked `aria-hidden` for the same reason.
    'aria-hidden': true,
    onClick: play
  },
    h('path', { d: CODEX_BLOB }),
    h('path', { className: 'cg-hero-mark-codex-chevron', strokeWidth: 3.7, d: 'M12.4 16.3 18.9 23.9 12.4 31.6' }),
    h('path', { className: 'cg-hero-mark-codex-dash', strokeWidth: 3.5, d: 'M25.6 30.1H33.2' }));
}

/**
 * The settings panel for the hero mark: four choices, and an upload for the fourth.
 *
 * Positioned with plain pixel offsets and a high z-index. An earlier version also hand-moved this
 * node to `document.body` to escape the sidebar's stacking order — that was wrong: React removes a
 * node from the parent it recorded, so on unmount a moved node throws "The node to be removed is not
 * a child of this node" and takes the whole sidebar down with it. The clipping it was meant to fix
 * came from a `calc()` on an undefined variable, which pixel offsets already solve.
 */
function HeroMarkPicker({ onClose }) {
  const stored = React.useSyncExternalStore(subscribeHeroMark, heroMarkSnapshot);
  const { kind } = resolveHeroMark(stored);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const dismiss = event => {
      const target = event?.target;
      if (typeof target?.closest === 'function' && target.closest('.cg-mark-picker, [data-mark-trigger]')) return;
      onClose();
    };
    const escape = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', escape); };
  }, [onClose]);

  const choose = next => { setError(''); writeHeroMark({ ...stored, kind: next }); };
  const upload = async file => {
    const verdict = validateHeroMarkFile(file);
    if (!verdict.ok) { setError(verdict.error); return; }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsDataURL(file);
      });
      writeHeroMark({ kind: 'custom', dataUrl, name: file.name ?? '' });
      setError('');
    } catch (problem) {
      setError(problem?.message || '读取失败');
    }
  };

  const option = (value, label) => h(Button, {
    key: value, role: 'menuitemradio', 'aria-checked': kind === value, className: 'cg-mark-option',
    onClick: () => choose(value), children: [h('span', { key: 'copy' }, label), kind === value && h(Icon, { key: 'check', name: 'check', size: 14 })]
  });

  return h('div', { className: 'cg-mark-picker', role: 'dialog', 'aria-label': '新对话图标' },
    h('p', { className: 'cg-mark-title' }, '新对话图标'),
    option('none', '无（只显示文字）'),
    option('deepseek', 'DeepSeek（默认）'),
    option('codex', 'Codex'),
    option('custom', '自定义图片或动图'),
    h('input', {
      type: 'file', accept: 'image/*', className: 'cg-mark-file',
      onChange: event => { const file = event.target?.files?.[0]; if (file) upload(file); }
    }),
    h('p', { className: 'cg-mark-hint' }, '只允许图片或动图，最大 2MB；图片存在本机，不会上传到任何服务器。'),
    error !== '' && h('p', { className: 'cg-mark-error', role: 'alert' }, error),
    kind === 'custom' && stored?.name ? h('p', { className: 'cg-mark-hint' }, `当前：${stored.name}`) : null,
    h('div', { className: 'cg-mark-actions' }, h(Button, { className: 'cg-mark-close', onClick: onClose, children: '完成' })));
}
function HeroMark(props) {
  const stored = React.useSyncExternalStore(subscribeHeroMark, heroMarkSnapshot);
  const { kind, src } = resolveHeroMark(stored);
  if (kind === 'none') return null;
  // The Codex mark is drawn larger than the whale it replaces, and the whole group is lifted in CSS:
  // the reference mark sits bigger and higher than the slot's own box. Both are single numbers, kept
  // here and in `.cg-hero-mark-codex` so either can be tuned without touching the other.
  if (kind === 'codex') return h(CodexMark, { ...props, size: Math.round((props?.size ?? 34) * 1.24) });
  if (kind === 'custom') {
    const size = props?.size ?? 34;
    return h('img', { className: 'cg-hero-mark cg-hero-mark-image', src, width: size, height: size, alt: '', 'aria-hidden': true });
  }
  return h(DeepSeekMark, props);
}

/**
 * One line describing the model-name sync, for the settings menu.
 *
 * It is a diagnostic, so it lives where diagnostics belong rather than under the reasoning slider —
 * the effort panel is somewhere the eye rests, and this text has nothing to do with picking a level.
 */
function syncLine(sync) {
  if (sync === null || typeof sync !== 'object') return '';
  if (sync.phase === 'ok') {
    const base = `模型名已生效（同步 ${sync.count} 条）`;
    return sync.section === false ? `${base}　提示词段落未注册（宿主：${sync.sectionError || '未知'}）` : base;
  }
  const label = sync.phase === 'failed' ? '模型名未同步' : '模型名同步中';
  return `${label}（第 ${sync.attempts} 次${sync.reason === '' ? '' : `，上次：${sync.reason}`}）`;
}
/**
 * Whether a popup should open upward or downward, from measured rectangles rather than a screen-size
 * guess. Exported so the rule is a tested fact: the previous menu always opened upward and ran off the
 * top of a short viewport, where it covered the tabs above it.
 */
function menuPlacement(rect, viewport, margin = 8) {
  // An unmeasurable rectangle must read as "stay up", not as "flip down": `rect?.height` is
  // `undefined` for `null`, which would satisfy `height <= availableBelow` and flip a menu that
  // was never measured.
  if (rect === null || typeof rect !== 'object') return 'up';
  const height = typeof rect.height === 'number' ? rect.height : 0;
  const top = typeof rect.top === 'number' ? rect.top : 0;
  if (viewport === null || typeof viewport !== 'object') return 'up';
  const availableAbove = top - margin;
  const availableBelow = (typeof viewport.height === 'number' ? viewport.height : 0) - (typeof rect?.bottom === 'number' ? rect.bottom : top + height) - margin;
  // Flip only when the menu genuinely does not fit above and does fit below.
  return height > availableAbove && height <= availableBelow ? 'down' : 'up';
}
// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// The agent-preset picker is absolutely positioned again (`.cg-agent-picker` in style.css).
//
// 0.9.4 and 0.9.5 tried to place it from a measurement of the host's `conversation.hero.agentPreset`
// slot, and 0.9.5 additionally put it into that row's flex line. In this build the slot sits in the
// workspace row, so the picker came out *below the workspace selector* — the report that came back.
// The measurement machinery is therefore removed, not retuned: the position the owner accepts is the
// stylesheet's own `right: 18px; bottom: 6px` against the composer overlay anchor.
//
// What that costs, stated plainly: the friend's original diagnosis still holds — those two offsets line
// up with the row by arithmetic, not by layout, so a change in line height, font size, padding or window
// width can move the picker off it. Fixing that properly needs the picker to adopt the host's own row
// (which changes its entire look) or an explicit landmark from the owner ("align it with X"). Until one
// of those exists, the accepted position wins over the theoretical one.
// ---------------------------------------------------------------------------------------------

/**
 * The host's running indicator, dressed as Codex's.
 *
 * The host draws it itself: `[data-chat-running]` holds a whale tail plus a shimmering 「深度求索中」,
 * and that copy comes from the host's own locale dictionary, which this plugin must not re-register.
 * So the label is hidden with CSS and redrawn there, and the elapsed-time half the host computes is
 * *read* into a custom property — never rewritten — which is why the host's once-per-second render and
 * this code cannot fight over the same text node.
 *
 * `runningTailOf` is exported through the bundle so the split is a tested fact.
 */
function runningTailOf(text) {
  return typeof text === 'string' ? text.replace(/^\s*深度求索中/, '') : '';
}

function startRunningStatusStyle() {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  if (typeof setInterval !== 'function') return;
  if (document.querySelector('.cg-running-hook') !== null) return;
  // A marker element rather than a module flag: a hot reload disposes the previous instance while the
  // interval it started keeps running, and a second interval must not be added on top of it.
  const marker = document.createElement('span');
  marker.className = 'cg-running-hook';
  marker.setAttribute('aria-hidden', 'true');
  document.body?.append?.(marker);
  const sync = () => {
    const node = document.querySelector('[data-chat-running] [class*="runningText"]');
    if (node === null) return;
    const host = node.closest('[data-chat-running]');
    if (host === null) return;
    const next = JSON.stringify(runningTailOf(node.textContent ?? ''));
    if (host.style.getPropertyValue('--cg-running-for') !== next) host.style.setProperty('--cg-running-for', next);
  };
  // Once every half second, not per frame: the host's clock ticks once a second, and a page-wide
  // observer on character data would run this on every streaming token instead.
  setInterval(sync, 500);
  sync();
}

const paths = {
  home: 'M2.7 10.3 11 3.4a1.6 1.6 0 0 1 2 0l8.3 6.9a1 1 0 0 1-.6 1.8H19v7.1a1.8 1.8 0 0 1-1.8 1.8H14v-6H10v6H6.8A1.8 1.8 0 0 1 5 19.2v-7.1H3.3a1 1 0 0 1-.6-1.8Z',
  files: 'm10 4 6-1a3 3 0 0 1 3.4 2.4l1 6a3 3 0 0 1-2.4 3.4l-1.2.2M5.7 6.4l6.8-.8a2.8 2.8 0 0 1 3.1 2.4l.9 9a2.8 2.8 0 0 1-2.4 3.1l-6.8.8a2.8 2.8 0 0 1-3.1-2.4l-.9-9a2.8 2.8 0 0 1 2.4-3.1ZM10 6l.4 3a1.8 1.8 0 0 0 2 1.6l3-.4',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  edit: 'M11 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-5M13.5 5.5l5 5M8 16l1-4L18 3a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2l-9 9-4 1Z',
  bell: 'M6 10a6 6 0 0 1 12 0v3.5l1.7 3a1 1 0 0 1-.9 1.5H5.2a1 1 0 0 1-.9-1.5l1.7-3V10ZM10 21a2.5 2.5 0 0 0 4 0',
  chevron: 'm9 5 7 7-7 7',
  down: 'm7 10 5 5 5-5',
  folder: 'M3 7h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM3 9V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2',
  more: 'M4 12h.01M12 12h.01M20 12h.01',
  check: 'm5 12 4 4L19 5',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  refresh: 'M20 7V3l-4 4M20 7a8 8 0 1 0 0 10M20 7h-5',
  help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  external: 'M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM7 9h10M7 13h7',
  trace: 'M9 5h12M9 12h12M9 19h12M3 3h3v4H3ZM3 10h3v4H3ZM3 17h3v4H3Z',
  target: 'M20 10a9 9 0 1 1-6-6M17 11a5 5 0 1 1-4-4M12 12l7-7M17 3v4h4',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M6.5 7l.9 12.1A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.9L17.5 7M10 11v6M14 11v6',
  at: 'M16 8v7a2 2 0 0 0 4 0v-3a8 8 0 1 0-3 6M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'
};
function Icon({ name, size = 16, active = false }) {
  const attrs = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: name === 'more' ? 3.6 : 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, 'data-icon': name };
  if (active && name === 'clock') return h('svg', attrs, h('circle', { cx: 12, cy: 12, r: 10, fill: 'currentColor', stroke: 'none' }), h('path', { d: 'M12 7v6l-3 2', stroke: 'var(--cg-rail-hand, white)', strokeWidth: 1.5 }));
  // Official static sidebar-tasks fallback NGr; retain selected treatment.
  if (name === 'clock') return h('svg', { ...attrs, viewBox: '0 0 20 20', strokeWidth: 1.33 }, h('circle', { cx: 10, cy: 10, r: 7.5 }), h('path', { d: 'M9.99996 5.8335V9.82757C9.99996 9.93808 9.95606 10.0441 9.87792 10.1222L7.91663 12.0835' }));
  if (name === 'home') return h('svg', { ...attrs, fill: active ? 'currentColor' : 'none' }, h('path', { d: paths.home }));
  // Official Space railIcons: WLa (default), VLa (selected).
  if (name === 'files') return h('svg', { ...attrs, viewBox: '0 0 20 20', stroke: 'none', fill: 'currentColor' },
    ...(active ? ["M8.28093 8.3185C8.37244 9.60284 9.48784 10.5709 10.7721 10.4796L14.1764 10.2365L14.6384 15.5177C14.7804 17.1432 13.5772 18.5763 11.9518 18.7189L5.10808 19.3175C3.48236 19.4596 2.04914 18.2567 1.90691 16.631L1.17546 8.26674C1.0334 6.64118 2.2355 5.20802 3.86101 5.06557L8.02214 4.70034L8.28093 8.3185Z","M7.01921 3.38784C7.47188 1.69984 9.20799 0.697271 10.8962 1.14955L16.9489 2.77162C18.6367 3.22417 19.6389 4.95967 19.1872 6.6476L17.2116 14.0216C17.0049 14.7926 16.5286 15.4178 15.9137 15.8292C15.9154 15.69 15.9115 15.549 15.8991 15.4074L15.3161 8.74819C15.2185 7.63342 14.682 6.60233 13.8249 5.88295L11.9704 4.32631C11.1133 3.60731 10.0048 3.25929 8.89031 3.35659L6.9821 3.5226L7.01921 3.38784Z","M9.34929 4.60756C10.0085 4.62836 10.6466 4.86781 11.1569 5.29604L13.0124 6.8517C13.6124 7.3554 13.988 8.07809 14.0563 8.85854L14.0602 8.9103L10.6774 9.15248C10.1259 9.19147 9.64655 8.77623 9.6071 8.22475L9.34929 4.60756Z"] : ["M7.01826 3.38781C7.47069 1.69958 9.20694 0.697366 10.8952 1.14953L16.9479 2.7716C18.6362 3.22397 19.6383 4.9593 19.1862 6.64757L17.2106 14.0216C16.8715 15.2866 15.8124 16.1623 14.5935 16.3341C14.3503 17.5978 13.2984 18.601 11.9528 18.7189L5.1081 19.3175C3.48242 19.4595 2.04916 18.2567 1.90693 16.631L1.17549 8.26672C1.03327 6.64107 2.23548 5.20804 3.86103 5.06554L6.63349 4.82238L7.01826 3.38781ZM3.97724 6.39074C3.08335 6.46908 2.42258 7.25658 2.50068 8.1505L3.23213 16.5148C3.31035 17.4088 4.0988 18.0705 4.99287 17.9923L11.8366 17.3937C12.7306 17.3154 13.3914 16.527 13.3132 15.6329L12.8444 10.2706L10.78 10.4523C9.49733 10.5643 8.3659 9.6148 8.25361 8.33214L8.05244 6.03332L3.97724 6.39074ZM10.5505 2.43468C9.57185 2.17269 8.56586 2.75305 8.30342 3.73156L8.04365 4.69836L8.9997 4.61535C9.78022 4.54706 10.5566 4.79156 11.1569 5.29504L13.0124 6.85168C13.6126 7.35543 13.988 8.07788 14.0563 8.85851L14.5915 14.9825C15.2198 14.8273 15.7464 14.3452 15.9255 13.6769L17.9011 6.30382C18.1633 5.32505 17.5829 4.31818 16.6042 4.05578L10.5505 2.43468ZM9.57881 8.21593C9.62702 8.76703 10.1136 9.17528 10.6647 9.12707L12.7272 8.9464C12.6834 8.52775 12.4799 8.14127 12.1569 7.87023L10.3024 6.31457C10.0402 6.09451 9.71672 5.96583 9.37959 5.94054L9.57881 8.21593Z"]).map((d, index) => h('path', { key: index, d, fillRule: 'evenodd', clipRule: 'evenodd' })));
  if (name === 'at') return h('svg', { ...attrs, viewBox: '0 0 20 20', strokeWidth: 1.33, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: 'M4.38 6.236 C3.182 7.085 1.569 7.454 -0.001 7.454 C-4.651 7.454 -7.718 3.781 -7.418 -0.519 C-7.145 -4.416 -3.667 -7.454 0.313 -7.454 C4.865 -7.454 7.703 -3.928 7.418 0.159 C7.217 3.039 4.328 4.163 2.524 2.218', transform: 'translate(9.999 9.975)' }),
    h('path', { d: 'M-3.218 0.786 C-3.218 0.786 0.924 -3.201 0.924 -3.201 C1.008 -3.281 1.14 -3.278 1.22 -3.195 L2.523 -1.826 C3.749 -0.568 3.393 1.023 2.143 2.226 C0.894 3.429 -0.736 3.681 -1.92 2.45 L-3.224 1.08 C-3.303 0.997 -3.301 0.866 -3.218 0.786 Z', transform: 'translate(10.104 10.092)' }),
    h('path', { d: 'M0 .792 C0 .792 0 -.792 0 -.792', transform: 'translate(10.104 10.092) translate(-.43 -3.208) rotate(-43.907)' }),
    h('path', { d: 'M0 .792 C0 .792 0 -.792 0 -.792', transform: 'translate(10.104 10.092) translate(-3.181 -.561) rotate(-43.907)' }));
  // Official archive artwork, path-for-path from @deepseek-ai/dsh-client-ui-primitives
  // (IconArchiveOutlineRegular 16px box, IconUnarchiveOutlineRegular 20px box), so the session-row
  // action matches DSH's own sidebar button instead of a hand-drawn glyph.
  if (name === 'archive') return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, 'data-icon': name },
    h('path', { d: 'M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z' }),
    h('path', { d: 'M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5' }),
    h('path', { d: 'M6.5 9.5H9.5' }));
  if (name === 'unarchive') return h('svg', { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, 'data-icon': name },
    h('path', { fillRule: 'evenodd', clipRule: 'evenodd', stroke: 'none', fill: 'currentColor', d: 'M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z' }),
    h('path', { d: 'M10 14.1V10.1M7.85 12.05L10 9.9L12.15 12.05' }));
  // Self-drawn pushpin: pinning had no glyph anywhere in the shipped icon set, and drawing it here
  // keeps the row action free of third-party artwork.
  if (name === 'pin') return h('svg', { ...attrs, viewBox: '0 0 20 20', fill: active ? 'currentColor' : 'none' },
    h('path', { d: 'M8 3H12V4.6L11 5.8V8.2L13 10V11.3H7V10L9 8.2V5.8L8 4.6V3Z' }),
    h('path', { d: 'M10 11.3V17' }));
  // A plain cross, for the cancel half of an inline editor. Drawn here for the same reason.
  if (name === 'close') return h('svg', { ...attrs, viewBox: '0 0 16 16', strokeWidth: 1.4 },
    h('path', { d: 'M4 4L12 12' }),
    h('path', { d: 'M12 4L4 12' }));
  return h('svg', attrs, h('path', { d: paths[name] || paths.more }));
}
function Button({ icon, label, onClick, className = '', children, ...rest }) {
  return h('button', { type: 'button', className: `cg-button ${className}`, title: label, 'aria-label': label, onClick, ...rest }, icon && h(Icon, { name: icon }), children);
}
function TurnProcessStatus({ node, turnProcess }) {
  const turn = ['turn', 'step'].includes(node.location.kind) ? node.location.turn : null;
  if (!turnProcess || turn?.status !== 'closed') return null;
  const reason = turn.end?.data.reason.kind;
  const interrupted = reason === 'aborted' || reason === 'error';
  const canCollapse = turnProcess.foldable && turnProcess.hasContent && !interrupted;
  const open = !turnProcess.foldable || turnProcess.open || interrupted;
  const seconds = turn.start && turn.end ? Math.max(1, Math.floor((turn.end.time - turn.start.time) / 1000)) : null;
  const duration = seconds === null ? '' : `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}小时` : ''}${seconds >= 60 ? `${Math.floor(seconds / 60) % 60}分` : ''}${seconds % 60}秒`;
  const label = reason === 'aborted' ? '已停止' : reason === 'error' ? '执行失败' : duration ? `用时 ${duration}` : '已完成';
  return h('button', {
    type: 'button', className: 'cg-turn-process',
    'data-turn-process': node.data.turn,
    'data-open': open || undefined,
    'aria-label': label,
    'aria-expanded': canCollapse ? open : undefined,
    disabled: !canCollapse,
    onClick: () => turnProcess.setOpen(!open)
  }, h('span', { role: 'status' }, label),
  h('span', { className: 'cg-turn-process-arrow' }, h(Icon, { name: 'chevron', size: 14 })));
}

/**
 * The sidebar's hover card: one element for the page, moved and refilled instead of rebuilt.
 *
 * Position is a `transform`, so the browser animates it: moving down the list slides the card after
 * the pointer, which a freshly created element can never do. Showing and hiding ride on `opacity`
 * plus `visibility`, because `display` cannot be transitioned and unmounting is what made the
 * entrance replay per row.
 */

let hoverCard = null;
function hoverCardNode() {
  if (hoverCard !== null && hoverCard.isConnected) return hoverCard;
  // A hot reload re-evaluates this module, so `hoverCard` comes back as null while the old node is
  // still in the body. Appending a second one left a stale card behind — sometimes still visible,
  // because nothing removed it. Sweep any leftovers before creating the new one.
  document.querySelectorAll('.cg-task-preview-floating').forEach(node => node.remove());
  const node = document.createElement('div');
  node.className = 'cg-task-preview cg-task-preview-floating';
  node.setAttribute('role', 'tooltip');
  node.setAttribute('aria-hidden', 'true');
  node.append(document.createElement('strong'), document.createElement('div'), document.createElement('div'));
  document.body.append(node);
  hoverCard = node;
  return node;
}

function placeHoverCard({ title, right, top }) {
  const node = hoverCardNode();
  const [titleNode, modeNode, placeNode] = node.children;
  if (titleNode.textContent !== title) titleNode.textContent = title;
  if (modeNode.textContent !== '✓  工作') modeNode.textContent = '✓  工作';
  if (placeNode.textContent !== '▱  在你的电脑上运行') placeNode.textContent = '▱  在你的电脑上运行';
  // Measured before moving: the card's own size decides how far it may travel before it is nudged
  // back inside the window.
  const x = Math.max(8, Math.min(right + 4, window.innerWidth - node.offsetWidth - 8));
  const y = Math.max(8, Math.min(top, window.innerHeight - node.offsetHeight - 8));
  // A node that is not currently shown has no transform yet, so it sits at `left: 0; top: 0`. Writing
  // the position while the CSS transform transition is live would animate that jump — the card flying
  // in from the window corner. Only the transform is suppressed for this first write: `transition-property`
  // is narrowed to opacity, so the card still fades in, and the full CSS transition returns afterwards
  // for every later move between rows.
  if (node.dataset.on !== 'true') {
    node.style.transitionProperty = 'opacity';
    node.style.transform = `translate(${x}px, ${y}px)`;
    void node.offsetWidth;
    node.dataset.on = 'true';
    node.style.transitionProperty = '';
    return;
  }
  node.style.transform = `translate(${x}px, ${y}px)`;
  node.dataset.on = 'true';
}

function hideHoverCard() {
  if (hoverCard !== null && hoverCard.isConnected) hoverCard.dataset.on = 'false';
}
// One stylesheet per page, kept installed by a watcher that outlives any single plugin instance.// Nothing in this plugin removes the stylesheet or the root attribute any more: the earlier hot
// reload disposed the old instance (which removed both) without the replacement reinstalling them,
// leaving the sidebar rendered with no styles at all.
const STYLE_ID = 'dsh-codex-ui-style';
let styleWatcher = null;
let styleTimer = null;
/** Handle of the one-shot token-colour sweep scheduled by startStyleWatch, so a re-entry replaces it
 *  instead of stacking another. */
let initialScanFrame = 0;

/**
 * Open an external page.
 *
 * Use the system default browser, always. A page cannot choose a browser, and the one attempt to
 * choose (a host-side Edge launcher, 0.5.2) was wrong for a reason worth writing down: the account
 * session lives in the user's everyday browser, so opening the DeepSeek console in a different
 * browser sends them to a sign-in page instead of their own data. `window.open` is only a fallback
 * because the desktop shell refuses popups.
 */
function openExternal(url) {
  const shell = typeof window === 'undefined' ? undefined : window.dshDesktop;
  if (shell && typeof shell.openExternal === 'function') {
    try { shell.openExternal(url); return; } catch { /* fall through to the popup path */ }
  }
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* nothing left to try */ }
}

/**
 * Install the stylesheet, and repair it when a previous build's copy is still in the document.
 *
 * Testing only for the element's absence was a real bug. A host that hot-reloaded an older build left
 * a `style#dsh-codex-ui-style` behind; the new build found the element, skipped the write, and the page
 * kept rendering with the old sheet — or with an empty one, if the earlier instance had been disposed
 * between clearing and refilling it. The symptom is easy to misread: all the markup is present and
 * completely unstyled, including this plugin's own chrome, which looks like a broken bundle rather than
 * a stale stylesheet.
 *
 * The element is therefore not treated as "already done". Its text is compared against the sheet this
 * build carries and replaced when they differ: a page can only ever hold one build's CSS, so a mismatch
 * means the document is stale, never that the new sheet should be skipped.
 */
function installStyle() {
  let style = document.getElementById(STYLE_ID);
  if (style === null) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.pluginCss = 'dsh-codex-ui';
    (document.head ?? document.documentElement).appendChild(style);
  }
  if (style.textContent !== STYLE) style.textContent = STYLE;
  if (!document.documentElement.hasAttribute('data-chatgpt-ui')) document.documentElement.setAttribute('data-chatgpt-ui', '');
}

/**
 * Give shiki's token colours back.
 *
 * The host ships `.compact pre, .compact pre :is(code, span) { color: inherit !important }` in
 * `MarkdownText.module.css`. `pre` itself matches that rule, so its own inline
 * `color: var(--shiki-foreground)` is overridden to `inherit`, and every token span inherits that one
 * value. Redefining `--shiki-foreground` on `pre` therefore changes nothing — the variable is no longer
 * read once the declaration that reads it has lost the cascade. The block renders in
 * `--dsw-alias-label-tertiary`, which is the unreadable grey.
 *
 * No stylesheet can undo this: a declaration overridden by an author `!important` cannot be revived by
 * another author declaration of any specificity. One rule per token type would work only until shiki adds
 * a token type.
 *
 * An inline `!important` outranks every stylesheet `!important`, so the fix re-applies each span's own
 * declared colour through `style.setProperty(..., 'important')`. The original is still readable from
 * `span.style.color` — losing the cascade does not erase a declaration — so this restores exactly what
 * shiki wrote, for every token type, without knowing any of their names.
 */
function restoreTokenColors(root) {
  if (!root || root.nodeType !== 1) return;
  // The added node may itself be the span (streaming text arrives as individual runs).
  if (typeof root.matches === 'function' && root.matches('pre span[style]')) {
    reassertColor(root);
  }
  // Every other case is a subtree that may contain a block. Bailing when there is no <pre> keeps the
  // common mutation — a chat message with no code in it — down to one cheap query.
  if (typeof root.querySelector !== 'function' || root.querySelector('pre') === null) return;
  for (const span of root.querySelectorAll('pre span[style]')) reassertColor(span);
}
/** Re-apply one span's own declared colour at inline `!important` priority. */
function reassertColor(span) {
  const declared = span.style.color;
  if (declared === '' || span.style.getPropertyPriority('color') === 'important') return;
  span.style.setProperty('color', declared, 'important');
}
/** Re-attach to the live <head>/<html>: a replaced head would orphan an observer bound to the old one. */
function observeStyleTargets() {
  if (styleWatcher === null) return;
  styleWatcher.disconnect();
  styleWatcher.observe(document.documentElement, { childList: true, attributes: true, attributeFilter: ['data-chatgpt-ui'] });
  if (document.head !== null) styleWatcher.observe(document.head, { childList: true });
}
function startStyleWatch() {
  installStyle();
  if (styleWatcher !== null) return;
  styleWatcher = new MutationObserver(() => { observeStyleTargets(); installStyle(); });
  observeStyleTargets();
  // Belt and braces: one lookup per second also recovers when every observer target was torn down.
  styleTimer = setInterval(installStyle, 1000);
  // The transcript streams in and virtualisation recreates rows, so a one-shot pass would miss every
  // block that arrives after mount. Two decisions here, both measured:
  //
  // 1. Incremental, not a full sweep. A full `document.querySelectorAll('pre span[style]')` costs 12.8 ms
  //    of query time alone on a 45k-span transcript, and ~98 ms per pass once the per-span CSSOM reads
  //    are included — against a 16.7 ms frame budget that is 6-10 fps, paid on every frame while text
  //    streams. Consuming `addedNodes` instead brings a 50-span batch to 0.3 ms, because the common
  //    mutation is a message with no code in it at all.
  // 2. `attributes: ['style']` is watched too. React writes style through the IDL property, which resets
  //    the priority back to normal and silently undoes the fix; without this the colours would drop back
  //    to grey the first time a row re-renders.
  const pending = new Set();
  let frame = 0;
  const flush = () => {
    frame = 0;
    const roots = [...pending];
    pending.clear();
    for (const node of roots) restoreTokenColors(node.nodeType === 1 ? node : node.parentElement);
  };
  const schedule = node => {
    if (node) pending.add(node);
    if (frame !== 0) return;
    frame = requestAnimationFrame(flush);
  };
  const tokenObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') { schedule(record.target); continue; }
      for (const node of record.addedNodes) schedule(node);
    }
  });
  tokenObserver.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });
  // One initial pass over what is already on screen — the observer only sees what arrives later.
  initialScanFrame = requestAnimationFrame(() => { initialScanFrame = 0; restoreTokenColors(document.body ?? document.documentElement); });
  // No disposer is returned on purpose. The only caller drops the value, so returning one would read as
  // "this gets cleaned up" while the observer in fact outlives the call — the same lifetime `styleWatcher`
  // and `styleTimer` above already have. A guard that looks like cleanup but never runs is worse than no
  // guard: the next reader would build on it.
}
/**
 * 侧栏 rail 的扩展点：`window.__dshCodexUiRail`。
 *
 * 为什么要有：rail 那五个按钮是写死的，别的插件——或者只想加一条快捷方式的用户——要把自己的
 * 界面挂上侧栏，过去只能改本插件源码再重新打包，这件事对任何作者都不友好。这里把它改成一张
 * 登记表：登记一条就多一个按钮，点下去要么切到某个 `main` 面板，要么打开网址，要么跑一个回调。
 *
 * 为什么走 window 而不是 ctx：客户端这边每个插件拿到的是自己那份 ctx，跨插件没有共享面，宿主
 * 留给大家的公共对象只有页面的全局。键名固定为 `__dshCodexUiRail`，版本写在 `version` 上。
 *
 * 为什么还需要队列：别的插件可能比本包先加载，那时全局对象还不存在。约定是它们先
 * `window.__dshCodexUiRailQueue.push(entry)`，本包初始化时消费掉——谁先谁后都挂得上。
 *
 * 面板目标就是宿主 `main` 槽的 key（`ctx.slots.register({ name: 'main', key })` 里那个 key），
 * 点击走 `ctx.layout.selectPanel(key)`，与内置五个按钮的 `go()` 是同一条路。
 */
const RAIL_API_KEY = '__dshCodexUiRail';
const RAIL_QUEUE_KEY = '__dshCodexUiRailQueue';
/** id -> entry；Map 保留登记顺序，`order` 相同时按登记先后排。 */
const railEntries = new Map();
const railListeners = new Set();
/** 当前渲染侧栏时的打开动作，由 Sidebar 装上（它才拿得到 go / openExternal / collapsed）。 */
let railOpen = null;
/** 内置图标名；不在表里的一律当 svg path 处理。 */
const RAIL_ICON_NAMES = new Set(['home', 'files', 'clock', 'search', 'edit', 'bell', 'chevron', 'down', 'folder', 'more', 'check', 'settings', 'refresh', 'help', 'external', 'chat', 'trace', 'target', 'plus', 'trash', 'at']);
/**
 * 内置那几颗按钮已经画出来的图标。自定义项不能再用：侧栏上出现两个外链箭头，
 * 用户没法知道哪个点开是什么——这正是「中转站」那条踩过的坑。
 */
const RAIL_RESERVED_ICONS = new Set(['more', 'home', 'files', 'clock', 'at', 'external', 'settings']);
/** 没给图标、或给了保留图标时落到这里。`target` 是内置按钮没占用的那一个。 */
const RAIL_FALLBACK_ICON = 'target';
function railSnapshotList() {
  return [...railEntries.values()].sort((a, b) => a.order - b.order);
}
function railEmit() {
  for (const listener of [...railListeners]) {
    // 一个监听器抛错不该带走别的监听器，更不该带走渲染。
    try { listener(); } catch { /* ignore */ }
  }
}
function railSubscribe(listener) {
  railListeners.add(listener);
  return () => railListeners.delete(listener);
}
/**
 * 把外部给的对象整理成一条可以渲染的条目，不合格返回 null。
 *
 * 三个目标（panel / url / onClick）一个都没有的条目，点下去什么也不会发生；与其在侧栏放一个
 * 死按钮，不如拒绝并留一行 warn，让作者当场看见自己的问题。
 */
function normalizeRailEntry(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (id === '' || id.length > 64 || label === '' || label.length > 40) return null;
  const panel = typeof raw.panel === 'string' && raw.panel.trim() !== '' ? raw.panel.trim() : '';
  const section = typeof raw.section === 'string' ? raw.section.trim() : '';
  // url 不再只收 http(s)：`steam://`、`tencent://` 这类自定义协议由 Electron 的 shell 打开，
  // 侧栏挂一个「打开 QQ」就是这么来的。只挡掉会把脚本送进页面的那几个协议。
  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
  const blocked = /^(?:javascript|data|vbscript|file):/i.test(rawUrl);
  const url = rawUrl !== '' && !blocked && /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : '';
  // `exec` 是本机程序的完整路径，点击时由宿主进程直接启动。它绕开了应用协议那一层——
  // 协议经常被别的版本抢注册，点下去弹出来的是别人的报错。
  const exec = typeof raw.exec === 'string' ? raw.exec.trim() : '';
  const onClick = typeof raw.onClick === 'function' ? raw.onClick : null;
  if (panel === '' && section === '' && url === '' && exec === '' && onClick === null) return null;
  const iconName = typeof raw.icon === 'string' ? raw.icon.trim() : '';
  const iconPath = typeof raw.iconPath === 'string' ? raw.iconPath.trim() : '';
  return {
    id,
    label,
    panel,
    section,
    url,
    exec,
    onClick,
    // `code` = 客户端登记（插件调用 register）；`config` = 从宿主配置文件同步来的。
    // 两边同 id 时以 code 为准：插件手上是活的函数，文件里只是一份快照。
    source: raw.source === 'config' ? 'config' : 'code',
    icon: RAIL_ICON_NAMES.has(iconName) && !RAIL_RESERVED_ICONS.has(iconName) ? iconName : RAIL_FALLBACK_ICON,
    iconPath,
    // 自定义 path 的 viewBox 一并支持：16×16 的图（宿主 primitives 里很多）直接塞进 24 的框会缩水。
    iconViewBox: typeof raw.iconViewBox === 'string' && raw.iconViewBox.trim() !== '' ? raw.iconViewBox.trim() : '0 0 24 24',
    order: Number.isFinite(raw.order) ? raw.order : 100,
    // 三种态，不能压成布尔：true 上侧栏、false 收进弹层、undefined 从没表过态（老配置、插件直接登记）。
    // 界面靠「有没有人表过态」决定要不要退回到默认取前三条，压成 false 就再也分不出这两件事了。
    pinned: raw.pinned === true ? true : raw.pinned === false ? false : undefined
  };
}
function railRegister(raw) {
  const entry = normalizeRailEntry(raw);
  if (entry === null) {
    console.warn('[dsh-codex-ui] rail entry rejected (needs id, label and one of panel/url/onClick):', raw);
    return () => {};
  }
  railEntries.set(entry.id, entry);
  railEmit();
  // 返回销毁函数：React 那边用它做 effect 清理，非 React 调用方直接调用也行。
  return () => railRemove(entry.id);
}
function railRemove(id) {
  const removed = railEntries.delete(typeof id === 'string' ? id : '');
  if (removed) railEmit();
  return removed;
}
/** 轮询直到 probe 返回非空，或者超时。DOM 什么时候就绪只能这样等，没有事件可听。 */
function waitForNode(probe, timeout) {
  return new Promise(resolve => {
    const started = Date.now();
    const tick = () => {
      let value = null;
      try { value = probe(); } catch { value = null; }
      if (value !== null && value !== undefined) { resolve(value); return; }
      if (Date.now() - started >= timeout) { resolve(null); return; }
      setTimeout(tick, 60);
    };
    tick();
  });
}
/**
 * 账号菜单里的「设置」项。
 *
 * 按语义找，不靠类名：宿主给菜单项的就是 `button[role="menuitem"]`，文本由 locale 决定，
 * 所以中英文都认。账号菜单就那么几行，和别的菜单不会同时开着。
 */
function findSettingsMenuItem() {
  const items = [...document.querySelectorAll('button[role="menuitem"]')];
  return items.find(node => /(设置|Settings|Preferences)/i.test(node.textContent ?? '')) ?? null;
}
/** 宿主设置弹窗的根节点：既能判断开没开，也能在里面找分区导航。 */
function settingsModalNode() {
  return document.querySelector('[data-shortcut-modal="settings"]');
}
/**
 * The turn rail's active marker, made to travel.
 *
 * The host does not move one element down the rail: it renders a 2px bar inside whichever row holds
 * the active turn (`zYyrIG_turnRail`, only when `record.turn === activeTurn`). Changing turns
 * therefore removes one bar and creates another, which no transition can animate — and that is
 * exactly why the marker looks frozen in a session with few turns and only ever snaps in a long one.
 * This draws a single overlay bar and places it on the host's bar whenever anything may have moved;
 * the transform does the travelling, so it slides like the chat list's hover card.
 */
export const inject = ['slots', 'layout', 'uiWorkspace', 'theme', 'connection', 'sessions', 'uiSession', 'remote', 'remote.agentPresets', 'remote.session', 'remote.skills'];export function apply(ctx) {
  // 回复锻造（原 dsh-codex-ui-HF）先起：它自带样式注入与 DOM 扫描，不依赖本包其余
  // 模块的初始化顺序，挂不上也不该拖累下面任何一步，所以单独包一层。
  // ReplyForgeBundle 由 build.mjs 在工厂里注入；单独跑 src/client.js 时它不存在，
  // typeof 保护让那两种情况都不报错。
  try {
    if (typeof ReplyForgeBundle !== 'undefined' && ReplyForgeBundle !== null && typeof ReplyForgeBundle.apply === 'function') {
      ReplyForgeBundle.apply(ctx);
    }
  } catch (error) {
    console.warn('[dsh-codex-ui] reply-forge client unavailable:', String(error));
  }
  // Stylesheet first, before any slot registration. Slot registrations can throw (a single-kind slot
  // rejects a second entry at the same priority), and when that happened mid-apply the stylesheet
  // and the root attribute were never installed, leaving the sidebar rendered but unstyled.
  // The install is idempotent and its watcher deliberately outlives this instance: a hot reload
  // disposes the previous instance, and if the replacement's effect does not run the observer still
  // puts the stylesheet and the root attribute back. A page that renders the sidebar without its
  // stylesheet is far worse than a style element surviving an unload (a real uninstall restarts the
  // host and reloads the page).
  startStyleWatch();
  // 完成提醒要读会话 store，而模块顶层拿不到 ctx，所以只能在这里启动。
  typeof startDoneNotify === 'function' && startDoneNotify(ctx);
  // Measure the sheet's host-module assumptions against the live DOM, then twice more as the shell
  // settles. Deliberately NOT on the 1s style timer below: that sheet is written for a host
  // generation, which changes on install, not on a page update — a per-second diagnostic would only
  // add noise to the very signal it exists to provide.
  // The typeof guard is not defensive padding. `lib/client.js` is one concatenated factory body, so a
  // helper the build failed to splice in is a ReferenceError *here* — which takes the whole skin down,
  // not just this diagnostic. The guard keeps the blast radius at zero.
  typeof runHostContractCheck === 'function' && runHostContractCheck();
  // Two retries for a slow mount. The check itself refuses to judge anything before the host has
  // rendered one of its mandatory hooks, so these are not a schedule and the numbers carry no magic.
  setTimeout(() => { typeof runHostContractCheck === 'function' && runHostContractCheck(); }, 5000);
  setTimeout(() => { typeof runHostContractCheck === 'function' && runHostContractCheck(); }, 15000);
  startRunningStatusStyle();
  // The display names are client-side state the Host needs for the system prompt, so the map is pushed
  // over the Connection carrier. `wireAliasSender` lives in `src/alias-sync.js`, which the build
  // concatenates into this factory (see scripts/build.mjs) — not an import here, for the same reason
  // `registerModelUI` is not one.
  wireAliasSender(payload => {
    // The promise is returned so the publisher can retry a failure. A single silent attempt during
    // activation — before the Connection carrier is necessarily usable — is how the Host ended up with
    // no record of the names at all.
    // Sent through the turbo route, which is the one this environment has always answered: the
    // dedicated route registered on the Host yet stayed unreachable from the client (HTTP 404).
    return ctx.connection?.rpc?.call?.('/api', 'dsh-codex-ui/turbo', { action: 'aliases', sessionId: '', ...payload });
  });
  registerModelUI(ctx);
  // 侧栏扩展点对外发布。写一个全局对象而已，放哪都行；放在槽注册之前，是为了让"本包初始化时
  // 顺带消费队列"这件事发生在第一帧渲染之前——先登记的那一条不该等到用户点一下才出现。
  try {
    const host = typeof window === 'undefined' ? null : window;
    if (host !== null && host[RAIL_API_KEY] === undefined) {
      host[RAIL_API_KEY] = {
        version: 1,
        register: railRegister,
        remove: railRemove,
        // `unregister` 是同一件事的另一个叫法，两边习惯都照顾到，省得作者翻文档确认。
        unregister: railRemove,
        list: () => railSnapshotList().map(entry => ({ id: entry.id, label: entry.label, panel: entry.panel, url: entry.url, order: entry.order })),
        // 点按钮之外，也能被别的插件用代码打开某一条（比如它自己的快捷键）。
        open: id => { if (railOpen !== null) railOpen(railEntries.get(typeof id === 'string' ? id : '') ?? null); }
      };
      // 先于本包加载的插件只能 push 到队列里，这里一次性收编。
      const queued = host[RAIL_QUEUE_KEY];
      if (Array.isArray(queued)) {
        for (const raw of queued.splice(0, queued.length)) railRegister(raw);
      }
    }
  } catch (error) {
    console.warn('[dsh-codex-ui] rail api unavailable:', String(error));
  }
  // 不写插件也想加一条的路径：localStorage 里放一个 JSON 数组即可，形如
  // [{ "id": "gh", "label": "GitHub", "icon": "external", "url": "https://github.com" }]
  // 这是给普通用户准备的，插件作者走上面那个 register 更合适（能拿到 dispose、能传回调）。
  try {
    const stored = window.localStorage?.getItem?.('dsh-codex-ui/rail-items');
    if (typeof stored === 'string' && stored !== '') {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) for (const raw of parsed) railRegister(raw);
      else console.warn('[dsh-codex-ui] rail-items 需要一个数组');
    }
  } catch (error) {
    console.warn('[dsh-codex-ui] rail-items unreadable:', String(error));
  }
  // 配置文件通道：宿主把 `$DSH_HOME/dsh-codex-ui-rail.json` 经由 rpc 读出来。用户自己改文件、
  // 或者他的 Agent 用 `sidebar_rail` 工具写文件，都从这条路进来，界面上 15 秒内出现。
  // 轮询而不是订阅文件：这个面板可能同时开好几个窗口，轮询是唯一不依赖宿主额外能力、
  // 且在任何窗口都成立的做法，15 秒一次本地调用也不值得优化。
  let railConfigIds = new Set();
  const syncRailFromHost = async () => {
    let items;
    try {
      const result = await ctx.connection?.rpc?.call?.('/api', 'dsh-codex-ui/rail', { action: 'list' });
      if (!result?.ok) return;
      items = Array.isArray(result.value?.items) ? result.value.items : [];
    } catch {
      // 宿主没有这条路（旧版插件、路由没起来）时安静退出，localStorage 与插件登记照常。
      return;
    }
    const incoming = [];
    for (const item of items) {
      const entry = normalizeRailEntry({ ...item, source: 'config' });
      if (entry !== null) incoming.push(entry);
    }
    const nextIds = new Set(incoming.map(entry => entry.id));
    let changed = false;
    // 文件里删掉的条目要跟着消失。只清 config 来源的，插件登记的不受文件影响。
    for (const id of railConfigIds) {
      if (!nextIds.has(id) && railEntries.get(id)?.source === 'config') { railEntries.delete(id); changed = true; }
    }
    railConfigIds = nextIds;
    for (const entry of incoming) {
      const existing = railEntries.get(entry.id);
      if (existing !== undefined && existing.source === 'code') continue;
      railEntries.set(entry.id, entry);
      changed = true;
    }
    if (changed) railEmit();
  };
  // 把"当前有哪些 main 面板可以挂"上报给宿主，Agent 才能查到该往 panel 里填什么。
  // 面板只在浏览器这边可见（`entriesOfSlot` 是客户端的服务），工具却在宿主侧跑，所以要中转。
  const reportRailPanels = async () => {
    let panels;
    try {
      const entries = ctx.slots?.entriesOfSlot?.('main');
      if (!Array.isArray(entries)) return;
      panels = entries
        .map(entry => ({
          key: typeof entry?.options?.key === 'string' ? entry.options.key : '',
          // registrant 在 entry 顶层，不在 options 里（dsh-client-ui-slots 组装 entry 时提升了）。
          by: typeof entry?.registrant === 'string' ? entry.registrant : ''
        }))
        .filter(panel => panel.key !== '');
    } catch {
      return;
    }
    try {
      await ctx.connection?.rpc?.call?.('/api', 'dsh-codex-ui/rail', { action: 'panels', panels });
    } catch { /* 上报失败不影响侧栏，也不该在控制台刷屏 */ }
  };
  syncRailFromHost();
  reportRailPanels();
  try {
    const timer = setInterval(() => { syncRailFromHost(); reportRailPanels(); }, 15000);
    const stop = () => clearInterval(timer);
    if (typeof ctx.effect === 'function') ctx.effect(() => stop);
    else window.addEventListener('pagehide', stop, { once: true });
  } catch { /* 定时器起不来时至少有首次同步那一次 */ }
  // A host that does not expose this extension point must lose one feature, not the whole interface:
  // every registration below goes through here, so an older build without `slots.inject` still gets
  // the styles, the model panel and the window-level chrome.
  const mountSlot = (...args) => {
    if (typeof ctx.slots?.inject !== 'function') return undefined;
    try { return ctx.slots.inject(...args); }
    catch (error) { console.warn('dsh-codex-ui: slot registration refused', error); return undefined; }
  };
  // 注入块设置页：宿主设置弹窗左侧多一项，页面本身是一列开关，逐个控制 `policyText()` 里的段落。
  // 走同一个容错入口，老宿主只丢这一页；`registerInjectionSection` 由 build 拼进本工厂体
  // （见 scripts/build.mjs），所以这里没有 import。
  registerInjectionSection(ctx, mountSlot);
  mountSlot('conversation.session.header.utilities', () => {
    const native = ctx.slots.entries('conversation.session.header.utilities').find(entry => entry.options.id === 'session-log-download');
    const header = ctx.slots.entriesOfSlot('conversation.session.header')[0];
    if (!native || !header) return;
    function ConversationMoreMenu(props) {
      const views = props.useConversationViews(value => value);
      const preferred = props.useStore(state => state.view);
      const active = views.find(view => view.id === preferred)?.id ?? views[0]?.id;
      const original = native.component(props);
      return React.cloneElement(original, {}, React.Children.map(original.props.children, child => {
        if (!React.isValidElement(child) || !Array.isArray(child.props.items)) return child;
        return React.cloneElement(child, {
          items: [...views.map(view => ({ id: `cg-view:${view.id}`, label: view.label, icon: h(Icon, { name: active === view.id ? 'check' : view.id === 'chat' ? 'chat' : 'trace' }) })), ...child.props.items],
          onSelect: id => {
            if (!id.startsWith('cg-view:')) return child.props.onSelect(id);
            child.props.onClose();
            props.selectView(id.slice('cg-view:'.length));
          }
        });
      }));
    }
    return ctx.slots.register({
      name: 'conversation.session.header.utilities', ...native.options, priority: -10,
      locale: native.locale, store: header.store,
      inject: (sessionId, actions) => {
        const original = native.inject?.(sessionId, actions) || {};
        const navigation = header.inject(sessionId, actions);
        return { ...original, selectView: navigation.selectView, hooks: { ...original.hooks, ...navigation.hooks } };
      }
    }, ConversationMoreMenu);
  });
  mountSlot('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark', priority: -10
  }, HeroMark));
  mountSlot('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'turn-process', priority: -10
  }, TurnProcessStatus));
  ctx.effect(() => {
    const root = document.documentElement;
    const update = () => {
      const text = document.querySelector('[data-composer-input]')?.textContent || '';
      root.toggleAttribute('data-cg-setting-goal', /(?:^|\s)\/goal(?:\s|$)/.test(text));
    };
    const observer = new MutationObserver(update);
    observer.observe(document.getElementById('root'), { childList: true, subtree: true, characterData: true });
    update();
    return () => { observer.disconnect(); root.removeAttribute('data-cg-setting-goal'); };
  });
  // New-chat hero title. The native headline text comes from the `conversation` locale
  // dictionary, which this plugin must not re-register, so the title is rendered here:
  // CSS hides the native spans and shows `.cg-hero-title`, which carries the headline
  // plus the project name the hero already displays in its workspace chip. Sync is
  // keyed off `data-cg-title`, so React re-renders simply trigger a re-decorate.
  ctx.effect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    // Two spellings, because the host's CSS-module hash renames the class between builds: the
    // hashed form is what ships today, and `composerHero` is what the previous generation used.
    const heroOf = () => document.querySelector('[class*="composerHero"]') ?? document.querySelector('[class*="_hero"]') ?? null;
    const titleGroupOf = hero => [...hero.querySelectorAll('[class*="titleGroup"]')].find(node => !node.closest('.cg-hero-title')) ?? null;
    const projectOf = hero => {
      // Read the native chip only: the clone this effect appends also carries a workspaceLabel and
      // sits earlier in the DOM, so a bare querySelector would read the clone's stale text back.
      const native = [...hero.querySelectorAll('[class*="workspaceLabel"]')].find(node => !node.closest('.cg-hero-title'));
      const label = native?.textContent?.trim() || '';
      // Neither the default workspace nor any unselected-workspace placeholder is a project name.
      return !label || label === '默认工作区' || label === 'default-workspace'
        || label === '选择工作区' || label === 'Choose workspace' ? '' : label;
    };
    const projectChipOf = (hero, project) => {
      const native = hero.querySelector('button[class*="workspace"][aria-label]');
      if (!native) return null;
      const chip = native.cloneNode(true);
      for (const attribute of ['type', 'aria-haspopup', 'aria-expanded', 'aria-label', 'title']) chip.removeAttribute(attribute);
      chip.classList.add('cg-hero-project');
      chip.querySelectorAll('[class*="chevron"]').forEach(node => node.remove());
      chip.setAttribute('aria-label', `${HERO_TITLE} · ${project}`);
      return chip;
    };
    const decorate = (hero, group, project) => {
      const row = document.createElement('span');
      row.className = 'cg-hero-title';
      const text = document.createElement('span');
      text.className = 'cg-hero-title-text';
      text.textContent = HERO_TITLE;
      text.setAttribute('role', 'heading');
      text.setAttribute('aria-level', '1');
      row.append(text);
      // No project chip beside the headline. The owner does not want one there, and the clean way to
      // remove it is to not build it: hiding the clone exposed the host's own chip underneath, and
      // hiding both took the workspace control away from the composer as well. `project` is still read
      // and still stored on `data-cg-title` below, so the title row keeps tracking which workspace it
      // was painted for; nothing is drawn from it.
      group.setAttribute('data-cg-title', project);
      group.append(row);
    };
    const sync = () => {
      const hero = heroOf();
      const group = hero ? titleGroupOf(hero) : null;
      if (!group) {
        for (const stale of document.querySelectorAll('.cg-hero-title')) stale.remove();
        return;
      }
      const project = projectOf(hero);
      if (group.getAttribute('data-cg-title') === project) return;
      group.querySelectorAll('.cg-hero-title').forEach(node => node.remove());
      decorate(hero, group, project);
    };
    sync();
    /**
     * Guarded against self-feeding, which is what made the hero's project chip flicker.
     *
     * This observer watches the whole root for `childList`, `subtree` AND `characterData`, and `decorate`
     * writes into that same subtree — it appends a row and assigns `textContent`. Every one of those
     * mutations is delivered back to `sync` on the next microtask. The `data-cg-title` check is supposed to
     * stop the loop, and it does while the host keeps the same title group: the attribute rides on the
     * group, so the second pass finds it equal and returns.
     *
     * It stops working the moment the host re-renders that group. A fresh node arrives with no
     * `data-cg-title`, and `projectOf` reads the native chip's text from a node the host is rebuilding —
     * which is empty for a frame, then the project name again. So `project` alternates between '' and
     * 'DSH', the equality check never holds, and the row is torn down and rebuilt as fast as the
     * observer fires. That is the flicker.
     *
     * Two fixes, both needed: `settling` drops the mutations this effect causes itself, and the project is
     * latched per group node so a momentarily-empty read cannot flip the chip off and back on. The latch is
     * keyed on the group so a genuinely new workspace still updates.
     */
    let settling = false;
    let latchedGroup = null;
    let latchedProject = '';
    const runSync = () => {
      settling = true;
      try { sync(); } finally { settling = false; }
    };
    const projectOfStable = hero => {
      const group = titleGroupOf(hero);
      const read = projectOf(hero);
      if (group !== null && group === latchedGroup) {
        // A blank read is the host mid-rebuild, not the user leaving the workspace.
        if (read === '') return latchedProject;
        latchedProject = read;
        return read;
      }
      latchedGroup = group;
      latchedProject = read;
      return read;
    };
    const syncStable = () => {
      const hero = heroOf();
      const group = hero ? titleGroupOf(hero) : null;
      if (!group) {
        for (const stale of document.querySelectorAll('.cg-hero-title')) stale.remove();
        return;
      }
      const project = projectOfStable(hero);
      if (group.getAttribute('data-cg-title') === project) return;
      group.querySelectorAll('.cg-hero-title').forEach(node => node.remove());
      decorate(hero, group, project);
    };
    latchedGroup = titleGroupOf(heroOf() ?? document.body) ?? null;
    settling = true;
    try { syncStable(); } finally { settling = false; }
    /**
     * The observer no longer drives `decorate` directly. It schedules one pass per animation frame.
     *
     * The previous version called `syncStable()` inside the callback and cleared `settling` in a
     * `finally`, which cannot work: a `MutationObserver` callback runs *after* the microtask queue, so
     * by the time the next batch is delivered `settling` has long been reset to false. Every mutation
     * this effect caused — the appended row, the assigned `textContent`, the removed stale nodes — came
     * back as fresh input, and the hero's project chip was torn down and rebuilt as fast as the browser
     * could deliver batches. That is the flicker, and it survived the first attempt at a guard.
     *
     * Two changes make the loop impossible rather than unlikely:
     *
     * 1. Coalescing. `pending` collapses any number of mutations in one frame into a single pass, so
     *    the cost is bounded by the frame rate no matter how noisy the host is.
     * 2. A signature check on the DOM we own. `syncStable` already returns early when the group's
     *    `data-cg-title` matches, but that attribute lives on a node the host replaces — so the marker
     *    is compared against the row that is actually on screen (`textContent` of the row plus the
     *    project name). A pass that would produce the same output writes nothing and therefore causes
     *    no mutation to come back.
     */
    let pending = false;
    let disposed = false;
    const schedule = () => {
      if (pending || disposed) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (disposed) return;
        try { syncStable(); } catch { /* a torn-down hero must not break the loop */ }
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      disposed = true;
      observer.disconnect();
      for (const stale of document.querySelectorAll('.cg-hero-title')) stale.remove();
    };
  });
  // Both schemes are provided so Settings → Appearance keeps working.
  const pairs = {
    '--dsw-alias-bg-base': ['#ffffff', '#212121'],
    '--dsw-specific-sidebar-fill': ['#fbfbfb', '#171717'],
    '--dsw-specific-input-major': ['#ffffff', '#303030'],
    '--dsw-alias-label-primary': ['#202123', '#ececec'],
    '--dsw-alias-label-secondary': ['#424242', '#d1d1d1'],
    '--dsw-alias-label-caption': ['#999999', '#929292'],
    '--dsw-alias-state-business-primary': ['#3982fa', '#6b9fff'],
    '--dsw-alias-button-info-fill': ['#3982fa', '#3982fa']
  };
  // 暂时取消宿主 token 覆盖注册：验证它是否为主题切换闪烁的来源（配色已由 style.css 的 --dsw-* 兜底承担）。

  const go = id => ctx.layout?.selectPanel?.(id);
  // Typing must not slide the transcript. One frame after each input event the conversation
  // column is compared with where it was: if it moved downward, the view is put back. Whatever
  // the mover is — the composer growing, scroll anchoring, or the app's follow logic — the
  // correction is bounded to that one frame and to 200px, so a finishing turn or a deliberate
  // scroll is never fought. The original drift's root cause was not identified; this is a
  // symptom-level guard, not a diagnosis.
  ctx.effect(() => {
    const compensate = () => {
      const scroller = document.querySelector('[data-conversation-scroll]');
      if (!scroller) return;
      const before = scroller.scrollTop;
      requestAnimationFrame(() => {
        const moved = scroller.scrollTop - before;
        if (moved <= 0.5 || moved > 200) return;
        scroller.scrollTop = before;
      });
    };
    document.addEventListener('input', compensate, true);
    return () => document.removeEventListener('input', compensate, true);
  });
  /**
   * 人设的读取与写入。
   *
   * 走的是与 `chatgpt-ui/prompt-mode` 完全相同的一条 Connection 通道：`rpc.call` 自己组装
   * `{type:'client-request', rpcId, method, payload}` 信封，第三个参数就是内层业务 payload，
   * 所以这里只传 `{ action, ... }`，不再手工包一层（包了就是双层信封，宿主解析必然失败）。
   */
  async function personaRpc(action, change) {
    const result = await ctx.connection.rpc.call('/api', 'chatgpt-ui/personas', { action, ...(change ?? {}) });
    if (!result?.ok) throw new Error(result?.error?.message || '人设操作失败，请重试。');
    return result.value ?? {};
  }
  // 宿主列表才是唯一事实来源；这两项只是列表拉不到时菜单显示的内容，与宿主默认值一致。
  const FALLBACK_PERSONAS = [
    { id: 'DeepSeek', name: 'DeepSeek', description: '原版提示词', builtin: true },
    { id: 'Codex', name: 'Codex', description: '严谨、理性、严肃、简短', builtin: true }
  ];
  const EMPTY_PERSONA_UI = { list: null, dialog: false, draft: null, error: '', pending: false };
  /**
   * 三个采样参数。键名用 `top_p` 而不是 `topP`：`parsePersona` 把 frontmatter 的键小写化后取值
   * （`meta[match[1].toLowerCase()]`），宿主 `dsh-llm` 的字段也是 `top_p`，两个方向同一个拼写。
   *
   * 值一律以**字符串**存在 draft 里：`''` 表示「没设置」，保存时才 `Number(...)`。空串不能变成 `0`
   * —— 0 是一个合法且完全不同的温度。新建人设时温度与 Top P 预填各自的默认值（`0` / `0.95`），
   * 所以「没设置」只在用户主动清空数字框之后才出现。`max_tokens` 例外：宿主缺省时会重新填上
   * 256000，所以清空它的实际含义是「恢复默认」，占位提示也这么写。
   */
  const PERSONA_SAMPLING_FIELDS = ['temperature', 'top_p', 'max_tokens'];
  const PERSONA_SAMPLING_LABELS = { temperature: '温度', top_p: 'Top P', max_tokens: '最大输出' };
  /** 把一处来源（list 项、read 返回值）里的采样参数收成 draft 用的字符串；没有就是 `''`。 */
  const personaSamplingDraft = source => {
    const from = source?.persona ?? source ?? {};
    const draft = {};
    for (const key of PERSONA_SAMPLING_FIELDS) {
      const raw = from?.[key];
      draft[key] = typeof raw === 'number' && Number.isFinite(raw)
        ? String(raw)
        : typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : '';
    }
    return draft;
  };
  /** `''` → 不发这个键；有值 → `Number(...)`。整个弹窗里只有这里做数字转换。 */
  const personaSamplingPayload = draft => {
    const payload = {};
    const invalid = [];
    const before = draft?.samplingOriginal ?? {};
    for (const key of PERSONA_SAMPLING_FIELDS) {
      const raw = draft?.[key];
      const text = typeof raw === 'string' ? raw.trim()
        : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '';
      if (text === '') {
        if (String(before?.[key] ?? '').trim() !== '') payload[key] = null;
        continue;
      }
      const value = Number(text);
      if (Number.isFinite(value)) payload[key] = value; else invalid.push(key);
    }
    return { payload, invalid };
  };
  /**
   * 范围检查。
   *
   * 三个数字框都带 `min` / `max` / `step`，而浏览器的原生表单校验在 `onSubmit` **之前**就把
   * 越界值拦掉了：用户填了 3、点保存，`savePersona` 根本不会被调用，界面上也不会出现任何提示。
   * 所以表单整体加了 `noValidate`，范围改在这里判，和「不是有效数字」走同一条红字通道。
   *
   * `null` 与缺失表示「清空这一项」（见 `personaSamplingPayload`），不是 0，不参与范围判断。
   */
  const personaSamplingLimitError = payload => {
    // 官方文档：`temperature` 取 0 到 2。
    const temperature = payload?.temperature;
    if (typeof temperature === 'number' && !(temperature >= 0 && temperature <= 2)) return '温度要在 0 到 2 之间。';
    // 官方文档：`top_p` 必须大于 0、不超过 1。
    const topP = payload?.top_p;
    if (typeof topP === 'number' && !(topP > 0 && topP <= 1)) return 'Top P 要大于 0、不超过 1。';
    const maxTokens = payload?.max_tokens;
    if (typeof maxTokens === 'number' && !(Number.isInteger(maxTokens) && maxTokens >= 1)) return '最大输出要是正整数。';
    return '';
  };
  /** Persona read/write over the same turbo route the composer switches use. */
  async function tabTurbo(action, sessionId, change) {
    const result = await ctx.connection.rpc.call('/api', 'dsh-codex-ui/turbo', { action, sessionId, ...(change ?? {}) });
    if (!result?.ok) throw new Error(result?.error?.message || '回复风格更新失败，请重试。');
    return result.value ?? {};
  }
  function Sidebar({ collapsed, renderSlot, useSessionStatus, useSessions, useWorkspaces, usePanelInfo }) {
    const panel = usePanelInfo(s => s.activePanelId);
    const sessions = useSessions(s => s.byId);
    const currentSession = Object.values(sessions).find(session => (session.retainedBy?.mainView ?? 0) > 0);
    const [storedMode, setStoredMode] = React.useState(null);
    const currentMode = storedMode && storedMode.sessionId === currentSession?.id ? storedMode.mode : currentSession?.projectionValues?.cgPromptMode;
    // `brand` 的取值推迟到人设列表就绪之后（见下方「人设列表与编辑弹窗」）：自定义人设必须显示
    // 自己的名字，只有列表里查不到的 id 才退回 Codex —— 那是宿主侧的默认模式，也就是投影到达
    // 之前这一段窗口里的值。
    const [modePending, setModePending] = React.useState(false);
    const [modeError, setModeError] = React.useState('');
    const modeRequest = React.useRef(false);
    const modeSession = React.useRef(currentSession?.id);
    modeSession.current = currentSession?.id;
    React.useEffect(() => {
      setModeError('');
      setBrandMenu(false);
      if (currentSession?.id) ctx.connection.rpc.call('/api', 'chatgpt-ui/prompt-mode', { sessionId: currentSession.id, action: 'read' }).then(result => {
        if (!result.ok) throw new Error(result.error.message);
        if (modeSession.current === currentSession.id) setStoredMode(result.value);
      }).catch(error => {
        if (modeSession.current === currentSession.id) setModeError(error.message || '模式读取失败，请重试。');
      });
    }, [currentSession?.id]);
    const chooseMode = async mode => {
      if (!currentSession || modeRequest.current || currentSession.running) return;
      const sessionId = currentSession.id;
      modeRequest.current = true;
      setModePending(true);
      setModeError('');
      try {
        const result = await ctx.connection.rpc.call('/api', 'chatgpt-ui/prompt-mode', { sessionId, mode });
        if (!result.ok) throw new Error(result.error.message);
        if (modeSession.current === sessionId) { setStoredMode(result.value); setBrandMenu(false); }
      } catch (error) {
        if (modeSession.current === sessionId) setModeError(error.message || '模式切换失败，请重试。');
      } finally {
        modeRequest.current = false;
        setModePending(false);
      }
    };
    const scheduled = panel === 'cg-schedules';
    const skillsOpen = panel === 'cg-skills';
    const [localSection, setLocalSection] = React.useState('home');
    // The usage rail is a link, not a section: it opens a browser tab, so no panel maps to it.
    const section = scheduled ? 'clock' : skillsOpen ? 'external' : panel === 'plugins' ? 'at' : panel === null ? localSection : '';
    const rail = (icon, label, onClick, selected = section === icon, entry = null, extra = '') => h('button', { type: 'button', className: 'cg-button cg-rail-item' + (selected ? ' cg-rail-selected' : '') + (extra === '' ? '' : ' ' + extra), 'aria-label': label, 'aria-current': selected ? 'page' : undefined, onClick }, entry === null ? h(Icon, { name: icon, active: selected }) : railGlyph(entry, selected), h('span', { className: 'cg-rail-tooltip', role: 'tooltip' }, label));
    // 外部登记的条目：自定义 path 就用 path 画，没给就退回内置图标名。尺寸跟内置按钮的 svg 对齐（18px）。
    const railGlyph = (entry, selected) => entry.iconPath === ''
      ? h(Icon, { name: entry.icon, active: selected })
      : h('svg', { width: 18, height: 18, viewBox: entry.iconViewBox, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, 'data-icon': entry.id }, h('path', { d: entry.iconPath }));
    // 订阅登记表：别的插件在本页已经渲染之后才登记时，按钮应当立刻出现，而不是等用户刷新。
    const [railItems, setRailItems] = React.useState(() => railSnapshotList());
    React.useEffect(() => {
      setRailItems(railSnapshotList());
      return railSubscribe(() => setRailItems(railSnapshotList()));
    }, []);
    // 打开宿主设置弹窗。三条约束叠在一起才显得绕：
    //   · 宿主把「开没开、当前哪一页」关在设置外壳自己的 store 里（`createSettingsShellStore` 建在
    //     `sidebar.settings` 的 inject 作用域内），没有 provide 出来，外部拿不到它的 `openSection`；
    //   · 侧栏里藏着的那个开关只拉账号菜单（设置 / 意见反馈 / 退出登录），弹窗在菜单的第一项里；
    //   · 快捷键命令倒是公开注册的，所以先试合成一个 Ctrl+,，不行再点菜单。
    const openSettingsDialog = async () => {
      if (settingsModalNode() !== null) return true;
      // 合成按键不弹菜单，视觉上最干净。宿主若只认真实按键，这一步什么也不会发生，也没有副作用。
      try {
        const press = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', keyCode: 188, which: 188, ctrlKey: true, bubbles: true, cancelable: true }));
        press(document);
        press(window);
      } catch { /* 合成事件被挡下就走菜单 */ }
      await waitForNode(settingsModalNode, 260);
      if (settingsModalNode() === null) {
        document.querySelector('.cg-native-settings button')?.click();
        const item = await waitForNode(findSettingsMenuItem, 800);
        if (item !== null) item.click();
        await waitForNode(settingsModalNode, 1500);
      }
      return settingsModalNode() !== null;
    };
    // 打开设置并翻到某一页。分区清单是公开的（`settings.section` 槽），顺序和文案都能复刻，
    // 所以不用猜位置——宿主渲染那排导航读的就是同一份数据、同一种排序。
    const openSettingsSection = async sectionId => {
      if (!await openSettingsDialog()) return false;
      const node = settingsModalNode();
      if (node === null) return false;
      let rows = [];
      try {
        rows = ctx.slots.entries('settings.section').map(entry => ({
          id: entry?.options?.id ?? '',
          order: entry?.options?.order ?? 0,
          // 与宿主的 resolveSlotLabel 同一规则：是函数就调用。
          label: typeof entry?.options?.label === 'function' ? entry.options.label() : entry?.options?.label ?? ''
        })).sort((a, b) => a.order - b.order);
      } catch { return false; }
      const nav = node.querySelector('nav');
      const buttons = nav === null ? [] : [...nav.querySelectorAll('button')];
      if (buttons.length === 0) return false;
      const target = rows.find(row => row.id === sectionId);
      // 先按文案找：导航标签与这里同源，平时这条就够。
      if (target !== undefined && String(target.label) !== '') {
        const wanted = String(target.label).trim();
        const hit = buttons.find(button => (button.textContent ?? '').trim() === wanted);
        if (hit !== undefined) { hit.click(); return true; }
      }
      // 文案被改了措辞就按位置找：同一份清单、同一种排序，位置一定对得上。
      const index = rows.findIndex(row => row.id === sectionId);
      if (index >= 0 && buttons[index] !== undefined) { buttons[index].click(); return true; }
      return false;
    };
    // 侧栏上的链接和程序都交给宿主进程去开。
    // 页面上两条路都不通：`window.dshDesktop` 只在 `dsh-app:` 协议下才注入，用浏览器打开 GUI
    // 时根本不存在；`window.open` 又被宿主只放行 http/https，其余协议一律 deny。结果就是
    // `steam://`、`tencent://` 这类点了没反应。宿主是普通 Node 进程，由它起子进程交给系统的
    // 协议处理器、或者直接启动程序，不受那两层限制。
    const launchRailTarget = async entry => {
      try {
        const result = await ctx.connection?.rpc?.call?.('/api', 'dsh-codex-ui/rail', { action: 'open', id: entry.id });
        if (result?.ok) return;
        // 插件直接登记的条目压根不在配置文件里，宿主找不到它，退回页面的老办法。
        console.warn('[dsh-codex-ui] 宿主没能打开这一条，退回页面跳转：', result?.error?.message ?? entry.id);
      } catch (error) {
        console.warn('[dsh-codex-ui] 打开失败，退回页面跳转：', String(error?.message ?? error));
      }
      if (entry.url !== '') openExternal(entry.url);
    };
    const openRailEntry = entry => {
      if (!entry) return;
      if (entry.panel !== '') go(entry.panel);
      if (entry.section !== '') {
        openSettingsSection(entry.section).then(ok => {
          if (!ok) console.warn('[dsh-codex-ui] 设置里没有这一页，或没能打开设置弹窗：', entry.section);
        });
      }
      if (entry.url !== '' || entry.exec !== '') launchRailTarget(entry);
      if (entry.onClick !== null) {
        // 别人的回调，出错只记一行，不能把本页的渲染带下水。
        try { entry.onClick(entry); } catch (error) { console.warn('[dsh-codex-ui] rail entry failed:', entry.id, String(error)); }
      }
      if (collapsed) ctx.layout.toggleSidebar();
    };
    // 侧栏只放得下 3 个自定义按钮（内置五项之后的空间就这么宽），其余收进「更多」弹层。
    // 三这个数字与宿主侧 rail-config 的 MAX_PINNED 是同一个约束，改一处必须改另一处。
    const RAIL_SLOTS = 3;
    const [railMenu, setRailMenu] = React.useState(false);
    const [railNotice, setRailNotice] = React.useState('');
    // 右上角那个问号：就地展开一段说明，不往外跳文档——跳出去还得找回来。
    const [railHelp, setRailHelp] = React.useState(false);
    // 删除是两段式：第一下把按钮武装起来，第二下才真的删。撤销一条删掉的快捷方式得回去
    // 重新填一遍字段，而误点只需要一下——不对称，所以中间必须隔一道。
    const [railPendingRemove, setRailPendingRemove] = React.useState('');
    // 谁上侧栏由 `pinned` 说了算。只有「所有条目都没写过 pinned」（老配置、插件直接登记，没人表过态）
    // 时才退回按顺序取前三个；一旦有任何人表过态，就严格按 pinned 来——否则用户把三个全取消以后，
    // 它们会自己冒回来，等于根本关不掉。
    const railHasPinChoice = railItems.some(entry => entry.pinned !== undefined);
    const railShown = (railHasPinChoice ? railItems.filter(entry => entry.pinned === true) : railItems).slice(0, RAIL_SLOTS);
    // 撤下去的按钮要在 DOM 里多留一拍：React 一卸载，CSS 的淡出动画就没机会开始，用户只会看到它
    // 「啪」地消失。这里存着上一帧的清单，差集就是正在离场的那些，等它们播完再真正移除。
    const [railGhosts, setRailGhosts] = React.useState([]);
    const railPrevRef = React.useRef(railShown);
    React.useEffect(() => {
      const previous = railPrevRef.current;
      const liveIds = new Set(railShown.map(entry => entry.id));
      const leaving = previous.filter(entry => !liveIds.has(entry.id));
      railPrevRef.current = railShown;
      if (leaving.length === 0) return undefined;
      setRailGhosts(current => [...current.filter(item => !leaving.some(entry => entry.id === item.id)), ...leaving]);
      const timer = setTimeout(() => {
        setRailGhosts(current => current.filter(item => !leaving.some(entry => entry.id === item.id)));
      }, 240);
      return () => clearTimeout(timer);
    }, [railItems]);
    const setRailPinned = async (entry, pinned) => {
      setRailNotice('');
      if (entry.source === 'config') {
        try {
          const result = await ctx.connection?.rpc?.call?.('/api', 'dsh-codex-ui/rail', { action: 'pin', id: entry.id, pinned });
          if (result?.ok) { await syncRailFromHost(); return; }
          setRailNotice(result?.error?.message ?? '保存失败，请重试。');
        } catch (error) {
          setRailNotice(String(error?.message ?? error));
        }
        return;
      }
      // 插件直接登记的条目写不回配置文件：这次页面里生效，刷新后回到它登记时的样子。
      const current = railEntries.get(entry.id);
      if (current !== undefined) { railEntries.set(entry.id, { ...current, pinned }); railEmit(); }
    };
    const railKind = entry => entry.panel !== '' ? '面板' : entry.section !== '' ? '设置页' : entry.exec !== '' ? '程序' : '链接';
    const removeRailEntry = async entry => {
      setRailNotice('');
      if (railPendingRemove !== entry.id) {
        setRailPendingRemove(entry.id);
        // 武装状态三秒后自己解除：用户点了一下又改了主意，回来时按钮不该还架着。
        setTimeout(() => setRailPendingRemove(current => current === entry.id ? '' : current), 3000);
        return;
      }
      setRailPendingRemove('');
      if (entry.source === 'config') {
        try {
          const result = await ctx.connection?.rpc?.call?.('/api', 'dsh-codex-ui/rail', { action: 'remove', id: entry.id });
          if (result?.ok) { await syncRailFromHost(); return; }
          setRailNotice(result?.error?.message ?? '删除失败，请重试。');
        } catch (error) {
          setRailNotice(String(error?.message ?? error));
        }
        return;
      }
      // 插件直接登记的条目不在配置文件里，从登记表里摘掉就是删了它（插件重新注册时还会回来）。
      railRemove(entry.id);
    };
    React.useEffect(() => {
      if (!railMenu) return;
      const dismiss = event => { if (!(event.target instanceof Element) || event.target.closest('.cg-rail-more') === null) setRailMenu(false); };
      const escape = event => { if (event.key === 'Escape') setRailMenu(false); };
      document.addEventListener('pointerdown', dismiss);
      document.addEventListener('keydown', escape);
      return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
    }, [railMenu]);
    // 供 `__dshCodexUiRail.open(id)` 使用；每次渲染刷新闭包，拿到的永远是最新状态。
    railOpen = openRailEntry;
    const [settingsMenu, setSettingsMenu] = React.useState(false);
    const [balance, setBalance] = React.useState(null);
    const [balanceLoading, setBalanceLoading] = React.useState(false);
    const balancePending = React.useRef(false);
    const settingsAnchor = React.useRef(null);
    const refreshBalance = async () => {
      if (balancePending.current) return;
      balancePending.current = true;
      setBalanceLoading(true);
      try { setBalance(await ctx.connection.rpc.call('/api', 'dsh-codex-ui/balance', {})); }
      catch { setBalance({ ok: false, error: { message: '连接失败，请稍后重试' } }); }
      finally { balancePending.current = false; setBalanceLoading(false); }
    };
    React.useEffect(() => {
      if (!settingsMenu) return;
      refreshBalance();
      const dismiss = event => { if (!settingsAnchor.current?.contains(event.target)) setSettingsMenu(false); };
      const escape = event => { if (event.key === 'Escape') { setSettingsMenu(false); settingsAnchor.current?.querySelector('.cg-settings-trigger')?.focus(); } };
      document.addEventListener('pointerdown', dismiss);
      document.addEventListener('keydown', escape);
      return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
    }, [settingsMenu]);
    const [brandMenu, setBrandMenu] = React.useState(false);
    const [heroMarkOpen, setHeroMarkOpen] = React.useState(false);
    // Shared with the plugin's other client modules through the build's single factory scope.
    const sync = React.useSyncExternalStore(subscribeSyncState, syncState);
    const [notice, setNotice] = React.useState(false);
    const [projectsOpen, setProjectsOpen] = React.useState(false);
    const [pinsOpen, setPinsOpen] = React.useState(false);
    const [selectedTask, setSelectedTask] = React.useState(null);
    const [taskMenu, setTaskMenu] = React.useState(null);
    // The row menu and the mode menu both close on the next click anywhere else, exactly like the
    // settings menu above: having to find the same trigger again to dismiss them is work the reader
    // should not have to do. Declared after every state it reads, and the trigger itself is excluded
    // so clicking it still toggles its own menu shut.
    React.useEffect(() => {
      if (taskMenu === null && !brandMenu) return undefined;
      const dismiss = event => {
        // Duck-typed rather than `instanceof Element`: a click target in the test harness is a plain
        // object, and a bare `Element` reference would throw there.
        const target = event?.target;
        const inside = typeof target?.closest === 'function' && target.closest('.cg-task-menu, .cg-brand-menu, [data-menu-trigger]');
        if (inside) return;
        setTaskMenu(null);
        setBrandMenu(false);
      };
      const escape = event => { if (event.key === 'Escape') { setTaskMenu(null); setBrandMenu(false); } };
      document.addEventListener('pointerdown', dismiss, true);
      document.addEventListener('keydown', escape);
      return () => { document.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', escape); };
    }, [taskMenu, brandMenu]);
    // Rename dialog: the target Session, the draft, the Host's refusal, and the in-flight flag.
    const [renameTarget, setRenameTarget] = React.useState(null);
    const [renameDraft, setRenameDraft] = React.useState('');
    const [renameError, setRenameError] = React.useState('');
    const [renamePending, setRenamePending] = React.useState(false);
    const [taskHover, setTaskHover] = React.useState(null);
    // One card for the whole sidebar, moved and refilled rather than rebuilt: rebuilding it per row
    // threw the element away and made the entrance play again, so moving down the list looked like a
    // series of pops instead of one card sliding after the pointer.
    React.useEffect(() => {
      if (!taskHover) { hideHoverCard(); return undefined; }
      placeHoverCard(taskHover);
      const hide = () => { hideHoverCard(); setTaskHover(null); };
      document.addEventListener('scroll', hide, true);
      window.addEventListener('resize', hide);
      // The card used to depend entirely on the row's own `pointerleave`. That event does not arrive when
      // the row re-renders out from under the pointer, when the pointer leaves through the window edge,
      // or when the window loses focus — and the card then stays on screen with nothing left to close it,
      // which is the report. These are the guards that do not need the row to exist: pointer outside the
      // sidebar's box, any click, Escape, and losing the window.
      let frame = 0;
      const checkPointer = event => {
        if (frame !== 0 || typeof requestAnimationFrame !== 'function') return;
        const x = event.clientX, y = event.clientY;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const box = document.querySelector('.cg-navigation')?.getBoundingClientRect?.() ?? null;
          if (box === null) { hide(); return; }
          // A margin, because the card itself floats just outside the sidebar and crossing that strip
          // must not be read as leaving.
          const inside = x >= box.left - 28 && x <= box.right + 28 && y >= box.top - 4 && y <= box.bottom + 4;
          if (!inside) hide();
        });
      };
      const escape = event => { if (event.key === 'Escape') hide(); };
      document.addEventListener('pointermove', checkPointer, true);
      document.addEventListener('pointerdown', hide, true);
      document.addEventListener('keydown', escape, true);
      window.addEventListener('blur', hide);
      document.addEventListener('visibilitychange', hide);
      return () => {
        document.removeEventListener('scroll', hide, true);
        window.removeEventListener('resize', hide);
        document.removeEventListener('pointermove', checkPointer, true);
        document.removeEventListener('pointerdown', hide, true);
        document.removeEventListener('keydown', escape, true);
        window.removeEventListener('blur', hide);
        document.removeEventListener('visibilitychange', hide);
        if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      };
    }, [taskHover]);
    const [recentOpen, setRecentOpen] = React.useState(false);
    const [archivedOpen, setArchivedOpen] = React.useState(false);
    // Multi-select for the archived list. Only archived rows carry a checkbox, and the archive header
    // grows a 全选 / 取消全选 pair plus a batch delete once anything is picked. The set is keyed by
    // session id and pruned against `archivedList` at render time, so an id that leaves the archive
    // (or gets purged) can never stay selected invisibly.
    const [archivedSelected, setArchivedSelected] = React.useState(() => new Set());
    const [archiveBulk, setArchiveBulk] = React.useState('');
    // Child Sessions live in two groups that disclose independently: subagents and user branches.
    // Every set here is keyed by the spawning Session, so one group's disclosure can never move
    // the other's, and nothing but a click ever opens one. Three levels, opened in order: the row's
    // panel, then one group's header, then that group's page of rows.
    const [childPanel, setChildPanel] = React.useState(() => new Set());
    const [subagentOpen, setSubagentOpen] = React.useState(() => new Set());
    const [branchOpen, setBranchOpen] = React.useState(() => new Set());
    const [groupShowAll, setGroupShowAll] = React.useState(() => new Set());
    const [navigationError, setNavigationError] = React.useState('');
    // Sessions whose log the Host has already removed: the store still lists them until the next
    // load, so the row is hidden locally and never rendered again in this page.
    const [purgedIds, setPurgedIds] = React.useState(() => new Set());
    const workspaces = useWorkspaces(s => s);
    const pins = workspaces.pinnedSessionIds || [];
    // The registry-global archive set drives both the row action and what the lists show.
    const archivedIds = workspaces.archivedSessionIds || [];
    const archivedSet = new Set(archivedIds);
    // A Session whose log is gone can still linger in the client store: a parent's catalog projection
    // keeps listing a subagent after its log was deleted, yet the Host refuses every action on that
    // row (archive and open both fail with `session/not-found`). Such ids are asked about once, then
    // hidden, so a phantom row cannot keep offering an action that can never succeed.
    const [ghostIds, setGhostIds] = React.useState(() => new Set());
    const ghostChecked = React.useRef(new Set());
    const markGhost = id => setGhostIds(prev => { if (prev.has(id)) return prev; const next = new Set(prev); next.add(id); return next; });
    const isMissingSession = error => /not[- ]?found|no such session|hold no such session/i.test(String(error?.message ?? error));
    const missingNotice = '该会话的数据已不存在（日志已删除或被清理），已把它从列表里隐藏。';
    // A session the agent spawned as a subagent rides `parentId` in the client list store (the remote
    // summary calls it parentSessionId, and marks such rows origin 'subagent'). DSH's own sidebar
    // drops them from the list entirely; here they are folded into the spawning session's branch
    // instead, so a delegated task never lands as its own entry under 最近.
    const stamp = item => { const value = item?.updatedAt ?? item?.createdAt; return typeof value === 'number' ? value : Date.parse(value || '') || 0; };
    const parentOf = id => {
      const entry = sessions[id];
      if (entry === undefined) return undefined;
      const parent = entry.parentId ?? entry.parentSessionId;
      return typeof parent === 'string' && parent !== '' && parent !== id ? parent : undefined;
    };
    // Children are split by their own data, never by title or directory: a Session the agent
    // spawned carries `origin: 'subagent'`; anything else under a parent is a user branch.
    const childGroupsOf = React.useMemo(() => {
      const map = new Map();
      for (const id of Object.keys(sessions)) {
        // An archived child belongs to the 已归档 list, not to its parent's panel: keeping it in both
        // places is how a Session ended up reachable from neither. A phantom child is not listed at all.
        // 本插件刚删掉的子会话也要从分组里消失：删除只写 purgedIds，而分组只认 archived/ghost，
      // 于是父会话旁边那个「子代理 15」在刷新页面之前一直挂着旧数字——磁盘已经空了，界面还在数。
      if (archivedSet.has(id) || ghostIds.has(id) || purgedIds.has(id)) continue;
        const parent = parentOf(id);
        if (parent === undefined || sessions[parent] === undefined) continue;
        const groups = map.get(parent) ?? { subagents: [], branches: [] };
        (sessions[id]?.origin === 'subagent' ? groups.subagents : groups.branches).push(id);
        map.set(parent, groups);
      }
      const byAge = (a, b) => (sessions[a].createdAt ?? stamp(sessions[a])) - (sessions[b].createdAt ?? stamp(sessions[b])) || String(a).localeCompare(String(b));
      for (const groups of map.values()) { groups.subagents.sort(byAge); groups.branches.sort(byAge); }
      return map;
    }, [sessions, archivedIds, ghostIds, purgedIds]);
    // One question per candidate, to the Host rather than to the list the Host sent earlier: the
    // store cannot tell "this Session exists" from "its log was deleted after the row was built".
    //
    // This used to call `ctx.remote.session.inspect`, which does not exist on the client Remote surface:
    // the Host declares `inspect` without the `@Remote` marker (dsh-api-session-controller/lib/typert.host.js:1428-1431),
    // so no descriptor is generated and the property is absent (dsh-api-gateway/lib/types/client/index.js:469-494).
    // The `typeof` guard therefore returned every time and the whole probe was unreachable — measured by
    // grepping the generated Remote client: `/inspect/i` matches zero lines in dsh-api-session-controller/lib/typert.remote-client.js.
    // `projections` is exposed and answers exactly this question: its Host implementation returns null when the
    // Session does not exist (dsh-api-session-controller/lib/index.js:3149-3177). Remote methods resolve to a
    // result object rather than throwing (dsh-api-gateway/lib/types/client/index.js:282-287), so the failure is
    // read from the result, not from a catch.
    React.useEffect(() => {
      try {
        const projections = ctx.remote?.session?.projections;
        if (typeof projections !== 'function') return undefined;
        const pending = Object.keys(sessions).filter(id => sessions[id]?.origin === 'subagent' && !archivedSet.has(id) && !ghostIds.has(id) && !ghostChecked.current.has(id));
        if (pending.length === 0) return undefined;
        let cancelled = false;
        (async () => {
          for (const id of pending) {
            if (cancelled) return;
            ghostChecked.current.add(id);
            try {
              const result = await projections.call(ctx.remote.session, { sessionId: id });
              const gone = result?.ok === false
                ? isMissingSession(result.error)
                : result?.value === null || result?.value === undefined;
              if (gone && !cancelled) markGhost(id);
            } catch (error) { if (isMissingSession(error)) markGhost(id); }
          }
        })();
        return () => { cancelled = true; };
      } catch { return undefined; }
    }, [sessions, archivedIds, ghostIds, purgedIds]);
    const isBranchChild = id => { const parent = parentOf(id); return parent !== undefined && sessions[parent] !== undefined; };
    const groupOpen = { subagents: subagentOpen, branches: branchOpen };
    // The row's panel is its own state: opening it reveals the two group headers and nothing else,
    // so a Session with dozens of children costs one line collapsed and two lines open.
    const childPanelOpen = id => childPanel.has(id);
    const toggleChildren = id => {
      const open = childPanel.has(id);
      setChildPanel(prev => { const next = new Set(prev); if (open) next.delete(id); else next.add(id); return next; });
      // Closing the panel folds its groups too, so the next open starts at the two headers again
      // instead of resurrecting whatever page was on screen before.
      if (open) for (const setter of [setSubagentOpen, setBranchOpen]) setter(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
    const toggleGroup = (kind, id) => (kind === 'subagents' ? setSubagentOpen : setBranchOpen)(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    const revealGroup = key => setGroupShowAll(prev => { const next = new Set(prev); next.add(key); return next; });
    // The archive list is driven by the registry's own set, never by the session list. An id whose
    // Session the host no longer lists — an archived subagent whose parent moved on, or a log that
    // was already deleted — must still get a row: the row is the only way to unarchive it again.
    // The native search field lives inside `.cg-workspaces`, which this plugin renders `hidden`
    // (measured: display:none, 0x0), so clicking through to it could only ever expand a field that
    // can be neither seen nor focused — that is exactly why 搜索会话 looked dead. The field is the
    // plugin's own instead, filtering the three lists by title, display name or id.
    const [sessionQuery, setSessionQuery] = React.useState('');
    const [searchOpen, setSearchOpen] = React.useState(false);
    // ---- 人设列表与编辑弹窗 ----------------------------------------------------------------
    // 菜单不再写死 DeepSeek/Codex：列表来自宿主 `chatgpt-ui/personas` 的 `list`。列表、弹窗、
    // 草稿、错误和进行中都收进**一个** state —— 每次新增 `useState` 都会让它之后的槽位整体移位，
    // 而这条组件里的槽位是被测试按下标读的，所以新增只允许有一个，且必须排在最后。
    const [personaState, setPersonaState] = React.useState(EMPTY_PERSONA_UI);
    // 槽位可能拿到 `null`（脚本化的 state 队列没有这一格），所以每次读取都过兜底常量。
    const personaUi = personaState ?? EMPTY_PERSONA_UI;
    const personaList = personaUi.list ?? FALLBACK_PERSONAS;
    /**
     * The label in the sidebar is the persona's own `name`, resolved from whatever the session recorded.
     *
     * `currentMode` is not always an id. A session that has never picked a style persists the literal
     * string `Codex`, and `cgPromptMode` can carry a display name; so matching on `id` alone missed both
     * and fell through to the hardcoded `'Codex'`. That is the "改完提示词就自动变成 Codex" report: the
     * persona was renamed, the stored value no longer matched any id, and the fallback painted `Codex`
     * over the top — the switch had not happened, only the label had.
     *
     * Three lookups, in order of confidence: the id, then the name (a stored display name), then a
     * case-insensitive match on either. Only when all three miss does the list's first row stand in —
     * never a hardcoded literal, because a plugin cannot know what the user called their own persona.
     */
    const personaNamed = value => {
      const needle = String(value ?? '').trim();
      if (!needle) return undefined;
      const exact = personaList.find(item => item.id === needle) ?? personaList.find(item => item.name === needle);
      if (exact) return exact;
      const lower = needle.toLowerCase();
      return personaList.find(item => String(item.id).toLowerCase() === lower)
        ?? personaList.find(item => String(item.name).toLowerCase() === lower);
    };
    const brand = personaNamed(currentMode)?.name ?? personaList[0]?.name ?? 'Codex';
    const patchPersona = change => setPersonaState(prev => ({ ...(prev ?? EMPTY_PERSONA_UI), ...change }));
    // 单个字段的编辑必须基于上一次的值累加，否则一次批处理里的两次输入会互相覆盖（丢字）。
    const patchDraft = (field, value) => setPersonaState(prev => ({
      ...(prev ?? EMPTY_PERSONA_UI), error: '', draft: { ...(prev?.draft ?? {}), [field]: value }
    }));
    /**
     * 数字框的写入。
     *
     * `-`、`1e` 这类还没打完的输入在 `type=number` 里 `value` 是 `''`，而 `validity.badInput` 为真：
     * 把它照抄进草稿等于把用户原来的值抹成「没设置」（之后保存就不会再发这个键，静默丢掉）。
     * 中间态一律不写草稿，等它变成合法数字再说。
     */
    const patchNumberInput = (field, event) => {
      if (event?.target?.validity?.badInput) return;
      patchDraft(field, event.target.value);
    };
    // 只在菜单打开时拉一次，不在每次渲染时拉：人设改动会改变列表，而渲染不会。
    const loadPersonas = async () => {
      try {
        const value = await personaRpc('list');
        const list = Array.isArray(value?.personas) ? value.personas.filter(item => item && typeof item.id === 'string') : [];
        patchPersona({ list: list.length > 0 ? list : FALLBACK_PERSONAS });
      } catch (error) {
        // 宿主没有这条路由时，菜单退回到内置两项 —— 不能让它把整个侧边栏一起拖垮。
        console.warn('人设列表读取失败，暂用内置两项。', error);
        patchPersona({ list: FALLBACK_PERSONAS });
      }
    };
    // 挂载时先拉一次。品牌区显示的人设名来自 personaList[0]，不拉的话首屏用的是 FALLBACK_PERSONAS
    // 的第一项（DeepSeek），要点开菜单才会变成真实选择——就是「显示 DeepSeek、点一下才变回来」。
    // 菜单打开时再拉一次，是因为人设改动会改变列表，而普通渲染不会。
    React.useEffect(() => {
      loadPersonas();
    }, []);
    React.useEffect(() => {
      if (!brandMenu) return undefined;
      loadPersonas();
      return undefined;
    }, [brandMenu]);
    // 宿主依赖的两个 id：`DeepSeek` 是内置行（不接受写入），`codex` 是每次加载重新播种的文件。
    // 后者在宿主的列表里是 `builtin:false`（它来自文件），所以保护判断按 id 做，不按 builtin。
    const PROTECTED_PERSONA_IDS = new Set(['deepseek', 'codex']);
    // 新建时生成 id：它就是磁盘上的文件名，所以只剔掉 Windows 拒绝的字符；重名时加序号，
    // 绝不因为撞名而覆盖别人的文件。id 一旦进入会话就不再改变（改名不动 id）。
    const makePersonaId = name => {
      const cleaned = String(name ?? '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '-').slice(0, 40);
      const base = cleaned === '' || /^\.+$/.test(cleaned) ? 'persona' : cleaned;
      const taken = new Set(personaList.map(item => String(item.id).toLowerCase()));
      if (!taken.has(base.toLowerCase())) return base;
      for (let index = 2; index < 100; index += 1) {
        const next = base + '-' + index;
        if (!taken.has(next.toLowerCase())) return next;
      }
      return base + '-' + Date.now();
    };
    const openPersonaDialog = item => {
      setBrandMenu(false);
      const draft = item
        ? {
          id: item.id, name: String(item.name ?? ''), description: String(item.description ?? ''),
          // `list` 不带正文；只有宿主把 text 也给了，才算已经加载。
          text: typeof item.text === 'string' ? item.text : '', textLoaded: typeof item.text === 'string',
          // 采样参数一律以字符串进草稿，`''` 就是「没设置」。`list` 目前不返回它们，所以这里通常是空。
          // 编辑时**不**用默认值预填：宿主不返回的参数如果被 0 / 0.95 顶上，一保存就会真的写进
          // 用户文件（`personaSamplingPayload` 只把 `''` 当成「不发这个键」），等于静默改设置。
          ...personaSamplingDraft(item), samplingOriginal: personaSamplingDraft(item)
        }
        // 新建不是「没设置」：两个滑块各有一个真实默认值，直接把它预填进草稿（字符串，因为 draft
        // 里一律存字符串），打开弹窗就能拖。`max_tokens` 不预填 —— 空串在那里表示「恢复宿主默认」。
        : {
          id: null, name: '', description: '', text: '', textLoaded: true,
          ...personaSamplingDraft(null),
          temperature: String(SAMPLING_SLIDER.temperature.initial),
          top_p: String(SAMPLING_SLIDER.top_p.initial)
        };
      patchPersona({ dialog: true, draft, error: '' });
      // 补一次单条读取。读不到时 `textLoaded` 保持 false、保存被禁用 —— 因为宿主的写入是整篇
      // 覆盖（`text: input?.text ?? ''`），拿空正文去 update 等于把用户写好的提示词清空。
      if (item?.id && draft.textLoaded === false) {
        personaRpc('read', { id: item.id }).then(value => {
          const text = typeof value?.persona?.text === 'string' ? value.persona.text
            : typeof value?.text === 'string' ? value.text
              : typeof value?.prompt === 'string' ? value.prompt : '';
          // 采样参数按同一次读取带回；宿主的 `read` 目前只回 `{ id, text }`，所以这里通常是 `''`
          // （等于「没设置」）。等宿主开始返回它们，这条链路不用再改。
          const sampling = personaSamplingDraft(value?.persona ?? value);
          // 回填只覆盖**用户还没动过**的字段：`read` 是异步的，等它回来这段时间用户完全可能
          // 已经在温度框里打了字。判据是「当前草稿值仍等于打开时的原值」（`samplingOriginal`），
          // 每项单独算。`samplingOriginal` 仍然整份更新成宿主给的原值 —— 清空逻辑只看它。
          setPersonaState(prev => {
            if (prev?.draft?.id !== item.id) return prev;
            const draft = prev.draft;
            const before = draft.samplingOriginal ?? {};
            const next = {
              textLoaded: true, samplingOriginal: sampling,
              // 正文同理：用户已经写进去的内容不回填覆盖。
              text: String(draft.text ?? '') === '' ? text : draft.text
            };
            for (const key of PERSONA_SAMPLING_FIELDS) {
              const untouched = String(draft[key] ?? '') === String(before[key] ?? '');
              next[key] = untouched ? sampling[key] : draft[key];
            }
            return { ...prev, draft: { ...draft, ...next } };
          });
        }).catch(() => {
          setPersonaState(prev => (prev?.draft?.id === item.id
            ? { ...prev, error: '正文读取失败。宿主的保存是整篇覆盖，用空正文保存会清空它，所以已禁止保存。' }
            : prev));
        });
      }
    };

    const closePersonaDialog = () => {
      if (personaUi.pending) return;
      patchPersona({ dialog: false, draft: null, error: '' });
    };
    // 采样参数的「滑块 + 数字框」。两个控件共用**同一个** draft 值，谁都不另存一份：
    //   拖滑块 → 滑块的字符串直接写进草稿，数字框随即显示同一个值；
    //   数字框 → 原始字符串原样写进草稿（`0.` / `-` 这类中间态一律不规范化），滑块只按数字定位，
    //            `range` 自己会把 0.25 吸到最近的步进点 —— 精确值留在数字框，滑块只是粗略指示器；
    //   清空   → 草稿回到 `''`（= 没设置），滑块**仍然可用**，只是停在 `initial` 上；`initial`
    //            绝不回写草稿，否则「没动过」会变成「已设置」。用户一动滑块，第一个 `onChange`
    //            就把值写回去 —— 清空是显式状态，拖滑块就是显式地重新取值。
    // 两个滑块的 `step` 都是 0.01，数字框是 `any`：`step` 只决定滑块吸附到哪个网格点，网格越细，
    // 数字框里的两位小数越能准确落位 —— 0.1 会让 0.25 在滑块上显示成 0.3，两个控件对不上，
    // 而且用户一碰滑块就把 0.25 覆盖成 0.3。
    // 数字框仍然是 `any`：`step=0.1` 会让 0.25 变成 stepMismatch，而浏览器的表单校验会在
    // `onSubmit` 之前静默拦下提交（点了保存没反应）。表单现在另有 `noValidate` 兜底。
    // 两个滑块各有一个**真实初始值**，`initial` 就是它：新建人设时按它预填草稿（见
    // `openPersonaDialog`），所以滑块永远有可停靠的位置，不存在「没有值就禁用它」这一档。
    // Top P 的初始值取 0.95：`top_p` 必须大于 0，0 会被 `personaSamplingLimitError` 拦下并弹红字；
    // 而 0.95 是思考模式下的有效下界（低于它的值上游一律按 0.95 处理），所以 0.95–1.0 这整段
    // 行程都有实际效果 —— 取 1（= 不限制）等于没设，滑块拖到底也看不出任何变化。
    // `min` 仍是 0、不改：保留完整行程，低于 0.95 的值由上游按 0.95 处理，不报错。
    const SAMPLING_SLIDER = {
      temperature: { min: 0, max: 2, step: 0.01, initial: 0 },
      top_p: { min: 0, max: 1, step: 0.01, initial: 0.95 }
    };
    // 两条静态提示，不随当前档位变化：要判断档位就得把模型状态传进弹窗，改动面比一句提示大得多。
    // 依据：官方 API 文档写明 `temperature`「思考模式下不生效」，`top_p`「有效取值范围为 0.95–1.0，
    // 低于 0.95 的取值会按 0.95 处理」；而宿主适配器默认 `effort="high"`，也就是默认走思考模式。
    const SAMPLING_NOTE = {
      temperature: '思考模式下不生效',
      top_p: '思考模式下低于 0.95 按 0.95 生效'
    };
    /** 滑块的停靠点；`set === false` 表示草稿里没有值（停在 `initial`，不产生值，但滑块仍可拖）。 */
    const samplingSlider = (key, config) => {
      const raw = personaUi.draft?.[key];
      const text = typeof raw === 'string' ? raw.trim()
        : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '';
      const number = text === '' ? Number.NaN : Number(text);
      if (!Number.isFinite(number)) return { set: false, value: config.initial };
      return { set: true, value: Math.min(config.max, Math.max(config.min, number)) };
    };
    const samplingField = key => {
      const config = SAMPLING_SLIDER[key];
      const fieldLabel = PERSONA_SAMPLING_LABELS[key];
      const draftValue = personaUi.draft?.[key] ?? '';
      const slider = samplingSlider(key, config);
      const note = SAMPLING_NOTE[key];
      const hintId = `cg-persona-${key}-hint`;
      const noteId = `cg-persona-${key}-note`;
      // 提示是「补充说明」，不是名字的一部分，所以并进 `aria-describedby`；两个控件都要，
      // 因为「这个参数在当前模式下没效果」对滑块的读者同样成立。
      const describedBy = note ? `${hintId} ${noteId}` : hintId;
      // 一个字段两个控件，所以不能再套一层 `<label>`：`label.control` 只认第一个可标注元素，
      // 点了只会聚焦滑块，数字框会失去可访问名。改成 group + aria-labelledby，两边各一个名字。
      return h('div', { className: 'cg-rename-field', role: 'group', 'aria-labelledby': `cg-persona-${key}-label` },
        h('span', { id: `cg-persona-${key}-label` }, fieldLabel),
        h('div', { className: 'cg-sampling-row' },
          h('input', {
            className: 'cg-sampling-range', type: 'range', min: config.min, max: config.max, step: config.step,
            value: String(slider.value), disabled: personaUi.pending,
            'aria-label': `${fieldLabel}滑块`, 'aria-controls': `cg-persona-${key}-value`,
            'aria-valuetext': slider.set ? String(draftValue) : '未设置',
            title: slider.set ? undefined : '未设置；拖动滑块即写入取值',
            'aria-describedby': note ? noteId : undefined,
            onChange: event => { patchDraft(key, event.target.value); },
            onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); closePersonaDialog(); } }
          }),
          h('input', {
            className: 'cg-rename-input cg-sampling-number', id: `cg-persona-${key}-value`, type: 'number',
            min: config.min, max: config.max, step: 'any', value: draftValue, disabled: personaUi.pending,
            'aria-label': `${fieldLabel}数值`, 'aria-describedby': describedBy, placeholder: '留空',
            onChange: event => { patchNumberInput(key, event); },
            onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); closePersonaDialog(); } }
          })),
        h('span', { className: 'cg-sampling-hint', id: hintId }, `清空数字框表示不设置；这时滑块停在默认位置，拖动即写入取值。滑块按步进 ${config.step} 吸附，也可以直接输入任意小数。`),
        note && h('p', { className: 'cg-rename-note', id: noteId }, note));
    };
    const savePersona = async event => {
      event?.preventDefault?.();
      const draft = personaUi.draft;
      const name = String(draft?.name ?? '').trim();
      if (!draft || personaUi.pending) return;
      // 表单加了 `noValidate`，原生 `required` 不再替我们拦空名（在名称框里按 Enter 也会走到这里），
      // 所以空名必须给一句话 —— 否则又是一次「点了保存什么都没发生」。
      if (name === '') { patchPersona({ error: '人设名称不能为空。' }); return; }
      // 正文没读到时保存会把原文清空，所以这一条比任何按钮态都硬。
      if (draft.id && draft.textLoaded === false) return;
      // 采样参数：留空 = 不发这个键（宿主的 `undefined` 与「缺失」等价，所以清空就是删键）；
      // 填了但不是数字就在本地拦下，别把一个会被静默丢弃的值发出去。
      const sampling = personaSamplingPayload(draft);
      if (sampling.invalid.length > 0) {
        patchPersona({ error: `${sampling.invalid.map(key => PERSONA_SAMPLING_LABELS[key]).join('、')}不是有效数字。` });
        return;
      }
      // 越界的数字同理：原生 `min` / `max` 校验已经被 `noValidate` 关掉，范围只能在这里判。
      const limitError = personaSamplingLimitError(sampling.payload);
      if (limitError) { patchPersona({ error: limitError }); return; }
      patchPersona({ pending: true, error: '' });
      try {
        // `writePersona` 的字段名是 `text`（不是 prompt），且 id 必填 —— 新建时由这里生成。
        const id = draft.id ?? makePersonaId(name);
        await personaRpc(draft.id ? 'update' : 'create', {
          id,
          name,
          description: String(draft.description ?? '').trim(),
          text: String(draft.text ?? ''),
          ...sampling.payload
        });
        patchPersona({ pending: false, dialog: false, draft: null });
        await loadPersonas();
      } catch (error) {
        patchPersona({ pending: false, error: error?.message || String(error) });
      }
    };

    const removePersona = async item => {
      if (typeof window.confirm === 'function' && !window.confirm(`删除人设「${item.name ?? item.id}」？`)) return;
      patchPersona({ pending: true });
      try {
        await personaRpc('delete', { id: item.id });
        patchPersona({ pending: false });
        await loadPersonas();
      } catch (error) {
        patchPersona({ pending: false });
        // 菜单里没有报错的位置，复用模式切换那条提示。
        setModeError(error?.message || String(error));
      }
    };
    // 菜单内容：内置项就是那个单选行；自定义项在行尾多两个动作。`<button>` 里不能再套
    // `<button>`，所以自定义项由「单选行 + 动作区」两个兄弟节点组成，单选行保留 menuitemradio，
    // 两个动作是 menuitem —— 两者都在同一个 Tab 序里，不存在被跳过的问题。
    const personaMenuNodes = personaList.flatMap(item => {
      const name = item.name ?? item.id;
      const option = h(Button, {
        key: item.id, label: name + ' 模式', role: 'menuitemradio', 'aria-checked': currentMode === item.id,
        disabled: modePending || !currentSession || currentSession.running,
        onClick: () => chooseMode(item.id), className: 'cg-brand-option',
        children: [
          h('span', { key: 'copy', className: 'cg-brand-copy' },
            h('span', { key: 'name', className: 'cg-brand-name' }, name),
            item.description ? h('span', { key: 'description', className: 'cg-brand-description' }, item.description) : null),
          currentMode === item.id && h(Icon, { key: 'check', name: 'check', size: 16 })
        ]
      });
      if (item.builtin) return [option];
      // 宿主对 `DeepSeek` 与 `codex` 会以 persona/protected 拒绝删除，所以那两项不摆删除按钮：
      // 一个点下去必然失败的菜单项比没有这一项更糟。
      const removable = !PROTECTED_PERSONA_IDS.has(String(item.id).toLowerCase());
      return [h('div', { key: item.id, className: 'cg-brand-custom' }, option,
        h('span', { className: 'cg-brand-custom-actions' },
          h(Button, { label: '编辑人设 ' + name, icon: 'edit', role: 'menuitem', className: 'cg-brand-custom-action', disabled: personaUi.pending, onClick: () => openPersonaDialog(item) }),
          removable && h(Button, { label: '删除人设 ' + name, icon: 'trash', role: 'menuitem', className: 'cg-brand-custom-action', disabled: personaUi.pending, onClick: () => removePersona(item) })))];
    });
    const personaAddNode = [
      h('div', { key: 'separator', className: 'cg-brand-separator', 'aria-hidden': true }),
      h(Button, {
        key: 'add', label: '增加自定义人设', role: 'menuitem', className: 'cg-brand-option cg-brand-add',
        disabled: modePending, onClick: () => openPersonaDialog(null),
        children: [h('span', { key: 'copy', className: 'cg-brand-copy' }, h('span', { key: 'name', className: 'cg-brand-name' }, '＋ 增加自定义人设'))]
      })
    ];
    const sessionSearchRef = React.useRef(null);
    const matchesQuery = id => {
      const query = sessionQuery.trim().toLowerCase();
      if (query === '') return true;
      const entry = sessions[id];
      return `${entry?.displayTitle ?? ''} ${entry?.title ?? ''} ${id}`.toLowerCase().includes(query);
    };
    const archivedList = archivedIds.filter(id => !purgedIds.has(id) && matchesQuery(id));
    const searchSessions = () => {
      if (searchOpen) { setSessionQuery(''); setSearchOpen(false); return; }
      setRecentOpen(true);
      setSearchOpen(true);
      requestAnimationFrame(() => sessionSearchRef.current?.focus());
    };
    const status = useSessionStatus(s => s);
    const waiting = Array.from(status.values()).filter(s => s.pendingInteraction || s.completionUnread).length;
    // 侧栏自己那个「设置」菜单项：走同一个入口。只点隐藏的账号开关只会拉出账号菜单，
    // 用户还得再点一次「设置」，这一步本来就该省掉。
    const settings = () => { setSettingsMenu(false); openSettingsDialog(); };
    // Rename goes over the same client remote the native sidebar uses: `sessions.using` borrows the
    // Session's binding for the call, and the accepted title updates its title projection, so the
    // row follows the store instead of being patched locally. A refusal arrives as `!ok`.
    const renameSession = (id, title) => ctx.sessions.using(id, { source: 'workspaceOperation' }, reference => reference.binding.session.rename(title));
    const openRename = id => {
      setTaskMenu(null);
      setRenameError('');
      setRenameDraft(sessions[id]?.title || '');
      setRenameTarget(id);
    };
    const closeRename = () => {
      if (renamePending) return;
      setRenameTarget(null);
      setRenameDraft('');
      setRenameError('');
    };
    // The draft is read through two derived values: one keeps the field's own text (spaces included),
    // the other is what the Host would receive. A blank draft never leaves the dialog.
    const renameText = typeof renameDraft === 'string' ? renameDraft : '';
    const renameTrimmed = renameText.trim();
    const submitRename = async event => {
      event?.preventDefault?.();
      if (renameTarget == null || renamePending || renameTrimmed === '') return;
      setRenamePending(true);
      setRenameError('');
      try {
        const result = await renameSession(renameTarget, renameTrimmed);
        if (!result?.ok) throw new Error(result?.error?.message || '重命名失败，请重试。');
        setRenameTarget(null);
        setRenameDraft('');
      } catch (error) {
        setRenameError(error?.message || String(error));
      } finally {
        setRenamePending(false);
      }
    };
    // Same two steps as DSH's own row action: archive, and when the Host refuses because work is
    // still running, confirm and retry with stopActivity.
    const setArchived = async (id, archive) => {
      setTaskMenu(null);
      setNavigationError('');
      if (archive && sessions[id]?.running && !window.confirm('该会话还有正在进行的任务。停止它并归档？')) return;
      try {
        if (archive) await ctx.uiWorkspace.archiveSession(id, sessions[id]?.running ? { stopActivity: true } : {});
        else await ctx.uiWorkspace.unarchiveSession(id);
      } catch (error) {
        if (isMissingSession(error)) { markGhost(id); setNavigationError(missingNotice); return; }
        setNavigationError(error?.message || String(error));
      }
    };
    // A subagent Session cannot be opened by id alone.
    //
    // Observed: clicking one of these rows left the conversation pane showing
    // `历史加载失败：subagent Sessions require their durable parent address (session/agent-busy)`.
    // The host throws exactly that when it receives a plain session address for a row whose origin is
    // 'subagent' (dsh-api-session-controller/lib/index.js:1628) and wants a SubagentAddress instead
    // (dsh-subagent/lib/types/control-types.d.ts:60 → `{ parentSessionId, childSessionId, mode }`).
    // `openSession` has always accepted either ("known Session identity or durable direct-parent subagent
    // address", dsh-client-ui-workspace/lib/types/client/navigation.d.ts:15) — the row's parent was already
    // being read for grouping, it just was not being handed over. `mode: 'unknown'` is the declared variant
    // for a caller that does not know whether the child is continuable.
    const subagentTarget = id => {
      const entry = sessions[id];
      if (entry?.origin !== 'subagent') return undefined;
      const parent = entry.parentId ?? entry.parentSessionId;
      if (typeof parent !== 'string' || parent === '' || parent === id) return undefined;
      return { parentSessionId: parent, childSessionId: id, mode: 'unknown' };
    };
    // Opening a phantom row fails the same way the archive action does, so the failure teaches the
    // list the same lesson: the row is hidden instead of refusing again on the next click.
    const openSession = id => {
      setSelectedTask(id);
      Promise.resolve()
        .then(() => ctx.uiWorkspace.openSession(subagentTarget(id) ?? id))
        .catch(error => {
          if (isMissingSession(error)) { markGhost(id); setNavigationError(missingNotice); return; }
          setNavigationError(error?.message || String(error));
        });
    };
    // Pinning is DSH's own workspace call, so the 置顶 group, the ordering and the persisted
    // `pinnedSessionIds` all stay the host's business; this side only offers the action.
    const setPinned = async (id, pin) => {
      setTaskMenu(null);
      setNavigationError('');
      try {
        if (pin) await ctx.uiWorkspace.pinSession(id);
        else await ctx.uiWorkspace.unpinSession(id);
      } catch (error) {
        setNavigationError(error?.message || String(error));
      }
    };
    // Deleting a Session is out-of-band maintenance: DSH has no deletion seam, so the Host half
    // removes the log directory of an archived Session and this side only asks. The row is offered
    // on archived Sessions alone, disappears the moment the Host confirms, and the list itself drops
    // it on the next load because the log is what the list is built from.
    // No confirmation dialog: the delete entry only exists on already-archived Sessions and the owner
    // asked for the extra NativeDialog step gone (2.1.0). Failures still surface through `navigationError`.
    const purgeSession = async id => {
      setTaskMenu(null);
      setNavigationError('');
      try {
        const result = await ctx.connection.rpc.call('/api', 'dsh-codex-ui/purge-session', { sessionId: id });
        if (!result?.ok) throw new Error(result?.error?.message || '删除失败，请重试。');
        // No success notice: the row leaves the list, which is the feedback. A confirmation banner was
        // removed at the owner's request; failures still surface through `navigationError`.
        setPurgedIds(prev => { const next = new Set(prev); next.add(id); return next; });
      } catch (error) {
        const message = error?.message || String(error);
        // The route lives in the Host half, so it only exists once this build has been loaded there:
        // a 404 means the running Host predates the endpoint, not that the Session is undeletable.
        setNavigationError(/not[ -]?found|404/i.test(message) ? '删除服务未加载：请重启 DSH 后再试。' : message);
      }
    };
    // Batch delete for the archived multi-select. One request per id, run serially on purpose: the
    // Host half does readdir + rmSync per Session, and firing 160 of those at once is how a delete
    // queue turns into a stalled event loop. The counter is the progress the user sees.
    const purgeArchivedSelection = async ids => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      setNavigationError('');
      setArchiveBulk(`正在删除 0/${ids.length}`);
      let done = 0;
      let failed = 0;
      let firstError = '';
      for (const id of ids) {
        try {
          const result = await ctx.connection.rpc.call('/api', 'dsh-codex-ui/purge-session', { sessionId: id });
          if (!result?.ok) throw new Error(result?.error?.message || '删除失败，请重试。');
          setPurgedIds(prev => { const next = new Set(prev); next.add(id); return next; });
        } catch (error) {
          failed += 1;
          firstError ||= error?.message || String(error);
        }
        done += 1;
        setArchiveBulk(`正在删除 ${done}/${ids.length}${failed ? `（失败 ${failed}）` : ''}`);
      }
      setArchiveBulk(`已删除 ${done - failed}/${ids.length}${failed ? `，${failed} 个失败：${firstError}` : ''}`);
      setArchivedSelected(new Set());
    };
    // One disclosure per child group. The header names the group and carries its own count; a group
    // longer than one page renders only that page plus the remaining count, which is what keeps a
    // Session with dozens of subagents from painting dozens of rows.
    const CHILD_GROUP_PAGE = 8;
    const renderGroup = (parentId, kind, ids, depth) => {
      if (ids.length === 0) return [];
      // Compact by default: while the row's panel is closed nothing but the row's own chevron is
      // painted, so a Session with dozens of children costs exactly one line.
      if (!childPanelOpen(parentId)) return [];
      const open = groupOpen[kind].has(parentId);
      const key = `${parentId}:${kind}`;
      const label = kind === 'subagents' ? '子代理' : '分支';
      const caption = `${open ? '收起' : '展开'}${label}（${ids.length}）`;
      const indent = { '--cg-branch-indent': ((depth + 1) * 12) + 'px' };
      const header = h('button', {
        key, type: 'button', className: 'cg-group-toggle', 'data-group': kind, 'data-count': ids.length,
        'aria-expanded': open, 'aria-label': caption, title: caption, style: indent,
        onClick: event => { event.stopPropagation(); toggleGroup(kind, parentId); }
      }, h(Icon, { name: 'chevron', size: 12 }), h('span', { className: 'cg-group-label' }, label), h('span', { className: 'cg-group-badge' }, String(ids.length)));
      if (!open) return [header];
      const shown = groupShowAll.has(key) ? ids : ids.slice(0, CHILD_GROUP_PAGE);
      const hidden = ids.length - shown.length;
      return [
        header,
        ...shown.map(child => renderTask(child, depth + 1)),
        hidden > 0 && h('button', {
          key: `${key}:more`, type: 'button', className: 'cg-group-more', style: indent,
          onClick: event => { event.stopPropagation(); revealGroup(key); }
        }, `还有 ${hidden} 条`)
      ];
    };
    // Returns an array: a row, its two disclosure headers, and the child rows of whichever group the
    // user opened (recursively). A row with children is no longer one anonymous "branch".
    const renderTask = (id, depth = 0) => {
      const entry = sessions[id];
      if (purgedIds.has(id)) return null;
      // A phantom row is hidden, but an archived one stays reachable on purpose: the archive list is
      // the only place its id can still be removed from the archive set.
      if (ghostIds.has(id) && !archivedSet.has(id)) return null;
      // A row with no store entry is legitimate only while it is archived: the registry still lists
      // the id (its log may already be gone), and dropping the row would strand it forever.
      const isArchived = archivedSet.has(id);
      if (entry === undefined && !isArchived) return null;
      const openable = entry !== undefined;
      // The store carries its own display name (`displayTitle`: title → cwd → id). Reading only
      // `title` left every unnamed Session — most subagent rows — falling through to the archive
      // wording, so archived-looking labels appeared on rows that were never archived.
      // The fallback used to be `String(id).slice(0, 8)`, which on a `session-<uuid>` id yields the
      // literal "session-" for every row — a dozen archived Sessions all read `已归档会话 session-`,
      // distinguishable by nothing. Strip the prefix first so the shown part is the uuid.
      const shortId = String(id).replace(/^session-/, '').slice(0, 8);
      const title = openable
        // A blank Session has no title yet, and `displayTitle` would then show the working directory's
        // basename (title → cwd → id) — a new conversation read as "default-workspace". The host's own
        // sidebar labels blank rows with the localized New Session string; match that rule.
        ? entry.blank === true
          ? '新会话'
          : entry.displayTitle || entry.title || shortId
        : `已归档会话 ${shortId}`;
      const archiveLabel = isArchived ? '取消归档' : '归档会话';
      const isPinned = openable && pins.includes(id);
      const groups = openable ? childGroupsOf.get(id) : undefined;
      const childCount = (groups?.subagents.length ?? 0) + (groups?.branches.length ?? 0);
      const panelOpen = openable && childPanelOpen(id);
      // Mirror the host's own derivation instead of inventing a second one: a pending interaction
      // outranks running, a running child counts as the parent running, and the completion edge is
      // only consulted when nothing is active.
      //
      // Only agent-spawned Sessions are skipped, and the test for that is `origin`, not `depth`.
      // Depth is a rendering level rather than an identity: `renderGroup` passes the same value for
      // both child groups, and the pinned and archived lists render at depth 0 whatever the row is —
      // so a depth test would quietly mark agent rows in those two lists. `origin` is the field the
      // grouping above already keys on, so the two can never drift apart.
      const statusOf = key => (typeof status?.get === 'function' ? status.get(key) : status?.[key]);
      const own = statusOf(id);
      const runningChildren = (groups?.subagents ?? [])
        .filter(child => (statusOf(child)?.running ?? sessions[child]?.running) === true).length;
      const state = entry?.origin === 'subagent' || !openable
        ? null
        : own?.pendingInteraction !== undefined
          ? 'waiting'
          : (own?.running ?? entry?.running) === true || runningChildren > 0
            ? 'running'
            : own?.completionUnread === true
              ? 'done'
              : null;
      const row = h('div', {
        key: id,
        'data-session-id': id,
        className: 'cg-task-row' + (depth > 0 ? ' cg-task-child' : '') + (childCount > 0 ? ' cg-task-with-children' : '') + (isArchived ? ' cg-task-archived' : '') + (state !== null ? ' cg-task-stated' : '') + ((currentSession?.id ?? selectedTask) === id ? ' cg-task-current' : ''),
        style: depth > 0 ? { '--cg-branch-indent': (depth * 12) + 'px' } : undefined,
        onMouseEnter: event => { const rect = event.currentTarget.getBoundingClientRect(); setTaskHover({ title, right: rect.right, top: rect.top }); },
        onMouseLeave: () => setTaskHover(null)
      },
        // The archived checkbox comes first so the hit target sits where every other selection UI puts
        // it. `stopPropagation` keeps the row's own click (open Session) from firing with it.
        isArchived && h('input', {
          key: 'pick',
          type: 'checkbox',
          className: 'cg-archived-check',
          'aria-label': '选择 ' + title,
          checked: archivedSelected.has(id),
          onChange: event => {
            event.stopPropagation();
            const on = event.target.checked;
            setArchivedSelected(prev => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
          },
          onClick: event => event.stopPropagation(),
        }),
        // One chevron, no permanent headers: the panel below carries the two group names and their
        // counts once it is open. The counts live on the button for tests and screen readers.
        childCount > 0 && h('button', {
          key: 'children', type: 'button', className: 'cg-children-toggle',
          'data-count': childCount, 'data-subagents': groups?.subagents.length ?? 0, 'data-branches': groups?.branches.length ?? 0,
          'aria-expanded': panelOpen, 'aria-label': `${panelOpen ? '收起' : '展开'}子会话（${childCount}）`,
          title: `${panelOpen ? '收起' : '展开'}子会话（子代理 ${groups?.subagents.length ?? 0} / 分支 ${groups?.branches.length ?? 0}）`,
          onClick: event => { event.stopPropagation(); toggleChildren(id); }
        }, h(Icon, { name: 'chevron', size: 11 })),
        state !== null && h('span', { key: 'state', className: 'cg-task-status', 'data-state': state, 'aria-hidden': 'true' }),
        h(Button, { label: title, className: 'cg-pinned-row', disabled: !openable, onClick: () => { if (!openable) return; openSession(id); }, children: title }),
        h('div', { className: 'cg-task-actions' },
          openable && h(Button, { icon: 'pin', active: isPinned, label: (isPinned ? '取消置顶 ' : '置顶 ') + title, className: isPinned ? 'cg-pin-action cg-pin-on' : 'cg-pin-action', onClick: () => setPinned(id, !isPinned) }),
          h(Button, { icon: isArchived ? 'unarchive' : 'archive', label: archiveLabel + ' ' + title, onClick: () => setArchived(id, !isArchived) }),
          // Only an archived Session offers deletion: it is the user's own "done with this" signal,
          // and DSH stops an archived Session from running another step.
          isArchived && h(Button, { icon: 'trash', label: '删除会话日志 ' + title, className: 'cg-purge-action', onClick: () => purgeSession(id) }),
          h(Button, { icon: 'more', label: title + ' 的操作', 'data-menu-trigger': true, onClick: () => setTaskMenu(taskMenu === id ? null : id) })),
        taskMenu === id && h('div', { className: 'cg-task-menu' },
          openable && h(Button, { label: '打开任务', children: '打开任务', onClick: () => { setTaskMenu(null); openSession(id); } }),
          openable && h(Button, { label: (isPinned ? '取消置顶 ' : '置顶 ') + title, icon: 'pin', children: isPinned ? '取消置顶' : '置顶会话', onClick: () => setPinned(id, !isPinned) }),
          openable && h(Button, { label: '重命名 ' + title, icon: 'edit', children: '重命名', onClick: () => openRename(id) }),
          h(Button, { label: archiveLabel, icon: isArchived ? 'unarchive' : 'archive', children: archiveLabel, onClick: () => setArchived(id, !isArchived) }),
          isArchived && h(Button, { label: '删除会话日志 ' + title, icon: 'trash', className: 'cg-purge-action', children: '删除会话日志', onClick: () => purgeSession(id) })));
      return [
        row,
        ...renderGroup(id, 'subagents', groups?.subagents ?? [], depth),
        ...renderGroup(id, 'branches', groups?.branches ?? [], depth)
      ];
    };
    const recentIds = Object.keys(sessions).filter(id => sessions[id]?.origin !== 'subagent' && !pins.includes(id) && !archivedSet.has(id) && !isBranchChild(id) && !purgedIds.has(id) && !ghostIds.has(id) && matchesQuery(id)).sort((a, b) => stamp(sessions[b]) - stamp(sessions[a]));
    return h('div', { className: `cg-sidebar${collapsed ? ' cg-collapsed' : ''}` },
      h('nav', { className: 'cg-rail', 'aria-label': '应用导航' },
        // 「全部快捷方式」常驻最上面。它是自定义入口唯一的发现路径：藏在「装不下才出现」后面，
        // 就意味着没装满三条时用户永远看不到它，也不会知道这功能存在——他一开始就抱怨过侧栏是空的。
        h('div', { className: 'cg-rail-more' },
          rail('more', `全部快捷方式（${railItems.length}/${RAIL_SLOTS}）`, () => setRailMenu(!railMenu), railMenu),
          railMenu && h('div', { className: 'cg-rail-menu', role: 'dialog', 'aria-label': '全部快捷方式' },
            h('div', { className: 'cg-rail-menu-head' },
              h('p', { className: 'cg-rail-menu-title' }, `侧边栏自定义上限 ${railShown.length}/${RAIL_SLOTS}`),
              h('button', {
                type: 'button',
                className: 'cg-rail-menu-help-toggle' + (railHelp ? ' cg-on' : ''),
                'aria-expanded': railHelp,
                'aria-label': '侧边栏快捷项说明',
                title: '说明',
                onClick: () => setRailHelp(!railHelp)
              }, h(Icon, { name: 'help' }))
            ),
            railHelp && h('div', { className: 'cg-rail-menu-help' },
              h('p', null, '侧边栏上限为三个，本信息框包含所有新增的侧边栏按钮。点右边的「隐藏 / 显示」能把任意一条换上或撤下。'),
              h('p', null, '想要新的，对 Agent 说一句「帮我增加侧边栏」，Agent 会自动阅读文档说明书，再回来问你。')
            ),
            railItems.length === 0 && h('p', { className: 'cg-rail-menu-empty' }, '对 Agent 说一句「往侧栏加个 XX」，装好的就会出现在这里。'),
            ...railItems.map(entry => h('div', { key: entry.id, className: 'cg-rail-menu-row' },
              h('button', { type: 'button', className: 'cg-rail-menu-open', onClick: () => { setRailMenu(false); openRailEntry(entry); } },
                railGlyph(entry, false),
                h('span', { className: 'cg-rail-menu-name' }, entry.label),
                h('span', { className: 'cg-rail-menu-kind' }, railKind(entry))),
              h('button', {
                type: 'button',
                className: 'cg-rail-menu-pin' + (entry.pinned === true ? ' cg-on' : ''),
                'aria-pressed': entry.pinned === true,
                onClick: () => setRailPinned(entry, entry.pinned !== true)
              }, entry.pinned === true ? '隐藏' : '显示'),
              h('button', {
                type: 'button',
                className: 'cg-rail-menu-remove' + (railPendingRemove === entry.id ? ' cg-armed' : ''),
                'aria-label': railPendingRemove === entry.id ? `确认删除 ${entry.label}` : `删除 ${entry.label}`,
                title: railPendingRemove === entry.id ? '再点一次就删掉' : '删除',
                onClick: () => removeRailEntry(entry)
              }, railPendingRemove === entry.id ? '删?' : h(Icon, { name: 'trash' }))
            )),
            railNotice !== '' && h('p', { className: 'cg-rail-menu-note', role: 'status' }, railNotice)
          )
        ),
        rail('home', '主页', () => { setLocalSection('home'); go(null); if (collapsed) ctx.layout.toggleSidebar(); }),
        rail('files', '用量', () => openExternal('https://platform.deepseek.com/usage')),
        rail('clock', '定时任务', () => go('cg-schedules')),
        rail('at', '插件', () => go('plugins')),
        // 第 5 个 rail 按钮：Skill 管理。图标用 Icon 里已有的 'external'（paths.external，方框 + 右上箭头，与需求给的图一致）。
        // 点击调用 go('plugins')，与上一行「插件」按钮完全相同的跳转方式。
        // 依据：DSH 侧没有独立的 skill 主面板，设置侧的分页 id 只有 general / models / plugins / subagent 等
        //（核对 @deepseek-ai/dsh-client-ui-settings-* 与 dsh-client-ui-plugin-manager 的 PANEL_ID），其中没有 skill 分页；
        // skill 在 DSH 里以 dsh-skill、dsh-experimental-badge-skill-bundle 这类插件包存在，因此落到插件面板。
        // 这是推断而非确认：若日后出现真正的 skill 面板，把这里的 go('plugins') 换成该 panel id 即可。
        rail('external', '技能', () => go('cg-skills')),
        // 其它插件 / 配置文件登记的条目，排在五个内置按钮之后、rail-bottom 之前，最多三个。
        // 高亮只对 panel 目标判定：url 和 section 没有「当前面板」这个概念，强行高亮会误导。
        ...railShown.map(entry => rail(
          entry.iconPath !== '' ? entry.id : entry.icon,
          entry.label,
          () => openRailEntry(entry),
          entry.panel !== '' && panel === entry.panel,
          entry
        )),
        // 正在离场的条目：还占着原来的位置播淡出，点了也没反应。
        ...railGhosts.map(entry => rail(
          entry.iconPath !== '' ? entry.id : entry.icon,
          entry.label,
          () => {},
          false,
          entry,
          'cg-rail-ghost'
        )),
        // 「全部快捷方式」按钮已上移到 rail 最顶端（home 之前）并改为常驻，这里不再重复渲染。
        h('div', { className: 'cg-rail-bottom' },
          h('div', { className: 'cg-settings', ref: settingsAnchor },
            h(Button, { icon: 'settings', label: '设置菜单', className: 'cg-settings-trigger', 'aria-haspopup': 'menu', 'aria-expanded': settingsMenu, onClick: () => setSettingsMenu(!settingsMenu) }),
            h('div', { className: 'cg-native-settings', hidden: true }, renderSlot('sidebar.settings', { wide: false })),
            settingsMenu && h('div', { className: 'cg-account-menu', role: 'menu', 'aria-label': '设置菜单' },
              h('div', { className: 'cg-account-summary', role: 'status', 'aria-live': 'polite' }, h('span', { className: 'cg-account-avatar', 'aria-hidden': true }, 'D'), h('div', null, h('div', { className: 'cg-account-title' }, 'DeepSeek API'), h('div', { className: 'cg-account-balance' }, balanceLoading ? '正在读取余额…' : balance?.ok ? balance.value.balances.map(row => `${row.currency === 'CNY' ? '¥' : '$'}${row.total}`).join(' / ') : balance?.error.message || '余额待查询'), h('div', { className: 'cg-account-caption' }, balance?.ok ? balance.value.available ? '可用余额' : '余额不足' : 'API 余额'))),
              h('div', { className: 'cg-account-separator' }),
              h(Button, { icon: 'refresh', label: '刷新余额', role: 'menuitem', disabled: balanceLoading, onClick: refreshBalance, children: ['刷新余额', h('span', { key: 'hint', className: 'cg-account-hint' }, balanceLoading ? '读取中' : '')] }),
              h(Button, { icon: 'external', label: 'API 控制台', role: 'menuitem', onClick: () => { setSettingsMenu(false); openExternal('https://platform.deepseek.com/usage'); }, children: 'API 控制台' }),
              h(Button, { icon: 'settings', label: '设置', role: 'menuitem', onClick: settings, children: '设置' }),
              h(Button, { icon: 'clock', label: '峰谷指示：' + peakModeLabel(peakReadMode()), role: 'menuitem', 'data-peak-trigger': true, onClick: () => { const next = peakReadMode() === 'auto' ? 'on' : peakReadMode() === 'on' ? 'off' : 'auto'; try { window.localStorage?.setItem?.('dsh-codex-ui/peak-badge', next); } catch { /* ignore */ } try { window.dispatchEvent?.(new Event('dsh-codex-ui:peak-mode')); } catch { /* ignore */ } setSettingsMenu(false); }, children: ['峰谷指示', h('span', { key: 'hint', className: 'cg-account-hint' }, peakModeLabel(peakReadMode()))] }),
              h('div', { className: 'cg-account-separator' }),
              h(Button, { icon: 'files', label: '新对话图标', role: 'menuitem', 'data-mark-trigger': true, onClick: () => { setSettingsMenu(false); setHeroMarkOpen(true); }, children: '新对话图标' }),
              h(Button, { icon: 'at', label: '插件', role: 'menuitem', onClick: () => { setSettingsMenu(false); go('plugins'); }, children: '插件' }),
              h(Button, { icon: 'help', label: '帮助', role: 'menuitem', onClick: () => { setSettingsMenu(false); openExternal('https://github.com/jiangshen275-beep/DSH-Codex-ui-2-#readme'); }, children: ['帮助', h('span', { key: 'arrow', className: 'cg-account-hint' }, h(Icon, { name: 'chevron', size: 12 }))] }),
              // The model-name sync state lives here, not in the effort panel: it is a diagnostic, and
              // the reasoning control is a place the eye rests. Nothing about it is needed to pick an
              // effort level, so it stays out of the way until the settings menu is opened.
              h('p', { className: 'cg-account-sync', 'data-phase': sync.phase }, syncLine(sync))))),
        heroMarkOpen && h(HeroMarkPicker, { onClose: () => setHeroMarkOpen(false) }),
        // The rail's "更多" menu was removed at the owner's request. `null` keeps this slot so the
        // parentheses around it stay exactly as they were.
        null),
      scheduled ? h('div', { className: 'cg-navigation cg-schedule-nav' }, h('div', { className: 'cg-brand-row' }, h('strong', null, '定时任务'), h(Button, { icon: 'search', label: '搜索任务', onClick: () => document.querySelector('.cg-task-search')?.focus() })), h(Button, { icon: 'plus', label: '新建任务', onClick: () => window.dispatchEvent(new CustomEvent('cg-new-task')), children: '新建任务' }), h('div', { className: 'cg-task-upcoming' }, '即将执行'), h('p', { className: 'cg-task-empty' }, '暂无已安排的任务'), h('p', { className: 'cg-task-empty' }, '草稿可在右侧查看')) : h('div', { className: 'cg-navigation' },
        h('div', { className: 'cg-brand-row' },
          h('div', { className: 'cg-brand-anchor' }, h(Button, { label: '切换模式', className: 'cg-brand', 'data-menu-trigger': true, 'aria-haspopup': 'menu', 'aria-expanded': brandMenu, onClick: () => setBrandMenu(!brandMenu), children: [brand, h(Icon, { key: 'down', name: 'down', size: 12 })] }), brandMenu && h('div', { className: 'cg-brand-menu', role: 'menu', 'aria-label': '回复模式', 'aria-busy': modePending }, ...personaMenuNodes, ...personaAddNode, (modePending || currentSession?.running || !currentSession) && h('p', { className: 'cg-mode-status', role: 'status' }, modePending ? '正在保存…' : currentSession?.running ? '回复完成后可切换模式' : '新建或打开会话后可切换'))),
          h('div', { className: 'cg-brand-actions' }, h(Button, { icon: 'bell', label: '会话通知', onClick: () => setNotice(!notice) }), h(Button, { icon: 'search', label: '搜索会话', onClick: searchSessions }))),
        notice && h('div', { className: 'cg-notice', role: 'status' }, waiting ? `${waiting} 个会话有待确认请求或新的完成消息。` : '暂无待确认请求或新的完成消息。'),
        modeError && h('div', { className: 'cg-notice', role: 'alert' }, modeError),
        // 宿主的 uiWorkspace.startSession() 走 connectWorkspace → reuseOrCreateBlank，会先找当前工作区里
        // blank:true 的会话直接复用（dsh-client-ui-workspace/lib/client.js:789 的 reuseOrCreateBlank），
        // 于是「新聊天」在已有空会话时只是跳过去。这里改成先显式 create 一个新会话，再把它挂到主视图；
        // create 失败（没有工作区、权限不足等）才退回宿主原来的行为。
        h(Button, {
          icon: 'edit',
          label: '新聊天',
          className: 'cg-new',
          onClick: async () => {
            const ui = ctx.uiWorkspace;
            try {
              const snapshot = ui?.workspaces?.list?.getSnapshot?.();
              const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
              const current = ui?.mainReference?.sessionId;
              const owner = current === undefined ? undefined : items.find(item => item.sessionIds?.includes(current));
              const target = owner ?? items.find(item => (item.sessionIds?.length ?? 0) > 0) ?? items[0];
              const workspaceId = target?.workspaceId;
              if (!workspaceId) throw new Error('no workspace');
              const sessionId = await ctx.sessions.create({ workspaceId });
              const signal = AbortSignal.any
                ? AbortSignal.any([ctx.layout.beginNavigation()])
                : new AbortController().signal;
              ui.replaceMain(sessionId, signal, 'reveal');
            } catch (error) {
              console.warn('[dsh-codex-ui] create session failed, falling back to startSession:', error);
              ui?.startSession?.();
            }
          },
          children: '新聊天',
        }),
        h('div', { className: 'cg-browse' },
          searchOpen && h('div', { className: 'cg-session-search', role: 'search' },
            h('input', {
              ref: sessionSearchRef, className: 'cg-session-search-input', type: 'search', value: sessionQuery,
              placeholder: '搜索会话…', 'aria-label': '搜索会话', autoComplete: 'off',
              onChange: event => setSessionQuery(event.target.value),
              onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); setSessionQuery(''); setSearchOpen(false); } }
            }),
            sessionQuery !== '' && recentIds.length === 0 && pins.filter(matchesQuery).length === 0 && archivedList.length === 0
              && h('p', { className: 'cg-session-search-empty', role: 'status' }, '没有匹配的会话。')),
          pins.some(id => sessions[id] && !archivedSet.has(id)) && h(Button, { label: '置顶', className: 'cg-section-toggle cg-pins-toggle', 'aria-expanded': pinsOpen, onClick: () => setPinsOpen(!pinsOpen), children: ['置顶', h('span', { key: 'arrow', className: 'cg-disclosure-arrow', 'aria-hidden': true }, h(Icon, { name: 'chevron', size: 13 }))] }),
          ...(pinsOpen ? pins.filter(id => sessions[id] && !archivedSet.has(id) && !isBranchChild(id) && !purgedIds.has(id) && !ghostIds.has(id) && matchesQuery(id)).map(id => renderTask(id)) : []),
          h(Button, { label: '项目', className: 'cg-section-toggle', 'aria-expanded': projectsOpen, onClick: () => setProjectsOpen(!projectsOpen), children: ['项目', h('span', { key: 'arrow', className: 'cg-disclosure-arrow', 'aria-hidden': true }, h(Icon, { name: 'chevron', size: 13 }))] }),
          projectsOpen && h('div', { className: 'cg-projects' }, ...workspaces.items.map(project => { const title = !project.title || project.title === 'default-workspace' ? '默认工作区' : project.title; return h(Button, { key: project.workspaceId, icon: 'folder', label: title, onClick: () => ctx.uiWorkspace.openWorkspace(project.workspaceId).catch(error => setNavigationError(error.message || String(error))), children: title }); }), h(Button, { icon: 'plus', label: '添加项目', onClick: () => document.querySelector('.cg-workspaces [class*="headerActions"] button[class*="iconButton"]')?.click(), children: '添加项目' })),
          h(Button, { label: '会话', className: 'cg-section-toggle', 'aria-expanded': recentOpen, onClick: () => setRecentOpen(!recentOpen), children: ['会话', h('span', { key: 'arrow', className: 'cg-disclosure-arrow', 'aria-hidden': true }, h(Icon, { name: 'chevron', size: 13 }))] }),
          ...(recentOpen ? recentIds.map(id => renderTask(id)) : []),
          archivedList.length > 0 && h(Button, { label: '已归档', className: 'cg-section-toggle', 'aria-expanded': archivedOpen, onClick: () => setArchivedOpen(!archivedOpen), children: ['已归档', h('span', { key: 'arrow', className: 'cg-disclosure-arrow', 'aria-hidden': true }, h(Icon, { name: 'chevron', size: 13 }))] }),
          // Archive toolbar, only while the group is open. 全选 / 取消全选 flips the whole visible list
          // (it is already filtered by the search query, so "all" means "all I can see").
          archivedOpen && archivedList.length > 0 && h('div', { className: 'cg-archived-tools' },
            h(Button, {
              label: archivedList.every(id => archivedSelected.has(id)) ? '取消全选' : '全选',
              className: 'cg-archived-all',
              onClick: () => setArchivedSelected(archivedList.every(id => archivedSelected.has(id)) ? new Set() : new Set(archivedList)),
              children: archivedList.every(id => archivedSelected.has(id)) ? '取消全选' : '全选',
            }),
            archivedSelected.size > 0 && h(Button, {
              icon: 'trash',
              label: `删除选中的 ${archivedSelected.size} 个会话日志`,
              className: 'cg-archived-purge',
              onClick: () => purgeArchivedSelection(archivedList.filter(id => archivedSelected.has(id))),
              children: `删除 ${archivedSelected.size} 个`,
            }),
            archiveBulk && h('span', { className: 'cg-archived-bulk', role: 'status' }, archiveBulk)),
          ...(archivedOpen ? archivedList.map(id => renderTask(id)) : []),
          navigationError && h('div', { className: 'cg-notice', role: 'status' }, navigationError)),
        h('div', { className: 'cg-workspaces', hidden: true }, renderSlot('sidebar.workspaces', { wide: !collapsed, expandSidebar: () => ctx.layout.toggleSidebar() })),
        h('div', { className: 'cg-footer' }, renderSlot('sidebar.footer.action', { wide: !collapsed }))),
        renameTarget != null && h('div', { className: 'cg-rename-backdrop', onPointerDown: closeRename },
          h('form', {
            className: 'cg-rename-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': '重命名会话',
            onSubmit: submitRename, onPointerDown: event => event.stopPropagation()
          },
            h('h2', null, '重命名会话'),
            h('input', {
              className: 'cg-rename-input', value: renameText, autoFocus: true, disabled: renamePending, 'aria-label': '会话名称',
              onChange: event => { setRenameDraft(event.target.value); setRenameError(''); },
              onKeyDown: event => {
                if (event.key === 'Escape') { event.stopPropagation(); closeRename(); return; }
                // Enter inside an IME composition confirms a candidate, not the dialog.
                if (event.key === 'Enter' && (event.isComposing || event.nativeEvent?.isComposing)) event.preventDefault();
              }
            }),
            renameError && h('p', { className: 'cg-rename-error', role: 'alert' }, renameError),
            h('div', { className: 'cg-rename-actions' },
              h('button', { type: 'button', className: 'cg-rename-cancel', disabled: renamePending, onClick: closeRename }, '取消'),
              h('button', { type: 'submit', className: 'cg-rename-save', disabled: renamePending || renameTrimmed === '' }, renamePending ? '保存中…' : '保存')))),
        // 人设编辑器：结构照抄上面的重命名弹窗 —— 背板关闭、Escape、自动聚焦第一个输入、取消/保存。
        // 字段换成名称 / 描述 / 正文；正文沿用同一个 .cg-rename-input，只补一条可拉伸的规则。
        personaUi.dialog && h('div', { className: 'cg-rename-backdrop', onPointerDown: closePersonaDialog },
          h('form', {
            className: 'cg-rename-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': '自定义人设',
            // 关掉浏览器对整张表的原生校验：只要还有 `min` / `max` / `step`，它随时会在 `onSubmit`
            // 之前把提交吞掉，而用户看不到任何原因。范围检查已经在 `savePersona` 里用红字接住。
            noValidate: true,
            onSubmit: savePersona, onPointerDown: event => event.stopPropagation()
          },
            h('h2', null, personaUi.draft?.id ? '编辑人设' : '增加自定义人设'),
            h('label', { className: 'cg-rename-field' }, h('span', null, '名称'),
              h('input', {
                className: 'cg-rename-input', value: personaUi.draft?.name ?? '', autoFocus: true, required: true,
                disabled: personaUi.pending, 'aria-label': '人设名称', placeholder: '例如：严谨审阅',
                onChange: event => { patchDraft('name', event.target.value); },
                onKeyDown: event => {
                  if (event.key === 'Escape') { event.stopPropagation(); closePersonaDialog(); return; }
                  // 输入法里回车是选词，不是提交。
                  if (event.key === 'Enter' && (event.isComposing || event.nativeEvent?.isComposing)) event.preventDefault();
                }
              })),
            h('label', { className: 'cg-rename-field' }, h('span', null, '描述'),
              h('input', {
                className: 'cg-rename-input', value: personaUi.draft?.description ?? '', disabled: personaUi.pending,
                'aria-label': '人设描述', placeholder: '菜单里那一行小字，可留空',
                onChange: event => { patchDraft('description', event.target.value); },
                onKeyDown: event => {
                  if (event.key === 'Escape') { event.stopPropagation(); closePersonaDialog(); return; }
                  if (event.key === 'Enter' && (event.isComposing || event.nativeEvent?.isComposing)) event.preventDefault();
                }
              })),
            h('label', { className: 'cg-rename-field' }, h('span', null, '提示词正文'),
              h('textarea', {
                className: 'cg-rename-input cg-rename-textarea', rows: 9, value: personaUi.draft?.text ?? '', disabled: personaUi.pending,
                'aria-label': '人设提示词正文', placeholder: '发送给模型的完整提示词',
                onChange: event => { patchDraft('text', event.target.value); },
                onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); closePersonaDialog(); } }
              })),
            // 采样参数三件套。温度和 Top P 用「滑块 + 数字框」（见 samplingField）：两个控件共用
            // 同一个草稿值，`onChange` 只把原始字符串写进草稿，转换留到保存。
            samplingField('temperature'),
            samplingField('top_p'),
            // 宿主在 `max_tokens` 缺省时会重新填上 256000，所以清空这个框是「恢复默认」，不是「不设」。
            h('label', { className: 'cg-rename-field' }, h('span', null, '最大输出'),
              h('input', {
                className: 'cg-rename-input', type: 'number', min: 1, step: 1,
                value: personaUi.draft?.max_tokens ?? '', disabled: personaUi.pending,
                'aria-label': '人设最大输出 token', placeholder: '默认 256000',
                onChange: event => { patchNumberInput('max_tokens', event); },
                onKeyDown: event => { if (event.key === 'Escape') { event.stopPropagation(); closePersonaDialog(); } }
              })),
            personaUi.draft?.id && personaUi.draft?.textLoaded === false && !personaUi.error && h('p', { className: 'cg-rename-note', role: 'status' }, '正在读取原有正文…（读到之前不能保存，避免把它清空）'),
            personaUi.error && h('p', { className: 'cg-rename-error', role: 'alert' }, personaUi.error),
            h('div', { className: 'cg-rename-actions' },
              h('button', { type: 'button', className: 'cg-rename-cancel', disabled: personaUi.pending, onClick: closePersonaDialog }, '取消'),
              h('button', { type: 'submit', className: 'cg-rename-save', disabled: personaUi.pending || String(personaUi.draft?.name ?? '').trim() === '' || Boolean(personaUi.draft?.id && personaUi.draft?.textLoaded === false) }, personaUi.pending ? '保存中…' : '保存')))));

  }
  // This bundle disables the shipped sidebar before declaring its replacement.
  // Native workspace, settings and session-action occupants remain unchanged.
  mountSlot('sidebar', () => ctx.slots.register({ name: 'sidebar', children: {
    'sidebar.brand.mark': { kind: 'single', scope: 'root' },
    'sidebar.brand.name': { kind: 'single', scope: 'root' },
    'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    'sidebar.workspaces': { kind: 'single', scope: 'root' },
    'sidebar.settings': { kind: 'single', scope: 'root' },
    'sidebar.footer.action': { kind: 'list', scope: 'root' }
  } }, Sidebar));

  const taskTemplates = [
    ['☀️', '新闻更新', '每天给我发送一份新闻汇总，涵盖我关注的话题。', '每天'],
    ['✉️', '邮件监控', '扫描我的电子邮件，并告诉我哪些内容需要关注。', '每天'],
    ['🤖', 'LLM 蒸馏提示词迭代', '每周给我一个可执行的蒸馏提示词改进方案，并产出可直接测试的新版本。', '每周'],
    ['✈️', '为出行查找航班', '为即将到来的旅行寻找最划算的机票。', '每天'],
    ['🌞', '每日简报', '个性化每日简报，聚焦你最关心的话题。', '每天'],
    ['💰', '每周更新财务状况', '回顾我最近的支出，看看有哪些需要注意的事项。', '每周']
  ];
  function ScheduledTasks() {
    const [tasks, setTasks] = React.useState(() => { try { return JSON.parse(localStorage.getItem('cg-task-drafts') || '[]'); } catch { return []; } });
    const [draft, setDraft] = React.useState(null);
    const [query, setQuery] = React.useState('');
    React.useEffect(() => { const open = () => setDraft({ title: '', prompt: '', frequency: '每天', time: '09:00' }); window.addEventListener('cg-new-task', open); return () => window.removeEventListener('cg-new-task', open); }, []);
    const save = e => { e.preventDefault(); const next = [...tasks, { ...draft, id: Date.now() }]; localStorage.setItem('cg-task-drafts', JSON.stringify(next)); setTasks(next); setDraft(null); };
    const field = (name, value) => setDraft({ ...draft, [name]: value });
    return h('section', { className: 'cg-schedules' },
      h('div', { className: 'cg-schedule-content' }, h('div', { className: 'cg-task-clock', 'aria-hidden': true }, '🕒'), h('h1', null, '安排任务'), h('p', { className: 'cg-task-subtitle' }, 'DeepSeek 可以帮你规划持续性任务，让你无需亲力亲为。'),
      h('div', { className: 'cg-task-templates' }, ...taskTemplates.map(([icon, title, prompt, frequency]) => h('button', { key: title, type: 'button', className: 'cg-task-template', onClick: () => setDraft({ title, prompt, frequency, time: '09:00' }) }, h('span', { className: 'cg-task-emoji' }, icon), h('span', null, h('strong', null, title), h('span', { className: 'cg-task-description' }, prompt))))),
      h('p', { className: 'cg-task-note' }, '当前支持保存任务草稿；尚未接入自动执行服务。'),
      tasks.length > 0 && h('div', { className: 'cg-task-drafts' }, h('h2', null, '任务草稿'), h('input', { className: 'cg-task-search', placeholder: '搜索任务', value: query, onChange: e => setQuery(e.target.value) }), ...tasks.filter(t => (t.title + t.prompt).includes(query)).map(t => h('article', { key: t.id }, h('strong', null, t.title), h('span', null, `${t.frequency} ${t.time} · 草稿`), h('p', null, t.prompt), h(Button, { label: '删除草稿 ' + t.title, onClick: () => { const next = tasks.filter(x => x.id !== t.id); localStorage.setItem('cg-task-drafts', JSON.stringify(next)); setTasks(next); }, children: '删除草稿' })))),
      draft && h('div', { className: 'cg-task-modal-backdrop' }, h('form', { className: 'cg-task-modal', onSubmit: save }, h('h2', null, '新建任务'), h('label', null, '任务名称', h('input', { required: true, value: draft.title, onChange: e => field('title', e.target.value) })), h('label', null, '任务内容', h('textarea', { required: true, rows: 4, value: draft.prompt, onChange: e => field('prompt', e.target.value) })), h('label', null, '重复', h('select', { value: draft.frequency, onChange: e => field('frequency', e.target.value) }, ...['每天', '每周', '一次'].map(x => h('option', { key: x }, x)))), h('label', null, '时间', h('input', { type: 'time', required: true, value: draft.time, onChange: e => field('time', e.target.value) })), h('p', { className: 'cg-task-note' }, '保存为本地草稿，不会自动执行。'), h('div', { className: 'cg-task-form-actions' }, h(Button, { label: '取消', onClick: () => setDraft(null), children: '取消' }), h('button', { type: 'submit' }, '保存草稿'))))));
  }
  mountSlot('main', () => ctx.slots.register({ name: 'main', key: 'cg-schedules' }, ScheduledTasks));

  // Skill 面板。宿主没有现成的 skill 管理界面：@deepseek-ai/dsh-client-ui-skill 只注册
  // tool.call.toolview（key skill）和一个 `/` 输入源，设置侧分页也只有 general / models /
  // plugins / subagent。技能数据唯一来源是客户端 API ctx.remote.skills.list(...)，实现在
  // @deepseek-ai/dsh-api-session-controller 的 SessionSkillCatalog。所以这里自己画一个只读列表：
  // 拿得到就列出来，拿不到就把原因写在页面上，而不是留一片空白。
  // 注意 panel id 就是 main 槽注册里的 key（宿主用 options.key 判定 hasMainPanel），
  // 所以 rail 那边必须 go('cg-skills') 与这里的 key 逐字一致。
  // 参数不能写成解构 `({ useSessions })`：槽渲染不保证传 props，解构 undefined 会在渲染阶段抛错。
  // 更要紧的是不能在这里调 `useSessions()`——它是 hook，而槽的 props 时有时无，条件调用会让
  // 前后两次渲染的 hook 数量不同，React 直接报 #310（Rendered more hooks than during the previous render），
  // 整个 main 槽变成 <div data-slot-error="main">。会话 id 走命令式读取。
  function SkillsPanel(props) {
    const [state, setState] = React.useState({ loading: true, items: [], error: '', note: '' });
    // 开关状态只存在本地：宿主没有提供启停技能的写接口（skills 命名空间只有 list），
    // 所以这里如实做成「本地偏好」——关掉只影响这一页的显示，不动宿主加载的技能。
    const [disabled, setDisabled] = React.useState(() => {
      try { return JSON.parse(localStorage.getItem('cg-skill-disabled') || '{}') || {}; } catch { return {}; }
    });
    const setEnabledFlag = (id, enabled) => {
      setDisabled(prev => {
        const next = { ...prev };
        if (enabled) delete next[id]; else next[id] = true;
        try { localStorage.setItem('cg-skill-disabled', JSON.stringify(next)); } catch { /* 存不下就只在内存里生效 */ }
        return next;
      });
    };
    // 展开状态只在内存里：点开一次看路径和完整简介，刷新后全部收起。
    const [expanded, setExpanded] = React.useState({});
    const setExpandedFlag = (id, open) => {
      setExpanded(prev => {
        const next = { ...prev };
        if (open) next[id] = true; else delete next[id];
        return next;
      });
    };
    // sessionId 的来源（宿主原文）：
    //   ctx.uiSession.adapter.current.getSnapshot().key —— UiSession 的 current binding，
    //     注意是 .adapter.current，不是 .current；无 main 会话时 key 为 undefined。
    //   ctx.sessions.list.getSnapshot().byId —— ClientSessions 的快照 { ids, byId }，
    //     行里 retainedBy.mainView > 0 的那个就是当前主视图会话（ui-session publishMain 的判据）。
    // 早先写成 ctx.sessions.current（ClientSessions 没有这个字段）和 list 当数组找，都是空。
    const sessionId = (() => {
      try {
        const fromUi = ctx.uiSession?.adapter?.current?.getSnapshot?.()?.key;
        if (typeof fromUi === 'string' && fromUi) return fromUi;
        const snapshot = ctx.sessions?.list?.getSnapshot?.();
        const byId = snapshot?.byId;
        if (byId && typeof byId === 'object') {
          const main = Object.values(byId).find(row => row && row.retainedBy && row.retainedBy.mainView > 0);
          if (main && typeof main.id === 'string' && main.id) return main.id;
          const ids = Array.isArray(snapshot.ids) ? snapshot.ids.filter(id => typeof id === 'string' && id) : [];
          if (ids.length) return ids[ids.length - 1];
        }
        return '';
      } catch { return ''; }
    })();
    React.useEffect(() => {
      let alive = true;
      const abort = new AbortController();
      (async () => {
        const api = ctx.remote?.skills;
        if (!api || typeof api.list !== 'function') {
          if (alive) setState({ loading: false, items: [], error: '', note: '当前宿主没有暴露 ctx.remote.skills，读不到技能列表。' });
          return;
        }
        // 不在这里提前 return：会话 id 取不到时也让宿主自己回一句错误，把真实原因显示在页面上，
        // 而不是用一句「先打开一个会话」把接口问题掩盖掉。
        try {
          const result = await api.list({ sessionId }, abort.signal);
          if (!alive) return;
          if (!result || result.ok !== true) {
            const detail = result?.error ? `${result.error.code}: ${result.error.message}` : '未知错误';
            setState({ loading: false, items: [], error: 'skills/list ' + detail, note: '' });
            return;
          }
          const list = Array.isArray(result.value?.skills) ? result.value.skills : [];
          setState({ loading: false, items: list, error: '', note: list.length === 0 ? '接口通了，这个会话没有解析到技能。' : '' });
        } catch (error) {
          if (alive) setState({ loading: false, items: [], error: String(error?.message || error), note: '' });
        }
      })();
      return () => { alive = false; abort.abort(); };
    }, [sessionId]);
    return h('section', { className: 'cg-skills' },
      h('div', { className: 'cg-skill-content' },
        h('h1', null, '技能'),
        h('p', { className: 'cg-task-subtitle' }, '宿主当前会话解析到的技能。开关状态保存在本地，仅影响这里显示。'),
        state.loading && h('p', { className: 'cg-task-note' }, '读取中…'),
        state.note && h('p', { className: 'cg-task-note' }, state.note),
        state.error && h('p', { className: 'cg-task-note' }, '读取失败：' + state.error),
        state.items.length > 0 && h('div', { className: 'cg-skill-list' }, ...state.items.map((item, index) => {
          const id = item?.name || item?.path || ('skill-' + index);
          const on = disabled[id] !== true;
          const open = expanded[id] === true;
          return h('div', { className: 'cg-skill-item', key: id },
            h('article', {
              className: 'cg-skill-row' + (open ? ' cg-skill-row-open' : ''),
              // 整行可点开详情；开关自己 stopPropagation，否则点开关会连带展开。
              onClick: () => setExpandedFlag(id, !open),
              role: 'button',
              tabIndex: 0,
              'aria-expanded': open,
              onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedFlag(id, !open); } },
            },
            h('div', { className: 'cg-skill-text' },
              h('strong', null, id),
              item?.description ? h('p', null, item.description) : null),
            h('button', {
              type: 'button',
              role: 'switch',
              'aria-checked': on,
              'aria-label': (on ? '停用 ' : '启用 ') + id,
              className: 'cg-switch' + (on ? ' cg-switch-on' : ''),
              onClick: event => { event.stopPropagation(); setEnabledFlag(id, !on); },
            }, h('span', { className: 'cg-switch-knob' }))),
            open && h('div', { className: 'cg-skill-detail' },
              h('div', { className: 'cg-skill-field' },
                h('span', null, '路径'),
                h('code', null, item?.path || '(宿主没有给出路径)')),
              h('div', { className: 'cg-skill-field' },
                h('span', null, '模型可调用'),
                h('p', null, item?.modelInvocable === false ? '否' : '是')),
              item?.whenToUse ? h('div', { className: 'cg-skill-field' },
                h('span', null, '何时使用'),
                h('p', null, item.whenToUse)) : null,
              h('div', { className: 'cg-skill-field' },
                h('span', null, '完整简介'),
                h('p', null, item?.description || '(没有描述)'))));
        }))));
  }
  // `main` 是 single-kind 槽：同 priority 的第二个 entry 会被拒（见 apply 开头那段注释）。
  // cg-schedules 已经占了默认优先级，所以这里必须给一个不同的 priority，否则注册被静默 warn 掉，
  // 表现就是按钮点了没反应、go('cg-skills') 抛 "main panel ... is not registered"。
  mountSlot('main', () => ctx.slots.register({ name: 'main', key: 'cg-skills', priority: 1 }, SkillsPanel));
  // DeepSeek's usage dashboard lives on a host that refuses to be framed, so the rail opens it in
  // a browser tab instead of embedding it: `X-Frame-Options` / `frame-ancestors` leave an iframe
  // blank, and a blank panel is worse than a link. Nothing is registered in `main` for it.

  function Chrome({ usePanelInfo, useSessions }) {
    // The hero's two tabs pick the reply style of the conversation that is about to
    // start. They are written to the Host under an empty session id, because no session
    // exists yet: the host arms the next session with it (see src/turbo.js).
    const [style, setStyle] = React.useState('work');
    const active = usePanelInfo(s => s.activePanelId);
    const sessions = useSessions(s => s.byId);
    const currentSession = Object.values(sessions).find(session => (session.retainedBy?.mainView ?? 0) > 0);
    const isNewConversation = currentSession?.blank === true;
    const [tabPosition, setTabPosition] = React.useState(null);
    const rowRef = React.useRef(null);
    const tabRequest = React.useRef(false);
    const tabSession = React.useRef(currentSession?.id);
    tabSession.current = currentSession?.id;
    // Read the persona the last pick armed, then arm it again for the conversation that
    // starts next: the Host stamps it onto the first turn of a session created after this
    // moment, which is what keeps the choice inside that one conversation.
    React.useEffect(() => {
      let cancelled = false;
      tabTurbo('read', '').then(value => {
        if (cancelled || typeof value?.persona !== 'string') return undefined;
        const next = value.persona === 'chat' ? 'chat' : 'work';
        setStyle(next);
        return tabTurbo('update', '', { persona: next });
      }).catch(() => {});
      return () => { cancelled = true; };
    }, []);
    const selectStyle = next => {
      if (next === style || tabRequest.current) return;
      const previous = style;
      setStyle(next);
      tabRequest.current = true;
      tabTurbo('update', '', { persona: next }).catch(() => {
        // The Host is the source of truth: a rejected write puts the tab back.
        if (tabSession.current === currentSession?.id) setStyle(previous);
      }).finally(() => { tabRequest.current = false; });
    };
    // Centered on the hero's brand mark (the DeepSeek whale this plugin draws in
    // `conversation.hero.brand.mark`), at the top of the conversation area. Offsets are
    // applied as a *delta* against the row's own rendered box, so the containing block's
    // origin (the shell overlay does not start at the viewport origin) does not matter.
    // The first attempt can run before the hero exists, so a mutation watcher retries
    // until an anchor with a real width is available.
    React.useLayoutEffect(() => {
      if (!(active === null && isNewConversation)) return undefined;
      let tick = 0;
      let observed = 0;
      const targets = '[class*="fishHitbox"] svg, [class*="fishHitbox"], [data-composer-card], [data-conversation-scroll], [data-composer-seat]';
      const measure = () => {
        // The row is measured through this component's own ref: a second occupant of the
        // overlay slot would otherwise be what `document.querySelector('.cg-tabs')` finds.
        const node = rowRef.current;
        if (!node) return;
        const mark = document.querySelector('[class*="fishHitbox"] svg') ?? document.querySelector('[class*="headline"] svg');
        const card = document.querySelector('[data-composer-card]');
        const scroll = document.querySelector('[data-conversation-scroll]');
        const frame = document.querySelector('[data-sidebar-collapsed], [data-rightbar-collapsed], [data-rightbar-fullscreen]');
        const anchor = (mark ?? card ?? scroll)?.getBoundingClientRect();
        const topEdge = (scroll ?? frame)?.getBoundingClientRect().top;
        const rect = node.getBoundingClientRect();
        if (!anchor?.width || topEdge === undefined || !rect.width) return;
        // Where the row must end up, minus where it currently is, added to its current
        // `left`/`top`: independent of which ancestor happens to be the containing block.
        const computed = getComputedStyle(node);
        const left = (parseFloat(computed.left) || 0) + (anchor.left + anchor.width / 2 - (rect.left + rect.width / 2));
        const top = (parseFloat(computed.top) || 0) + (topEdge + 18 - rect.top);
        const next = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
        // An unchanged value must not create a new object: the mutation watcher would see
        // its own re-render as a change and measure forever.
        setTabPosition(previous => (previous
          && previous.left === next.left
          && previous.top === next.top ? previous : next));
      };
      const update = () => { cancelAnimationFrame(tick); tick = requestAnimationFrame(measure); };
      const resize = new ResizeObserver(update);
      const observeTargets = () => {
        const nodes = document.querySelectorAll(targets);
        if (nodes.length === observed) return;
        observed = nodes.length;
        for (const node of nodes) resize.observe(node);
      };
      const mutations = new MutationObserver(() => { observeTargets(); update(); });
      mutations.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });
      window.addEventListener('resize', update);
      observeTargets();
      update();
      return () => { resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(tick); window.removeEventListener('resize', update); };
    }, [active, isNewConversation, currentSession?.id]);
    // `left`/`top` are written inline while `position: fixed` keeps them in viewport
    // coordinates, so neither the stylesheet cascade nor the containing block can swallow
    // the measured value.
    return active === null && isNewConversation && h('div', {
      className: 'cg-tabs', ref: rowRef, 'data-positioned': !!tabPosition, 'data-style': style,
      style: tabPosition || undefined, role: 'tablist', 'aria-label': '回复风格'
    },
      h('span', { className: 'cg-tabs-slider', 'aria-hidden': true }),
      ...[['chat', '聊天'], ['work', '工作']].map(([id, text]) => h('button', {
        key: id, type: 'button', role: 'tab', 'aria-selected': style === id, tabIndex: style === id ? 0 : -1,
        className: style === id ? 'cg-tab-active' : '',
        onClick: () => selectStyle(id),
        onKeyDown: event => { if (event.key === 'ArrowLeft') selectStyle('chat'); else if (event.key === 'ArrowRight') selectStyle('work'); }
      }, h('span', { className: 'cg-tab-label' }, text))));
  }
  mountSlot('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'chatgpt.chrome', order: 20 }, Chrome));
  mountSlot('shell.leading', () => ctx.slots.register({ name: 'shell.leading' }, () => h(Button, { icon: 'home', label: '展开侧栏', onClick: () => ctx.layout.toggleSidebar() })));
  function QuickGoal() {
    return h('span', { className: 'cg-goal', role: 'status', 'aria-label': '目标模式' }, h(Icon, { name: 'target' }), '目标');
  }
  mountSlot('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'chatgpt.goal', order: 50 }, QuickGoal));

  // Quick agent-preset picker for a fresh conversation, positioned by CSS at the right end of the
  // workspace row. DSH's own hero chip sits in a single-kind slot this build leaves empty (the
  // native chip is gated behind the developer-tools switch), so the picker is re-implemented here
  // on the same client remote and mounted in the composer-overlay list slot instead.
  const AGENT_PRESET_TEXT = {
    standard: ['标准模式', '处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。'],
    ptc: ['PTC 模式', '包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。'],
    minimal: ['极简模式', 'Agent 仅使用终端工具完成任务，适合测试和对比其基础表现。'],
    cordis: ['创造模式', '用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。'],
  };
  function agentPresetRows() {
    // The preset remote is version-dependent: a host without it must leave the picker showing the
    // session's own preset instead of throwing during a render.
    if (typeof ctx.remote?.agentPresets?.list !== 'function') return Promise.resolve({ rows: [], error: '宿主未提供 Agent 预设接口。' });
    return Promise.resolve()
      .then(() => ctx.remote.agentPresets.list())
      .then(result => result?.ok
        ? { rows: result.value.presets.filter(preset => preset.broken === undefined), error: '' }
        : { rows: [], error: result?.error?.message || '预设列表读取失败。' })
      .catch(error => ({ rows: [], error: error?.message || String(error) }));
  }
  function AgentPicker(props) {
    // Session resolution keeps every source optional: the hook props the slot kit provides, the
    // owner prop, and the raw session list. Any of them missing must not blank the chip out.
    const useSessionHook = props.useSession;
    const useSessionsHook = props.useSessions;
    const scopedSession = typeof useSessionHook === 'function' ? useSessionHook(state => state) : undefined;
    const roster = typeof useSessionsHook === 'function' ? useSessionsHook(state => state) : undefined;
    const byId = roster?.byId ?? {};
    // `useSession` hands out the session's live state, which carries `blank` but not the id the
    // select call needs; the roster is keyed by id, so the blank main-view summary comes from there.
    const blankMain = Object.values(byId).find(item => item.blank && (item.retainedBy?.mainView ?? 0) > 0);
    const summary = (props.sessionId !== undefined ? byId[props.sessionId] : undefined) ?? blankMain ?? (props.session?.id !== undefined ? props.session : undefined);
    const sessionId = props.sessionId ?? summary?.id ?? scopedSession?.id;
    const blank = summary?.blank ?? scopedSession?.blank;
    const [open, setOpen] = React.useState(false);
    const [presets, setPresets] = React.useState([]);
    const [rosterError, setRosterError] = React.useState('');
    const [picked, setPicked] = React.useState('');
    const [note, setNote] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const anchor = React.useRef(null);
    const projected = summary?.projectionValues?.agentPreset ?? scopedSession?.projectionValues?.agentPreset;
    const current = typeof projected === 'string' && projected ? projected : picked;
    React.useEffect(() => {
      let cancelled = false;
      // The roster read is optional: without it the trigger still names the session's own preset.
      agentPresetRows().then(result => {
        if (cancelled) return;
        setPresets(result.rows);
        setRosterError(result.rows.length === 0 ? result.error || '预设列表为空。' : '');
      });
      return () => { cancelled = true; };
    }, []);
    React.useEffect(() => {
      if (!open) return;
      const dismiss = event => { if (!anchor.current?.contains(event.target)) setOpen(false); };
      const escape = event => { if (event.key === 'Escape') setOpen(false); };
      document.addEventListener('pointerdown', dismiss);
      document.addEventListener('keydown', escape);
      return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
    }, [open]);
    // Placement is measured, not guessed.
    // The picker's own placement is gone on purpose: 0.9.4 and 0.9.5 placed it from a measurement of the
    // host's `conversation.hero.agentPreset` slot, and in this build that slot is in the workspace row — so
    // the picker came out below the workspace selector. It is positioned by the stylesheet again
    // (`.cg-agent-picker`), which is the position the owner accepted. See the note above `const paths`.
    // The menu opens upward by default, which on a short viewport ran off the top and covered the tabs
    // above. `menuPlacement` decides flip-or-not from the measured rectangles, so the decision is data
    // rather than a guess about screen size.
    React.useLayoutEffect(() => {
      if (!open) return undefined;
      const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => {
        const menu = anchor.current?.querySelector('.cg-agent-menu');
        if (!menu || typeof menu.getBoundingClientRect !== 'function') return;
        menu.removeAttribute('data-flip');
        const viewport = { height: typeof window === 'undefined' ? 800 : window.innerHeight, width: typeof window === 'undefined' ? 1200 : window.innerWidth };
        const first = menu.getBoundingClientRect();
        if (menuPlacement(first, viewport) === 'down') menu.setAttribute('data-flip', 'down');
        const settled = menu.getBoundingClientRect();
        const overflow = settled.right - (viewport.width - 8);
        menu.style.marginLeft = overflow > 0 ? `${-Math.round(overflow)}px` : '';
      }) : null;
      return () => { if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); };
    }, [open]);
    const textOf = id => AGENT_PRESET_TEXT[id] ?? [presets.find(preset => preset.id === id)?.name ?? id, presets.find(preset => preset.id === id)?.description ?? ''];
    const fallback = presets.find(preset => preset.isDefault)?.id ?? presets[0]?.id ?? '';
    const shown = current || fallback;
    // Only a fresh conversation gets the picker: an open one already fixed its preset.
    if (blank !== undefined && blank !== true) return null;
    const choose = async id => {
      setOpen(false);
      setNote('');
      if (sessionId === undefined) { setNote('没有取到当前会话的 id，无法切换。'); return; }
      if (id === current) return;
      setBusy(true);
      if (typeof ctx.remote?.agentPresets?.select !== 'function') { setNote('宿主未提供 Agent 预设切换接口。'); return; }
      try {
        const result = await ctx.remote.agentPresets.select(sessionId, id);
        if (!result?.ok) setNote(result?.error?.message || '切换 Agent 预设失败。');
        else setPicked(id);
      } catch (error) { setNote(error?.message || String(error)); }
      finally { setBusy(false); }
    };
    return h('div', { className: 'cg-agent-picker', ref: anchor },
      h('button', { type: 'button', className: 'cg-agent-trigger', disabled: busy, 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-label': `选择 Agent 预设，当前 ${textOf(shown)[0] || '未指定'}`, onClick: () => { setNote(''); setOpen(!open); } },
        h(Icon, { name: 'target' }), h('span', null, textOf(shown)[0] || 'Agent'), h(Icon, { name: 'down', size: 11 })),
      open && h('div', { className: 'cg-agent-menu', role: 'menu', 'aria-label': 'Agent 预设' },
        ...presets.map(preset => h('button', { key: preset.id, type: 'button', role: 'menuitemradio', 'aria-checked': preset.id === shown, className: 'cg-agent-option', onClick: () => choose(preset.id) },
          h('span', { className: 'cg-agent-option-name' }, textOf(preset.id)[0], preset.id === shown && h(Icon, { key: 'check', name: 'check', size: 14 })),
          textOf(preset.id)[1] && h('span', { className: 'cg-agent-option-desc' }, textOf(preset.id)[1]))),
        presets.length === 0 && h('p', { className: 'cg-agent-note', role: 'status' }, rosterError || '没有读到 Agent 预设列表。')),
      note && h('p', { className: 'cg-agent-note', role: 'status' }, note));
  }
  mountSlot('conversation.input.overlay', () => ctx.slots.register({ name: 'conversation.input.overlay', id: 'chatgpt.agent-picker', order: 40 }, AgentPicker));
}

// 主题切换时冻结动画：宿主在运行时切换浅/深是把 CSS 变量内联改到 body 上并 toggle
// `data-ds-dark-theme`，插件大量深色规则依赖该属性 —— 属性一变，浏览器会把所有受影响的
// 入场动画（cg-soft-in / cg-model-enter）重播一遍，观感就是"切换时闪一下"。
// 这里在属性真正变化前后各 260ms 内，把插件作用域内的过渡与动画静默掉；切换完成即恢复。
(() => {
  if (typeof document === 'undefined') return;
  const shell = document.body;
  let timer;
  const settle = () => {
    document.documentElement.classList.add('cg-settling');
    clearTimeout(timer);
    timer = setTimeout(() => document.documentElement.classList.remove('cg-settling'), 260);
  };
  settle();
  new MutationObserver(settle).observe(shell, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
})();

// 回答结束后播一声提示音。
//
// 判据是宿主自己的 `[data-chat-running="true"]` 节点：ui-chat 在生成期间挂着它，生成结束就卸载。
// 但"从有到无"只是必要条件，不是充分条件 —— 至少两种情况会让它消失，而回答远没有说完：
//   · 用户主动中止（发送键变成停止键被点掉，或者连按两次 Esc）；
//   · 生成途中切到另一个会话，视图整个换掉，原会话还在后台继续跑。
// 所以这里同时读宿主挂在会话容器上的 `data-conversation-session`，并把中止手势记成一个时间窗：
// 只有"会话没变 + 没踩中止窗 + 节点 240ms 内没重新挂上"才算说完了。
//
// 另外两个必须守住的边界：
//   · 页面首次加载、或切到一个空闲会话时，基准取当下状态，不会凭空响一声；
//   · 音频解码失败、或浏览器拒绝自动播放（初次未交互）时静默吞掉 —— 提示音不该影响回答本身。
// 通知点开时要跳会话，而卡片/通知在模块顶层就装好了，那时还没有 ctx；这里留一个位置，
// 由 apply 启动时填进来。运行时用到的都是填好之后的值。
let doneCtx = null;
const DONE_SOUND_URL = '/api/dsh-codex-ui/agent-done-sound';
// "说完了"只判断一次，卡片和其它提示都听这个事件，免得各自猜一套、各自漏一种情况。
const DONE_EVENT = 'dsh-codex-ui:answer-done';
/**
 * 回答完成提醒。
 *
 * 判据从"页面上那个 running 节点消失"换成了"会话自己的 running 从真变假"。理由很实在：页面只渲染
 * 当前这一条会话，别的会话在后台跑完时 DOM 一点变化都没有，靠它根本看不见；而会话 store 里每条会话
 * 都带 running，谁跑完了一目了然。
 *
 * 规则也跟着变干净：**完成的是当前会话就不提醒**，最小化也算当前会话 —— 人回来就看得见的东西，
 * 不必叫；只有别的会话在后台跑完，才值得一声响加一条通知。
 * 顺带把"点停止"这类中止也解决了：中止发生在当前会话，天然被这条规则过滤掉。
 *
 * 有一条要单独排除：子代理会话。它同样"不是当前会话"，但它不是用户在等的那条回答，是本插件
 * 自己派出去干的活 —— 每跑完一个就响一声，吵的是派活的人自己。判据用宿主透传的 `origin`。
 */
function startDoneNotify(ctx) {
  if (typeof document === 'undefined') return;
  doneCtx = ctx ?? null;

  // 插件热重载会让 apply 再跑一遍。旧订阅装在上一份闭包里，不会自己消失，两个订阅各播一次
  // 就成了一轮两声。所以先拆掉上一次的，再装新的。
  try {
    if (typeof window.__cgDoneStop === 'function') window.__cgDoneStop();
  } catch {
    // 拆不掉也要继续，下面的去抖还能兜住重复。
  }
  window.__cgDoneStop = null;

  let audio = null;
  const play = () => {
    try {
      if (audio === null) {
        audio = new Audio(DONE_SOUND_URL);
        audio.preload = 'auto';
      }
      audio.currentTime = 0;
      const started = audio.play();
      if (started && typeof started.catch === 'function') started.catch(() => {});
    } catch (error) {
      // 播不出来不能变成页面上的错误，但要留痕迹方便查。
      window.__cgLastSoundError = String(error);
    }
  };
  // 手动验货用：控制台 __cgDoneSound() 只测音频这一环。
  window.__cgDoneSound = play;

  // 当前会话 id：ui-session 的 current 优先；读不到再从会话表里挑主视图持有者。
  // 读到的值一律缓存：切换和重挂的瞬间会读到空，若把空当成"没有当前会话"，当前会话的完成就会
  // 被误判成别的会话 —— 暂停时那声不该来的提示就是这么冒出来的。
  let lastCurrentId = '';
  const currentSessionId = () => {
    // DOM 优先：宿主把正在显示的会话 id 直接写在容器上，这是"此刻在看哪条会话"最直接的证据，
    // 不依赖 UI 服务的内部结构，最小化时也照样读得到。
    try {
      const fromDom = document
        .querySelector('[data-conversation-content]')
        ?.getAttribute('data-conversation-session');
      if (typeof fromDom === 'string' && fromDom !== '') {
        lastCurrentId = fromDom;
        return fromDom;
      }
    } catch {
      // 继续往下试。
    }
    try {
      const fromUi = ctx?.uiSession?.adapter?.current?.getSnapshot?.()?.key;
      if (typeof fromUi === 'string' && fromUi !== '') {
        lastCurrentId = fromUi;
        return fromUi;
      }
    } catch {
      // 继续往下试。
    }
    try {
      const snapshot = ctx?.sessions?.list?.getSnapshot?.();
      const byId = snapshot?.byId;
      const rows =
        byId !== null && typeof byId === 'object'
          ? Object.values(byId)
          : Array.isArray(snapshot?.items)
            ? snapshot.items
            : [];
      const main = rows.find(row => row && row.retainedBy && row.retainedBy.mainView > 0);
      const mainId =
        typeof main?.id === 'string' ? main.id : typeof main?.sessionId === 'string' ? main.sessionId : '';
      if (mainId !== '') {
        lastCurrentId = mainId;
        return mainId;
      }
    } catch {
      // 读不到就沿用上一次。
    }
    return lastCurrentId;
  };

  // 同一次完成只宣布一次。标记挂在 window 上而不是闭包里：热重载之后是两个实例，
  // 闭包里的标记各算各的，只有挂在 window 上才拦得住第二个。
  const announce = detail => {
    const now = Date.now();
    if (now - (window.__cgLastDoneAt ?? 0) < 1500) return;
    window.__cgLastDoneAt = now;
    try {
      window.dispatchEvent(new CustomEvent(DONE_EVENT, { detail }));
    } catch {
      // 事件发不出去不该连累音频。
    }
    play();
  };

  // "正在看"= 窗口在前台、页面可见、而且看的正是这条会话。三者同时成立才不提醒。
  // 最小化、切到别的应用、看着别的会话，这三种情况人其实都看不见这条回答，都该叫一声
  // —— 早先把"最小化"也算成在看，结果最小化之后反而没声了。
  const watching = id => {
    try {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return false;
    } catch {
      return false;
    }
    return id === currentSessionId();
  };

  const store = ctx?.sessions?.list;
  if (store !== undefined && store !== null && typeof store.subscribe === 'function') {
    const snapshotOf = () => (typeof store.getSnapshot === 'function' ? store.getSnapshot() : null);
    // 快照的形状在宿主这边有两种可能：{ ids, byId } 或者 { items }。两种都读，不去赌是哪一种。
    const rowsOf = snapshot => {
      if (snapshot === null || snapshot === undefined) return [];
      const byId = snapshot.byId;
      if (byId !== null && typeof byId === 'object') return Object.values(byId);
      return Array.isArray(snapshot.items) ? snapshot.items : [];
    };
    const idOf = row =>
      typeof row?.id === 'string' ? row.id : typeof row?.sessionId === 'string' ? row.sessionId : '';
    // 基线：插件加载时已经在跑的会话照常记录，它结束时仍然算一次完成。
    const known = new Map();
    for (const row of rowsOf(snapshotOf())) {
      const id = idOf(row);
      if (id !== '') known.set(id, row?.running === true);
    }
    const unsubscribe = store.subscribe(() => {
      const rows = rowsOf(snapshotOf());
      const seen = new Set();
      for (const row of rows) {
        const id = idOf(row);
        if (id === '') continue;
        seen.add(id);
        const running = row?.running === true;
        const previous = known.has(id) ? known.get(id) : running;
        known.set(id, running);
        if (!previous || running) continue;
        // 子代理会话在列表里也是一条独立会话，它跑完同样是一次 running 由真变假，于是每派一个
        // 子代理就响一声 —— 但那是本插件自己派出去干的活，不是用户在等的那条回答，不该叫。
        // 宿主把这个标记原样透传进列表行：`...entry.origin !== void 0 ? { origin: entry.origin } : {}`。
        // 只认 `origin: 'subagent'`：用户 fork 出来的分支只有 `parentId`、没有这个标记，那是人自己的
        // 会话，跑完仍然该提醒。
        if (row?.origin === 'subagent') continue;
        // 正看着这条会话才不提醒；最小化、或看着别的会话都要叫。
        if (watching(id)) continue;
        announce({ sessionId: id, title: typeof row?.title === 'string' ? row.title : '' });
      }
      for (const id of [...known.keys()]) if (!seen.has(id)) known.delete(id);
    });
    if (typeof unsubscribe === 'function') window.__cgDoneStop = unsubscribe;
    window.__cgDoneMode = 'store';
    return;
  }

  // 退路：拿不到会话 store 时退回 DOM 观察。这条路上只看得见当前会话，而当前会话不提醒，
  // 因此实际上不会出声 —— 留着它是为了"没有 store"这件事不要变成一片静默的坏状态。
  window.__cgDoneMode = 'dom';
  const runningNow = () => document.querySelector('[data-chat-running="true"]') !== null;
  const sessionNow = () =>
    document.querySelector('[data-conversation-content]')?.getAttribute('data-conversation-session') ?? null;
  let wasRunning = runningNow();
  let seenSession = sessionNow();
  let settleTimer = null;
  const evaluate = () => {
    const running = runningNow();
    const session = sessionNow();
    // 容器被 React 重挂的瞬间读不到 id，那不是"换了会话"，只有读到真实 id 才比较。
    if (session !== null && session !== seenSession) {
      seenSession = session;
      wasRunning = running;
      clearTimeout(settleTimer);
      return;
    }
    if (!running && wasRunning) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (runningNow()) return;
        const current = sessionNow();
        if (current !== null && current !== seenSession) return;
        // 这条退路只看得到当前会话，于是"看着没看着"退化成窗口在不在前台。
        if (current !== null && watching(current)) return;
        if (current === null) return;
        announce({ sessionId: current, title: '' });
      }, 240);
    }
    wasRunning = running;
  };
  new MutationObserver(evaluate).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-chat-running'],
  });
  wasRunning = runningNow();
}

// 回答完成卡片，形态照 ChatGPT 桌面端那条通知：小标题、正文摘要、一个回复输入框、一个 Reply。
//
// 两个设计上的取舍，都是被具体场景逼出来的：
//   · 只在人不在这个窗口前的时候浮出来。正看着当前会话时，回答就在眼前，再糊一张卡只会挡住输入框。
//     窗口失焦、或者页面被切到后台，才是"这条回答你可能没看见"的时刻。
//   · Reply 不自己发明发送通道，而是把字灌进宿主自己的 composer 再点它的发送键。这样发出去的是
//     一条普通消息，历史、附件、插话规则全部沿用宿主那一套，插件不需要知道会话协议。
const DONE_NOTICE_STYLE_ID = 'cg-done-notice-style';
const DONE_NOTICE_ID = 'cg-done-notice';
(() => {
  if (typeof document === 'undefined') return;

  // 注意：这里不再判断"该不该提醒"。事件只会在"别的会话跑完了"时发出，
  // 当前会话（含最小化）在源头就被过滤掉了，两处各判一次只会判出分歧。
  const shouldAnnounce = () => true;

  const injectStyle = () => {
    if (document.getElementById(DONE_NOTICE_STYLE_ID) !== null) return;
    const style = document.createElement('style');
    style.id = DONE_NOTICE_STYLE_ID;
    style.textContent = `
#${DONE_NOTICE_ID}{position:fixed;right:24px;bottom:24px;width:380px;max-width:calc(100vw - 32px);box-sizing:border-box;
  background:#fff;color:#1f2023;border-radius:12px;padding:14px 16px 12px;z-index:2147483000;
  box-shadow:0 12px 36px rgba(0,0,0,.26),0 1px 3px rgba(0,0,0,.14);
  font:14px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  opacity:0;transform:translateY(12px);transition:opacity .18s ease,transform .18s ease}
#${DONE_NOTICE_ID}[data-show="true"]{opacity:1;transform:none}
#${DONE_NOTICE_ID} .cg-head{display:flex;align-items:center;gap:8px;color:#5f6368;font-size:13px}
#${DONE_NOTICE_ID} .cg-app{font-weight:600;color:#3c4043}
#${DONE_NOTICE_ID} .cg-x{margin-left:auto;border:0;background:transparent;color:#8a8f98;font-size:18px;line-height:1;
  width:26px;height:26px;border-radius:6px;cursor:pointer}
#${DONE_NOTICE_ID} .cg-x:hover{background:rgba(0,0,0,.06)}
#${DONE_NOTICE_ID} .cg-title{margin:10px 0 4px;font-size:15px;font-weight:700;color:#1f2023}
#${DONE_NOTICE_ID} .cg-body{margin:0 0 12px;color:#3c4043;max-height:4.6em;overflow:hidden;white-space:pre-wrap;
  overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
#${DONE_NOTICE_ID} .cg-row{display:flex;gap:8px;align-items:center}
#${DONE_NOTICE_ID} .cg-input{flex:1;min-width:0;box-sizing:border-box;border:1px solid #d6d9de;border-radius:8px;
  padding:8px 10px;font:inherit;color:inherit;background:#fff;outline:none}
#${DONE_NOTICE_ID} .cg-input:focus{border-color:#8ab4f8;box-shadow:0 0 0 3px rgba(138,180,248,.28)}
#${DONE_NOTICE_ID} .cg-send{border:1px solid #d6d9de;background:#f6f7f9;border-radius:8px;padding:8px 14px;
  font:inherit;font-weight:600;color:#3c4043;cursor:pointer}
#${DONE_NOTICE_ID} .cg-send:hover{background:#eef0f3}
#${DONE_NOTICE_ID} .cg-row[data-busy="true"] .cg-send{opacity:.55;pointer-events:none}
html[data-ds-dark-theme] #${DONE_NOTICE_ID}{background:#232529;color:#e8eaed;box-shadow:0 12px 36px rgba(0,0,0,.6),0 1px 3px rgba(0,0,0,.4)}
html[data-ds-dark-theme] #${DONE_NOTICE_ID} .cg-title{color:#f1f3f4}
html[data-ds-dark-theme] #${DONE_NOTICE_ID} .cg-body{color:#c8ccd2}
html[data-ds-dark-theme] #${DONE_NOTICE_ID} .cg-app{color:#e8eaed}
html[data-ds-dark-theme] #${DONE_NOTICE_ID} .cg-input{background:#2b2e33;border-color:#3c4046;color:#e8eaed}
html[data-ds-dark-theme] #${DONE_NOTICE_ID} .cg-send{background:#2f3238;border-color:#3c4046;color:#e8eaed}
html[data-ds-dark-theme] #${DONE_NOTICE_ID} .cg-x:hover{background:rgba(255,255,255,.08)}
`.trim();
    document.head.appendChild(style);
  };

  // 摘要来源：聊天区里最后一个有文字的对话节点。取不到就退化成整块文本的尾巴。
  const summarize = () => {
    const root = document.querySelector('[data-conversation-content]');
    if (root === null) return '回答已完成。';
    const nodes = root.querySelectorAll('[data-chat-node-key]');
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const text = (nodes[index].innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length > 0) return text;
    }
    const tail = (root.innerText || '').replace(/\s+/g, ' ').trim();
    return tail.length > 0 ? tail.slice(-160) : '回答已完成。';
  };

  const editorNode = () =>
    document.querySelector('[data-composer-seat] [contenteditable="true"]') ??
    document.querySelector('[data-lexical-editor]') ??
    document.querySelector('[contenteditable="true"]');

  // 把文字灌进 composer：Lexical 靠 beforeinput/input 认字，execCommand 是不碰内部 API 的唯一办法；
  // 万一浏览器把它禁了，退到粘贴事件，Lexical 的 paste handler 同样会收下。
  const fillComposer = text => {
    const editor = editorNode();
    if (editor === null) return null;
    editor.focus();
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      inserted = false;
    }
    if (!inserted || !(editor.innerText || '').includes(text)) {
      try {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      } catch {
        // 粘贴也不行就只剩"内容留在卡片输入框里"，由用户自己复制。
      }
    }
    return editor;
  };

  const clickSend = editor => {
    const button =
      document.querySelector('[aria-label="发送消息"]') ??
      document.querySelector('[aria-label="Send message"]') ??
      null;
    if (button !== null) {
      button.click();
      return;
    }
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
    );
  };

  const close = () => {
    const node = document.getElementById(DONE_NOTICE_ID);
    if (node === null) return;
    node.dataset.show = 'false';
    setTimeout(() => node.remove(), 200);
  };

  // 系统通知：桌面版会把它落进 Windows 通知中心。
  // 点它应该做两件事：把程序叫到前台、跳到那条会话 —— 后者靠宿主自己的 openSession。
  const notify = (text, sessionId = '') => {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'default') {
        Promise.resolve(Notification.requestPermission()).catch(() => {});
      }
      if (Notification.permission !== 'granted') return;
      const note = new Notification('DeepSeek 回答完成', {
        body: text.slice(0, 140),
        // 自己的音效已经在播了，系统再来一声就重复。
        silent: true,
        tag: 'dsh-codex-ui-done',
      });
      note.onclick = () => {
        try {
          window.focus();
        } catch {
          // 聚焦失败不影响跳转。
        }
        if (sessionId !== '' && typeof doneCtx?.uiWorkspace?.openSession === 'function') {
          try {
            Promise.resolve(doneCtx.uiWorkspace.openSession(sessionId)).catch(() => {});
          } catch {
            // 会话可能已经关掉了，跳不过去就算了。
          }
        }
        note.close();
      };
    } catch {
      // 通知发不出去不该连累音效。
    }
  };

  const open = (summary = null) => {
    injectStyle();
    const existing = document.getElementById(DONE_NOTICE_ID);
    if (existing !== null) existing.remove();

    const node = document.createElement('div');
    node.id = DONE_NOTICE_ID;
    node.dataset.show = 'false';
    node.innerHTML = `
      <div class="cg-head"><span class="cg-app">DeepSeek</span><button class="cg-x" type="button" title="关闭">×</button></div>
      <div class="cg-title">回答完成</div>
      <div class="cg-body"></div>
      <div class="cg-row"><input class="cg-input" type="text" placeholder="回复 DeepSeek" /><button class="cg-send" type="button">Reply</button></div>`;
    node.querySelector('.cg-body').textContent = summary ?? summarize();
    document.body.appendChild(node);
    requestAnimationFrame(() => {
      node.dataset.show = 'true';
    });

    const input = node.querySelector('.cg-input');
    const row = node.querySelector('.cg-row');
    node.querySelector('.cg-x').addEventListener('click', close);

    const submit = () => {
      const text = input.value.trim();
      if (text === '') return;
      // 先看 composer 里有没有草稿：有的话只灌字、不替他按发送，否则两段话会被并成一次请求。
      const current = editorNode();
      const composerEmpty = current === null ? true : (current.innerText || '').trim() === '';
      const editor = fillComposer(text);
      if (editor === null) {
        input.placeholder = '找不到输入框，请手动复制';
        input.select();
        return;
      }
      row.dataset.busy = 'true';
      setTimeout(() => {
        if (composerEmpty) clickSend(editor);
        row.dataset.busy = 'false';
        close();
      }, 90);
    };

    node.querySelector('.cg-send').addEventListener('click', submit);
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      submit();
    });

    const timer = setTimeout(close, 60000);
    node.addEventListener('mouseenter', () => clearTimeout(timer));
    return node;
  };

  window.addEventListener(DONE_EVENT, event => {
    if (!shouldAnnounce()) return;
    const detail = event?.detail ?? {};
    const title = typeof detail.title === 'string' ? detail.title.trim() : '';
    const sessionId = typeof detail.sessionId === 'string' ? detail.sessionId : '';
    // 后台会话没在页面上渲染，正文取不到；用会话标题说话，比编一段摘要老实。
    const text = title !== '' ? `「${title}」回答完成了` : '有一个会话回答完成了';
    // 程序里不再自己弹卡片：提醒交给系统通知，点通知跳回去就够。
    notify(text, sessionId);
  });

  // 手动验货用：控制台执行 __cgDoneNotice() 就能直接看卡片长什么样，不用等它自己弹。
  window.__cgDoneNotice = open;
})();
