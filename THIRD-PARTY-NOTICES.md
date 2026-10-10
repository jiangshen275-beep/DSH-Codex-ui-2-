# Third-party assets

The project code is licensed under MIT (see `LICENSE`). **That license covers this project's code only. It does not grant any right to the third-party artwork, fonts, or trademarks listed below, which remain the property of their owners.**

## Assets shipped with this package

- `assets/codex.png` — Codex application artwork, extracted from a locally installed OpenAI Codex application (`26.928.4866.0`), `webview/assets/codex-app-ga-logo-3e5209898ca3.png` inside `app.asar`.
- `assets/fonts/OpenAISans-Regular-c56711d328c4.woff2`, `OpenAISans-Medium-7b9c963f9063.woff2`, `OpenAISans-Semibold-e259229c5327.woff2` — **OpenAI Sans**, a proprietary typeface belonging to OpenAI. Extracted from the same application.
- The same three font files are also **inlined as base64 `@font-face` data inside the built bundle** `lib/client.js`, so removing them from `assets/fonts/` alone does not remove them from the package.
- Sidebar and rail vector paths were adapted from the application resources documented in `RESOURCE-REFERENCE.zh.md`.

## What this means for you

- The upstream project and this fork are **not affiliated with, endorsed by, or sponsored by OpenAI**. "Codex", "OpenAI", and "ChatGPT" are trademarks of OpenAI.
- If you redistribute this package, publish it, or ship it inside another product, **you are responsible for satisfying yourself that you may redistribute the assets above.** The MIT license of the code is not a license to them.
- If you need a redistribution-clean build, remove `assets/codex.png` and `assets/fonts/`, rebuild with `node scripts/build.mjs`, and replace the `@font-face` declarations in `src/style.css` with a system font stack.
- Source details, extraction dates, and hashes are documented in `RESOURCE-REFERENCE.zh.md`.

## Dependencies

- `zod` — MIT, © Colin McDonnell and contributors.
- Interoperability with DeepSeek Harness (`@deepseek-ai/dsh`) is by way of its published plugin interfaces; DSH is not bundled here.
