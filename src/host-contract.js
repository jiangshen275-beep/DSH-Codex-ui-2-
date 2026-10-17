/**
 * Host-contract self-check.
 *
 * This skin reaches into the host's DOM, and the host names its own elements with CSS-module hashes
 * generated at build time. Those hashes are not API. This plugin's sheet carries class names from
 * **two** host generations at once — six prefixes that exist only on `0.2.1-alpha.3`, one that exists
 * only on `0.2.0-rc.2` — so on any given install a large part of it does nothing.
 *
 * The dangerous direction is **a prefix coming back to life**, not going dead. On `0.2.0-rc.2` the
 * `wSkVaW_*` rules matched nothing and were silent; the upgrade to `0.2.1-alpha.3` reintroduced those
 * names, every one of them started matching, and the layout was re-arranged against assumptions that
 * no longer held — a band appeared outside the composer card, with no error and no log. A check that
 * only reports "prefixes that went dead" would have printed `ok` throughout that incident.
 *
 * So a prefix the sheet references but the DOM does not emit is reported as **latent**, not as
 * harmless: whether that rule fires is decided by whether the host happens to reuse the name again.
 * Nothing here disables a rule; it only makes the exposure visible.
 */

/**
 * Hooks that must exist on every surface this plugin decorates. Kept deliberately short: a hook that
 * appears only during a running turn, or only inside the desktop shell, would make a healthy install
 * report itself broken. They double as the readiness gate — see `hostContractCheck`.
 */
export const CONTRACT_HOOKS = [
  { sel: '[data-slot="sidebar.workspaces"]' },
  { sel: '[data-composer-card]' },
  { sel: '[data-composer-input]' }
];

/** Class tokens of one element, as a plain string (an SVG element carries a `baseVal` object). */
function classTokensOf(el) {
  const raw = typeof el.className === 'string' ? el.className : (el.className !== null && el.className !== undefined ? el.className.baseVal : '');
  return typeof raw === 'string' ? raw.split(/\s+/) : [];
}

/** Module prefixes a stylesheet references. Five to seven characters is what the host's hashing emits. */
export function modulePrefixesOf(sheetText) {
  const used = new Set();
  for (const match of String(sheetText).matchAll(/\.([A-Za-z0-9]{5,7})_[A-Za-z]/g)) used.add(match[1]);
  return used;
}

/** Module prefixes the live DOM emits, and the class tokens they were read from. */
export function livePrefixesOf(doc) {
  const alive = new Set();
  for (const el of doc.querySelectorAll('[class]')) {
    for (const token of classTokensOf(el)) {
      const match = token.match(/^([A-Za-z0-9]{5,7})_/);
      if (match !== null) alive.add(match[1]);
    }
  }
  return alive;
}

/**
 * Compare the sheet's assumptions against the live DOM.
 *
 * @param doc - the document to inspect.
 * @param sheetText - the stylesheet; defaults to the inlined `STYLE` of the built bundle. The
 *   parameter exists so a test can hand in the source `src/style.css` instead.
 * @returns the measurement, or `null` when there is no document to measure.
 *
 * Three states:
 *   `ok`      - every prefix the sheet references is live, and every mandatory hook is present.
 *   `latent`  - some referenced prefix is not live. The rules are dormant, and they will fire again
 *               if the host reuses the name. This is the state `0.2.0-rc.2` was in before the band.
 *   `broken`  - every referenced prefix is dead, or a mandatory hook is missing: the skin is
 *               decorating a DOM it does not recognise.
 */
export function hostContractCheck(doc = document, sheetText = (typeof STYLE === 'string' ? STYLE : '')) {
  const root = doc !== null && doc !== undefined ? doc.documentElement : null;
  if (root === null) return null;

  const used = modulePrefixesOf(sheetText);
  const alive = livePrefixesOf(doc);

  // Readiness gate. At activation the host shell may not have rendered yet, and then *nothing*
  // matches — which is not the same fact as "the host replaced its stylesheet". Without this gate
  // the very first measurement of a healthy install would report every prefix dead.
  const shellReady = CONTRACT_HOOKS.some(hook => doc.querySelector(hook.sel) !== null);
  if (!shellReady) {
    delete root.dataset.cgContract;
    delete root.dataset.cgContractMissing;
    return { used: [...used], alive: [...alive], latent: [], absent: [], allDead: false, skipped: true, state: 'unknown' };
  }

  const latent = [...used].filter(prefix => !alive.has(prefix));
  const absent = CONTRACT_HOOKS.filter(hook => doc.querySelector(hook.sel) === null).map(hook => hook.sel);
  const allDead = used.size > 0 && latent.length === used.size;
  const state = (allDead || absent.length > 0) ? 'broken' : (latent.length > 0 ? 'latent' : 'ok');

  root.dataset.cgContract = state;
  const report = [...latent.map(prefix => `${prefix}_`), ...absent];
  if (report.length > 0) root.dataset.cgContractMissing = report.join('|');
  else delete root.dataset.cgContractMissing;

  return { used: [...used], alive: [...alive], latent, absent, allDead, skipped: false, state };
}

/**
 * Run the check, warn once per distinct result, and never throw: a diagnostic must not take the skin
 * down. A repeated identical result is not worth a second line in the console.
 */
export function runHostContractCheck() {
  try {
    const result = hostContractCheck();
    if (result === null || result.skipped) return result;
    const signature = `${result.state}:${result.latent.length}:${result.absent.length}`;
    if (result.state !== 'ok' && signature !== runHostContractCheck.last) {
      runHostContractCheck.last = signature;
      console.warn('[dsh-codex-ui] host contract', result.state, result);
    }
    return result;
  } catch (error) {
    console.warn('[dsh-codex-ui] host contract check failed', error);
    return null;
  }
}
