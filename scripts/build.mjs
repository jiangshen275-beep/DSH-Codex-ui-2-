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
let css = await readFile(new URL('src/style.css', root), 'utf8');
for (const [token, filename] of [
  ['__OPENAI_SANS_REGULAR__', 'OpenAISans-Regular-c56711d328c4.woff2'],
  ['__OPENAI_SANS_MEDIUM__', 'OpenAISans-Medium-7b9c963f9063.woff2'],
  ['__OPENAI_SANS_SEMIBOLD__', 'OpenAISans-Semibold-e259229c5327.woff2']
]) {
  const data = await readFile(new URL(`assets/fonts/${filename}`, root));
  css = css.replaceAll(token, `data:font/woff2;base64,${data.toString('base64')}`);
}
await mkdir(new URL('lib/', root), { recursive: true });
const body = code.replace("import React from 'react';", "const React = require('react');").replace('export function apply', 'function apply').replace('export const inject', 'const inject');
// `DSH_CODEX_UI_BUNDLE_OUT` lets a caller build the artifact somewhere other than `lib/client.js`,
// so a candidate build can be verified without replacing the artifact the running app is serving.
const out = process.env.DSH_CODEX_UI_BUNDLE_OUT ?? new URL('lib/client.js', root);
await writeFile(out, `window.__ModuleLoader__.load({id:'dsh-codex-ui',factory:(require)=>{const STYLE=${JSON.stringify(css)};\n${body}\n${providers}\n${helper}\n${modelUI}\nconst safeApply=(ctx)=>{try{return apply(ctx);}catch(error){console.error("dsh-codex-ui activation:",error);throw error;}}; return {apply:safeApply,inject,registerModelUI,validateHeroMarkFile,resolveHeroMark,menuPlacement,runningTailOf};}});\n`);
console.log('Built dsh-codex-ui client bundle.');

