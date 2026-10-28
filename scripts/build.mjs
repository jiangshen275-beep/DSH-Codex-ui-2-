import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const code = await readFile(new URL('src/client.js', root), 'utf8');
// The client half is a single factory body, so the helper modules cannot keep their own `export`
// statements. `alias-sync` is concatenated *before* `model-ui`, because model-ui reads its `const`
// bindings at module scope; the const is not hoisted the way a function declaration is.
// `providers` is independent data, but model-ui reads it while rendering, so it is concatenated inside
// the same factory body before model-ui — a `const` binding is not hoisted the way a function is.
const providers = (await readFile(new URL('src/providers.js', root), 'utf8')).replace(/^export (const|function) /gm, '$1 ');
const helper = (await readFile(new URL('src/alias-sync.js', root), 'utf8'))
  .replace(/^export (const|function|class) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?\s*$/gm, '');
// 没有档位的模型要不要把推理强度条画出来。`model-ui` 读它决定渲染，`injection-ui` 读它画那行开关，
// 所以独立成一小块拼在两者之前 —— 工厂体里是 `const`，不会像函数那样提升。
const effortBar = (await readFile(new URL('src/effort-bar.js', root), 'utf8'))
  .replace(/^export (const|function) /gm, '$1 ');
const modelUI = (await readFile(new URL('src/model-ui.js', root), 'utf8'))
  .replace(/^import \{[^}]*\} from '\.\/alias-sync\.js';\s*$/m, '')
  .replace(/^import \{[^}]*\} from '\.\/effort-bar\.js';\s*$/m, '')
  .replace(/^export \{ registerModelUI \};?\s*$/m, '');
// The contract check reads the inlined `STYLE` straight out of the factory scope, so it is
// concatenated like the other helpers rather than imported.
const hostContract = (await readFile(new URL('src/host-contract.js', root), 'utf8'))
  .replace(/^export (const|function|class) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?\s*$/gm, '');
// The injection-blocks settings page is concatenated like the other helpers (it cannot keep its own
// `export` statements), and after `host-contract` because it reads nothing at module scope: its own
// top-level `const`s only have to exist before `apply` runs, which happens after this body.
const injectionUI = (await readFile(new URL('src/injection-ui.js', root), 'utf8'))
  .replace(/^export (const|function|class) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?\s*$/gm, '')
  .replace(/^import \{[^}]*\} from '\.\/effort-bar\.js';\s*$/m, '');
// 提问/批准提示音。拼在 `client.js` 之后即可：它是两个函数声明（会提升），工厂体执行完毕、
// 宿主调 `apply` 时它们已经在作用域里；模块级的 `let askToneCtx` 也在同一轮初始化完成。
const askAlert = (await readFile(new URL('src/ask-alert.js', root), 'utf8'))
  .replace(/^export (const|function|class) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?\s*$/gm, '');
// Agent 日记面板。拼在 client.js 之后：它只是一个函数声明和几个常量，`apply` 运行时
// 才被 mountSlot 引用，那时它们已经在作用域里。
const diaryUI = (await readFile(new URL('src/diary-ui.js', root), 'utf8'))
  .replace(/^export (const|function|class) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?\s*$/gm, '');
// 回复锻造（原 dsh-codex-ui-HF）的客户端：先由 scripts/build-reply-forge.mjs 打成
// 一个 `const ReplyForgeFactory = (require) => {...}` 表达式，这里原样内联，让它在
// 同一个工厂作用域里执行——宿主只给一个 client 入口，两个包合一个就必须共用工厂。
// 顺序放在 injection-ui 之后：它自成一个 IIFE 式的工厂函数，不读这里的任何绑定。
const reviewLogUI = (await readFile(new URL('src/review-log-ui.js', root), 'utf8'))
  .replace(/^export (const|function|class) /gm, '$1 ')
  .replace(/^export \{[^}]*\};?\s*$/gm, '');
const replyForge = await readFile(new URL('src/reply-forge/client-bundle.js', root), 'utf8');
const upgradeCompat = (await readFile(new URL('src/upgrade-compat.js', root), 'utf8'))
  .replace(/^export (const|function|class) /gm, '$1 ');
