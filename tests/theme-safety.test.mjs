// Colour decisions that only work in one theme are invisible to every render test in this repo:
// the harness has no cascade and no contrast check. So they are pinned here, against the source
// of truth, in the two ways they went wrong in practice.
//
// Two things this file has to get right, both learned from a review of the previous version:
//   1. Rules are collected by brace depth, not by splitting on `}`. A plain split makes every
//      `@media` header swallow its first inner rule, so 38 blocks were never inspected at all.
//   2. The counterpart lookup compares the selector *suffix* and does not require the counterpart
//      to carry a literal colour. An exact match missed pairs written with a repeated prefix, and
//      demanding `background: #` on both sides would fail a pair whose other half uses `var()`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'style.css'), 'utf8');
const HOST = 'html[data-chatgpt-ui]';
const DARK = 'body[data-ds-dark-theme]';
const LIGHT = 'body:not([data-ds-dark-theme])';
const GATES = [DARK, LIGHT];

/** Split a block into its top-level chunks, ignoring `;` and `{`/`}` inside nested braces. */
function splitTop(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        out.push(text.slice(start, i));
        start = i + 1;
      }
    }
  }
  return out;
}

/**
 * Every style rule in the sheet, as `{ selector, body }`.
 *
 * At-rule wrappers (`@media`, `@supports`) are descended into rather than treated as rules
 * themselves: their bodies hold real rules whose theme safety matters exactly as much as a
 * top-level rule's, and a wrapper that is skipped takes its first child with it.
 */
function collectRules(text, out = []) {
  for (const chunk of splitTop(text)) {
    const brace = chunk.indexOf('{');
    if (brace < 0) continue;
    const selector = chunk.slice(0, brace).trim();
    const body = chunk.slice(brace + 1);
    if (selector.startsWith('@')) collectRules(body, out);
    else if (selector !== '') out.push({ selector, body });
  }
  return out;
}

