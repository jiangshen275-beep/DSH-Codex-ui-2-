// Colour decisions that only work in one theme are invisible to every render test in this repo:
// the harness has no cascade and no contrast check. So they are pinned here, against the source
// of truth, in the two ways they went wrong in practice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'style.css'), 'utf8');
const rules = css.split('\n').filter(line => line.includes('{') && line.trim().startsWith('html[data-chatgpt-ui]'));

test('a hardcoded colour is never left to win in both themes', () => {
  // The user bubble shipped as `background: #E8F3FE` with no dark branch. Its specificity beat
  // DSH's token rule, so dark mode painted near-white text on pale blue: an unreadable bubble,
  // reported twice. Every fixed background on a host element must be theme-guarded. A background
  // that only paints a `mask` is exempt: there the hue is irrelevant.
  const offenders = rules.filter(line => /background:\s*#[0-9a-f]{3,8}/i.test(line)
    && !/\bmask:/.test(line)
    && !line.includes(':has([data-ds-dark-theme])')
    && !line.includes(':not(:has([data-ds-dark-theme]))'));
  assert.deepEqual(offenders, [], 'guard fixed backgrounds with :has([data-ds-dark-theme]) or :not(:has(...))');
});

test('the bubble keeps its light-theme blue and hands dark back to the host token', () => {
  const bubble = rules.find(line => /\.Sixlwa_userRow \.Sixlwa_bubble|\.Sixlwa_userRow\s*>\s*\.Sixlwa_bubble/.test(line) && line.includes('#E8F3FE'));
  assert.ok(bubble, 'the light-theme bubble rule must exist');
  assert.match(bubble, /:not\(:has\(\[data-ds-dark-theme\]\)\)/, 'and must be light-theme only');
  assert.doesNotMatch(css, /html\[data-chatgpt-ui\] \.Sixlwa_userRow \.Sixlwa_bubble \{ background: #E8F3FE; \}/, 'the unguarded rule must not come back');
});