let css = await readFile(new URL('src/style.css', root), 'utf8');
// Font inlining is OFF by default: the substitution only runs for a placeholder that `src/style.css`
// actually contains, and the real sheet contains none (its three `@font-face` declarations were dead
// code — nothing reads `--font-openai-sans`, so the browser never fetched the faces and the base64 was
// 208,796 B no rule could reach; see the note at the top of `src/style.css`). Same rule as
// `dsh-codex-ui-reasoning`'s build: a placeholder is the opt-in, and with none present the font files
// are not even read. Do NOT "fix" a leftover placeholder by turning it into a `url()` — nothing serves
// `.woff2` out of this package, so the only result would be a 404 font.
const FONT_TOKENS = [
  ['__OPENAI_SANS_REGULAR__', 'OpenAISans-Regular-c56711d328c4.woff2'],
  ['__OPENAI_SANS_MEDIUM__', 'OpenAISans-Medium-7b9c963f9063.woff2'],
  ['__OPENAI_SANS_SEMIBOLD__', 'OpenAISans-Semibold-e259229c5327.woff2'],
  // 中文正文字形。OpenAI Sans 只带拉丁字形，中文全靠系统回退，和 Codex 观感差一截；
  // 这两份是 Noto Sans SC（思源黑体）按 GB2312 常用 7540 字 + 标点裁出的子集，
  // 各 1.1 MB。整字面 17 MB、裁完不实例化 5.5 MB，都不适合内联。
  ['__NOTO_SC_REGULAR__', 'NotoSC-Regular-dsh.woff2'],
  ['__NOTO_SC_SEMIBOLD__', 'NotoSC-SemiBold-dsh.woff2']
];
const presentFontTokens = FONT_TOKENS.filter(([token]) => css.includes(token));
if (presentFontTokens.length > 0 && presentFontTokens.length < FONT_TOKENS.length) {
  for (const [token] of FONT_TOKENS) {
    if (!presentFontTokens.some(([found]) => found === token)) {
      console.warn(`Warning: src/style.css has no ${token} placeholder, that weight will not be inlined.`);
    }
  }
}
for (const [token, filename] of presentFontTokens) {
  const data = await readFile(new URL(`assets/fonts/${filename}`, root));
  css = css.replaceAll(token, `data:font/woff2;base64,${data.toString('base64')}`);
}
const leftoverFontToken = /__OPENAI_SANS_[A-Z_]+__/.exec(css);
if (leftoverFontToken) {
  throw new Error(`src/style.css carries an unmapped font placeholder ${leftoverFontToken[0]}; known tokens are ${FONT_TOKENS.map(([token]) => token).join(' / ')}.`);
}
await mkdir(new URL('lib/', root), { recursive: true });
const body = code.replace("import React from 'react';", "const React = require('react');").replace('export function apply', 'function apply').replace('export const inject', 'const inject');
// The Codex hero mark ships as its own looping animation (see the note above `CodexMark`).
// Nothing serves files out of this package, so the WebP payloads ride inside the bundle as
// data URLs, exactly like the fonts: the placeholder in `src/client.js` is the opt-in, and
// an unfilled placeholder is a hard error rather than a silent broken image.
const HERO_ASSETS = [
  ['__CODEX_HERO_DARK__', 'codex-hero-dark.webp'],
  ['__CODEX_HERO_LIGHT__', 'codex-hero-light.webp']
];
let clientBody = body;
for (const [token, filename] of HERO_ASSETS) {
  if (!clientBody.includes(token)) continue;
  const data = await readFile(new URL(`assets/${filename}`, root));
  clientBody = clientBody.replaceAll(token, `data:image/webp;base64,${data.toString('base64')}`);
}
const leftoverHeroToken = /__CODEX_HERO_[A-Z]+__/.exec(clientBody);
if (leftoverHeroToken) {
  throw new Error(`src/client.js carries an unmapped hero asset ${leftoverHeroToken[0]}; known tokens are ${HERO_ASSETS.map(([token]) => token).join(' / ')}.`);
}
// `DSH_CODEX_UI_BUNDLE_OUT` lets a caller build the artifact somewhere other than `lib/client.js`,
// so a candidate build can be verified without replacing the artifact the running app is serving.
const out = process.env.DSH_CODEX_UI_BUNDLE_OUT ?? new URL('lib/client.js', root);
await writeFile(out, `window.__ModuleLoader__.load({id:'dsh-codex-ui',factory:(require)=>{const STYLE=${JSON.stringify(css)};\n${clientBody}\n${providers}\n${helper}\n${effortBar}\n${modelUI}\n${hostContract}\n${upgradeCompat}\n${injectionUI}\n${askAlert}\n${diaryUI}\n${reviewLogUI}\n\n${replyForge}\nconst ReplyForgeBundle=(typeof ReplyForgeFactory==='function')?ReplyForgeFactory(require):null;\nconst safeApply=(ctx)=>{try{return apply(ctx);}catch(error){console.error("dsh-codex-ui activation:",error);throw error;}}; return {apply:safeApply,inject,registerModelUI,validateHeroMarkFile,resolveHeroMark,menuPlacement,runningTailOf,ReplyForgeBundle};}});\n`);
console.log('Built dsh-codex-ui client bundle.');