// Comments are stripped before collection so a `{` inside one cannot open a phantom rule.
const rules = collectRules(css.replace(/\/\*[\s\S]*?\*\//g, ' '));
const painted = rule => /background:\s*#[0-9a-f]{3,8}/i.test(rule.body);

/**
 * The suffix a selector keeps once its theme gate is removed, or null when it names no theme.
 *
 * `''` is a real answer — the bare gates `body[data-ds-dark-theme]` and
 * `body:not([data-ds-dark-theme])` are themselves rules, and pairing them needs the empty suffix
 * rather than a string with a trailing space that no trimmed selector can ever equal.
 */
function gateTail(selector) {
  for (const gate of GATES) {
    if (selector === gate) return '';
    if (selector.startsWith(`${gate} `)) return selector.slice(gate.length + 1).trim();
  }
  return null;
}

/**
 * A rule is theme-safe when it names its own theme, or the other theme names it back.
 *
 * The counterpart test is deliberately loose about *how* the other half is written — a repeated
 * prefix, `var()` instead of a literal — because what is being protected is "this colour is not
 * fixed for both themes", not "the two halves are spelled identically".
 */
function themeSafe(rule) {
  if (/\bmask:/.test(rule.body)) return true;
  if (gateTail(rule.selector) !== null) return true;
  if (!rule.selector.startsWith(HOST)) return true; // outside the host-scoped surface this file owns
  const rest = rule.selector.slice(HOST.length).trim();
  return rules.some(other => {
    const otherTail = gateTail(other.selector);
    if (otherTail === null) return false;
    if (rest === '') return otherTail === '';
    return otherTail === rest || otherTail.endsWith(` ${rest}`);
  });
}

test('a hardcoded colour is never left to win in both themes', () => {
  // The user bubble shipped as `background: #E8F3FE` with no dark branch. Its specificity beat
  // DSH's token rule, so dark mode painted near-white text on pale blue: an unreadable bubble,
  // reported twice. Every fixed background on a host element must name a theme, or be answered by
  // one that does. A background that only paints a `mask` is exempt: there the hue is irrelevant.
  const paintedRules = rules.filter(painted);
  assert.ok(paintedRules.length > 0, 'the scan must actually see fixed backgrounds');
  const offenders = paintedRules.filter(rule => !themeSafe(rule));
  assert.deepEqual(offenders.map(rule => rule.selector), [], 'give every fixed background a theme, or a counterpart in the other one');
});

test('the scan still has both theme gates to pair against', () => {
  // Guards the scan itself: if a gate selector were renamed, the counterpart lookup would start
  // passing everything silently instead of failing loudly, which is the failure mode this file
  // exists to prevent.
  assert.ok(rules.some(rule => rule.selector.startsWith(DARK)), 'dark-gated rules must exist');
  assert.ok(rules.some(rule => rule.selector.startsWith(LIGHT)), 'light-gated rules must exist');
});

test('the bubble keeps its light-theme fill and hands dark back to the host token', () => {
  const bubble = rules.find(rule => /\.Sixlwa_userRow[ >]+\.Sixlwa_bubble\b/.test(rule.selector) && rule.selector.startsWith(LIGHT));
  assert.ok(bubble, 'the light-theme bubble rule must exist');
  assert.match(bubble.body, /background:\s*#f4f5f7/i, 'and must carry the audited light fill');
  // The unguarded form is the defect itself: it wins in both themes, which is what made the bubble
  // unreadable. Any colour at all under that selector is a regression, so the pattern is wide.
  assert.doesNotMatch(
    css,
    /html\[data-chatgpt-ui\]\s+\.Sixlwa_userRow\s+\.Sixlwa_bubble\s*\{[^}]*background:\s*#/i,
    'the unguarded rule must not come back',
  );
});

test('the two reviewed exceptions stay fixed', () => {
  // A review of the previous version found exactly two genuinely unguarded colours on selectors the
  // main scan cannot see. Both were fixed; pinning them here stops a later edit from quietly
  // reverting the fix while the main scan — blind to both — stays green.
  const home = rules.find(rule => rule.selector === '.cg-rail .cg-home');
  assert.ok(home, '.cg-home must exist');
  assert.match(home.body, /background:\s*var\(--cg-/, 'the rail home tile must follow the theme palette');

  // The "ahead" dot used to be an unguarded `.cg-model-slider-dots span[data-ultra="true"]` rule,
  // and this test pinned its two properties and then asserted the whole model picker had moved to
  // `dsh-codex-ui-reasoning`. The migration half of that assumption is stale — the model picker and
  // the effort slider still live in this sheet — but the dot was reworked on purpose rather than
  // reverted: it now carries a parent guard, `.cg-model-slider-shell:not([data-ultra="true"])`,
  // so it only paints while the shell's ultra state is OFF (src/style.css ~:1638, comment:
  // "Deliberately ungated and deliberately not theme-varied"). Pin the guarded form, not the old
  // count-to-zero, because a future edit that drops the guard is exactly how the original defect
  // comes back: the purple ultra glow would leak onto a dot that marks a not-reached position.
  const aheadGuarded = rules.find(rule =>
    /\.cg-model-slider-shell:not\(\[data-ultra="true"\]\)\s+\.cg-model-slider-dots span\[data-ultra="true"\]/.test(rule.selector));
  assert.ok(aheadGuarded, 'the reworked "ahead" dot rule must exist in the main sheet with its :not guard');
  assert.match(aheadGuarded.body, /background:\s*#b7b4b7/, 'and it must keep the audited neutral fill');
  assert.match(aheadGuarded.body, /box-shadow:\s*none/, 'and it must keep the glow-killing box-shadow: none');
  // The original defect was `:2538`'s bare ultra-dot colour leaking its purple glow while the
  // shell's ultra state was OFF. The fix is a higher-specificity guard (:1638) that paints the
  // neutral when the shell is not ultra; the bare rule stays as the legit on-state base — the
  // guard's own comment names it ("the purple ultra glow from the [data-ultra="true"] rule
  // cannot leak in while the shell's ultra state is off"). Pin the pair, not a deletion.
  const bareBase = rules.find(rule => rule.selector === '.cg-model-slider-dots span[data-ultra="true"]');
  assert.ok(bareBase, 'the on-state ultra dot base (:2538) must stay — the guard comment depends on it');
  const guard = rules.find(rule =>
    /\.cg-model-slider-shell:not\(\[data-ultra="true"\]\)\s+\.cg-model-slider-dots span\[data-ultra="true"\]/.test(rule.selector));
  assert.ok(guard, 'the shell-gated "ahead" dot rule (:1638) must exist');
  assert.match(guard.body, /background:\s*#b7b4b7/, 'and it must keep the audited neutral fill');
  assert.match(guard.body, /box-shadow:\s*none/, 'and it must keep the glow-killing box-shadow: none');
});
