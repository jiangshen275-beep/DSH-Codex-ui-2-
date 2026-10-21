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
const modelUI = (await readFile(new URL('src/model-ui.js', root), 'utf8'))
  .replace(/^import \{[^}]*\} from '\.\/alias-sync\.js';\s*$/m, '')
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
  .replace(/^export \{[^}]*\};?\s*$/gm, '');
// 回复锻造（原 dsh-codex-ui-HF）的客户端：先由 scripts/build-reply-forge.mjs 打成
// 一个 `const ReplyForgeFactory = (require) => {...}` 表达式，这里原样内联，让它在
// 同一个工厂作用域里执行——宿主只给一个 client 入口，两个包合一个就必须共用工厂。
// 顺序放在 injection-ui 之后：它自成一个 IIFE 式的工厂函数，不读这里的任何绑定。
const replyForge = await readFile(new URL('src/reply-forge/client-bundle.js', root), 'utf8');
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
  ['__OPENAI_SANS_SEMIBOLD__', 'OpenAISans-Semibold-e259229c5327.woff2']
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
// `DSH_CODEX_UI_BUNDLE_OUT` lets a caller build the artifact somewhere other than `lib/client.js`,
// so a candidate build can be verified without replacing the artifact the running app is serving.
const out = process.env.DSH_CODEX_UI_BUNDLE_OUT ?? new URL('lib/client.js', root);
await writeFile(out, `window.__ModuleLoader__.load({id:'dsh-codex-ui',factory:(require)=>{const STYLE=${JSON.stringify(css)};\n${body}\n${providers}\n${helper}\n${modelUI}\n${hostContract}\n${injectionUI}\n${replyForge}\nconst ReplyForgeBundle=(typeof ReplyForgeFactory==='function')?ReplyForgeFactory(require):null;\nconst safeApply=(ctx)=>{try{return apply(ctx);}catch(error){console.error("dsh-codex-ui activation:",error);throw error;}}; return {apply:safeApply,inject,registerModelUI,validateHeroMarkFile,resolveHeroMark,menuPlacement,runningTailOf,ReplyForgeBundle};}});\n`);
console.log('Built dsh-codex-ui client bundle.');

