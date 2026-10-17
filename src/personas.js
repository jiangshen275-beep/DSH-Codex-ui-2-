/**
 * Personas: the reply-style prompts, one Markdown file each, read from `$DSH_HOME/personas`.
 *
 * Why files: the two styles used to be two hard-coded ids plus one prompt constant, so adding a
 * third one meant editing and republishing the plugin. A persona is now a file the user owns.
 *
 * Three rules shape everything here:
 *   · `DeepSeek` is built in and means "inject nothing". It is never a file, so it can be neither
 *     renamed nor deleted, and it always resolves.
 *   · `codex` must always resolve. Sessions already persist the exact string `Codex`, and a prompt
 *     that silently disappears after an upgrade is worse than any feature. Ids are therefore matched
 *     case-insensitively, and `codex.md` is re-seeded whenever the file is missing.
 *   · A broken file never breaks the list: it is skipped with a warning, because `loadPersonas` runs
 *     inside the system-prompt assembly of every turn.
 *   · A persona may also carry a sampling block — `temperature`, `top_p`, `max_tokens` — in its
 *     frontmatter. Every key is optional and none is defaulted; `paramsFor` is how the host side
 *     reads it, and `sampling.js` is the only place that decides what reaches the model.
 */
import { readdirSync, readFileSync, renameSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/** The built-in "inject nothing" persona. Never a file, so it cannot be edited or removed. */
export const BUILTIN_ID = 'DeepSeek';
/** The one id that must always resolve: the seed file's stem, stored capitalised by old sessions. */
export const CODEX_ID = 'codex';

const CODEX_FILE = 'codex.md';
const CODEX_NAME = 'Codex';
const CODEX_DESCRIPTION = '严谨、理性、严肃、简短';
const CODEX_ORDER = 0;
const DEFAULT_ORDER = 100;
const DESCRIPTION_LIMIT = 40;
const EXTENSION = '.md';
const SEED_URL = new URL('../prompts/codex.txt', import.meta.url);

/**
 * The sampling keys a file may declare, in the order they are written back to it. Each of the three
 * has a carrier on the host side: `temperature` and `max_tokens` are first-class request config
 * fields, and `top_p` is the one request extension `sampling.js` registers for this plugin.
 */
const SAMPLING_KEYS = ['temperature', 'top_p', 'max_tokens'];
/**
 * Per-key acceptance. `unit` is a 0..max range; `count` is a positive integer. The two unit keys do
 * not share a lower bound, so the rule states it instead of the judge testing a key name:
 * temperature's is inclusive (the docs say 0 to 2, and 0 is a temperature like any other), while
 * top_p's is exclusive (the docs say it must be greater than 0, so 0 is not a value this accepts).
 * That is all `minExclusive` means, and this table is the only place the distinction lives. Anything
 * else is rejected, not clamped: a typo in a number must not turn into a nearby value the user never
 * asked for. What a rejection means for the key is up to the caller — reading a file reports "not
 * set", a write keeps what the file already has.
 */
const SAMPLING_RULES = {
  temperature: { kind: 'unit', max: 2 },
  top_p: { kind: 'unit', max: 1, minExclusive: true },
  max_tokens: { kind: 'count' },
};

/** The seed body, i.e. the text this plugin used to hard-code. Empty only if the source is gone. */
function readSeedText() {
  try {
    return readFileSync(SEED_URL, 'utf8').trim();
  } catch (error) {
    console.warn(`[dsh-codex-ui] persona seed source unreadable: ${String(error)}`);
    return '';
  }
}

/** `$DSH_HOME/personas`, or null when the host publishes no home for it. */
export function personasDir() {
  const home = process.env.DSH_HOME;
  return typeof home === 'string' && home.length > 0 ? join(home, 'personas') : null;
}

/** The built-in row: its empty body is what makes "DeepSeek" read as "inject nothing". */
function builtinSentinel() {
  return { id: BUILTIN_ID, name: BUILTIN_ID, description: CODEX_DESCRIPTION, order: -1, enabled: true, text: '', builtin: true };
}

/** A persona error the route can turn into `{ ok: false, error }` without guessing at the cause. */
function personaError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Write through a temp name so a crash mid-write cannot leave a half persona on disk. */
function writeAtomically(file, content) {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, content, 'utf8');
    renameSync(temp, file);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* a stray temp file is not worth failing over */ }
    throw error;
  }
}

/** Flatten a value onto one line: the frontmatter this parses has no multi-line fields. */
const oneLine = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/**
 * The file format, written field by field. `---` opens and closes it; the body follows directly so
 * the seed body is byte-identical to the constant it replaces.
 */
function formatPersona({ name, description, order, enabled, text, params }) {
  // The sampling block is appended only for keys that are set, in `SAMPLING_KEYS` order. A file
  // without them therefore stays byte-identical to what earlier builds wrote, so an upgrade never
  // rewrites every persona just to add empty lines.
  const sampling = SAMPLING_KEYS.flatMap(key => {
    const value = params?.[key];
    return Number.isFinite(value) ? [`${key}: ${value}`] : [];
  });
  return [
    '---',
    `name: ${oneLine(name)}`,
    `description: ${oneLine(description)}`,
    `order: ${Number.isFinite(order) ? order : DEFAULT_ORDER}`,
    `enabled: ${enabled === false ? 'false' : 'true'}`,
    ...sampling,
    '---',
    String(text ?? '').trim(),
  ].join('\n') + '\n';
}

/** Strip the quotes a hand-written frontmatter may carry around a value. */
function unquote(value) {
  const trimmed = value.trim();
  const quoted = /^(['"])(.*)\1$/.exec(trimmed);
  return quoted ? quoted[2].trim() : trimmed;
}

/** "The first non-empty body line, capped" — good enough to label a menu entry. */
function deriveDescription(text) {
  const line = text.split(/\r?\n/).map(entry => entry.trim()).find(entry => entry.length > 0) ?? '';
  return line.slice(0, DESCRIPTION_LIMIT);
}

/**
 * Judge one sampling value against its rule. Shared by the file parser and the writer so a number
 * the editor sends is accepted or rejected exactly like one a hand-written file carries.
 */
function samplingValue(key, raw) {
  const rule = SAMPLING_RULES[key];
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  // The lower bound is the one place the two `unit` keys differ, so it is read off the rule: a
  // `minExclusive` rule rejects 0, a plain one accepts it. Testing `key === 'top_p'` here would put
  // the range in two places — this table and this line — and the next key added would have to be
  // taught about both.
  const accepted = Number.isFinite(value) && (rule.kind === 'unit'
    ? (rule.minExclusive === true ? value > 0 : value >= 0) && value <= rule.max
    : Number.isInteger(value) && value > 0);
  return accepted ? { ok: true, value } : { ok: false };
}

/** The Chinese range description, used only in warnings. Mirrors the rule, `minExclusive` included. */
function samplingRange(key) {
  const rule = SAMPLING_RULES[key];
  if (rule.kind !== 'unit') return '正整数';
  return rule.minExclusive === true ? `大于 0 且不超过 ${rule.max} 的数` : `0–${rule.max} 之间的数`;
}

/**
 * Read the sampling block: only keys the file actually sets come back.
 *
 * Nothing is defaulted — "not set" and "set to a particular number" ask the host for different
 * things, and a default here would make a persona silently override the user's own limit. A value
 * that cannot be honoured is dropped with a warning instead of failing the file, because this parse
 * runs inside the system-prompt assembly of every turn.
 */
function parseSampling(meta, stem) {
  const params = {};
  for (const key of SAMPLING_KEYS) {
    const raw = meta[key];
    // A missing key and a key the user emptied out mean the same thing: not set.
    if (raw === undefined || raw === '') continue;
    const parsed = samplingValue(key, raw);
    if (!parsed.ok) {
      console.warn(`[dsh-codex-ui] persona ${stem}${EXTENSION}: ${key}=${raw} 不合法（应为${samplingRange(key)}），已按未设置处理`);
      continue;
    }
    params[key] = parsed.value;
  }
  return params;
}

/**
 * Merge the sampling keys of one write into the values the file already has.
 *
 * Omitted means "leave it alone", the same rule as name/description/order/enabled: the editor ships
 * only the boxes the user touched, so a re-description must not reset a temperature. An explicit
 * empty string or null clears one key, which is the one thing the editor cannot express by omission.
 *
 * A value that cannot be honoured is treated the same way as an omitted key and the file's own value
 * wins. The object returned here is the complete set that gets written, so dropping such a key did not
 * just decline the bad number — it deleted whatever the user had saved before, while the write still
 * reported success.
 */
function mergeSampling(input, existing) {
  const params = {};
  for (const key of SAMPLING_KEYS) {
    const current = existing?.[key];
    const incoming = input?.[key];
    if (incoming === undefined) {
      if (current !== undefined) params[key] = current;
      continue;
    }
    if (incoming === null || incoming === '') continue;
    const parsed = samplingValue(key, incoming);
    if (!parsed.ok) {
      // Refused, never clamped, exactly like the parser — but the parser has nothing to fall back on,
      // so it reports "not set", while a write must keep the value the file already carries.
      console.warn(`[dsh-codex-ui] persona ${key}=${incoming} 不合法（应为${samplingRange(key)}），ignoring this change and keeping the previous value`);
      if (current !== undefined) params[key] = current;
      continue;
    }
    params[key] = parsed.value;
  }
  return params;
}

/**
 * Parse one file. Only the documented keys are read, and a wrong value degrades to its default
 * instead of failing the file: a typo in `order:` must not make a persona vanish.
 */
function parsePersona(file, stem) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const meta = Object.create(null);
  let bodyStart = 0;
  let hasFrontmatter = false;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (close > 0) {
      hasFrontmatter = true;
      for (const line of lines.slice(1, close)) {
        const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
        if (match) meta[match[1].toLowerCase()] = unquote(match[2]);
      }
      bodyStart = close + 1;
    } else {
      // An unclosed block is more likely a horizontal rule in ordinary Markdown than a frontmatter;
      // treat the whole file as body rather than dropping the persona.
      console.warn(`[dsh-codex-ui] persona ${stem}${EXTENSION}: frontmatter 未闭合，整篇按正文处理`);
    }
  }
  const text = lines.slice(bodyStart).join('\n').trim();
  const order = Number.parseInt(meta.order ?? '', 10);
  return {
    id: stem,
    name: meta.name || stem,
    // A file that declares a frontmatter but no description gets its first body line, because that
    // is what the menu shows; a bare Markdown file keeps the empty default instead of guessing.
    description: meta.description || (hasFrontmatter ? deriveDescription(text) : ''),
    order: Number.isFinite(order) ? order : DEFAULT_ORDER,
    enabled: meta.enabled === undefined ? true : !/^(false|no|0|off)$/i.test(meta.enabled),
    text,
    builtin: false,
    params: parseSampling(meta, stem),
  };
}

/** The `.md` files in the directory, newest state of the disk each call. */
function markdownFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.length > EXTENSION.length && entry.name.toLowerCase().endsWith(EXTENSION))
      .map(entry => entry.name);
  } catch (error) {
    console.warn(`[dsh-codex-ui] personas directory unreadable: ${String(error)}`);
    return [];
  }
}

/**
 * Dictated order for files whose names differ only by case, so the two spellings cannot become two
 * personas: same lowercase stem first, and the all-lowercase spelling wins the tie.
 */
function compareFileNames(a, b) {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
  const plainA = a === lowerA;
  const plainB = b === lowerB;
  if (plainA !== plainB) return plainA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The persona file that already owns this id in any letter case, or null. */
function findFile(dir, stem) {
  const wanted = `${stem}${EXTENSION}`.toLowerCase();
  try {
    return readdirSync(dir).find(name => name.toLowerCase() === wanted) ?? null;
  } catch {
    return null;
  }
}

/** Seed `codex.md` from the source prompt the first time the directory has no Codex persona. */
function seedIfMissing(dir, seed) {
  if (findFile(dir, CODEX_ID) !== null) return false;
  mkdirSync(dir, { recursive: true });
  const text = typeof seed === 'string' && seed.length > 0 ? seed : readSeedText();
  writeAtomically(join(dir, CODEX_FILE), formatPersona({
    name: CODEX_NAME,
    description: CODEX_DESCRIPTION,
    order: CODEX_ORDER,
    enabled: true,
    text,
  }));
  return true;
}

/**
 * Create the directory and its Codex seed. Idempotent, and callers hand in the prompt constant so
 * only one copy of the seed text exists in the process.
 */
export async function ensurePersonasDir(seed) {
  const dir = personasDir();
  if (dir === null) return null;
  await mkdir(dir, { recursive: true });
  seedIfMissing(dir, seed);
  return dir;
}

/** Order: by `order`, then by name; the built-in row always first. */
function comparePersonas(a, b) {
  const rank = item => (item.id === BUILTIN_ID ? -1e9 : item.order);
  const byOrder = rank(a) - rank(b);
  if (byOrder !== 0) return byOrder;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * Every persona that should be offered and injected, built-ins included. Synchronous on purpose:
 * the system-prompt section is assembled synchronously on every turn, so the disk is read here.
 */
export function loadPersonas() {
  const dir = personasDir();
  const personas = [];
  if (dir !== null) {
    try {
      seedIfMissing(dir);
    } catch (error) {
      // A read-only home must not cost the built-in styles: the synthetic Codex row below covers it.
      console.warn(`[dsh-codex-ui] persona seed failed: ${String(error)}`);
    }
    const seen = new Set([BUILTIN_ID.toLowerCase()]);
    for (const name of markdownFiles(dir).sort(compareFileNames)) {
      const stem = name.slice(0, -EXTENSION.length);
      const key = stem.toLowerCase();
      if (seen.has(key)) {
        console.warn(`[dsh-codex-ui] persona ${name}: 与已存在的人设 id 重复，已跳过`);
        continue;
      }
      seen.add(key);
      try {
        personas.push(parsePersona(join(dir, name), stem));
      } catch (error) {
        console.warn(`[dsh-codex-ui] persona ${name}: 解析失败，已跳过（${String(error)}）`);
      }
    }
  }
  // Disabled files are neither listed nor injected; they stay on disk so the user can switch them back.
  const enabled = personas.filter(item => item.enabled);
  // `codex` is the one exception, because the header rule outranks this one: every session that never
  // picked a style persists the literal string `Codex`, and this function runs inside the prompt
  // assembly of every turn — a `codex` that stops resolving makes those sessions unswitchable and
  // silently drops their prompt. So the fallback keys on "does it still resolve", not on "does the
  // file exist": a `codex.md` the user disabled still yields the Codex row, with its own body kept so
  // edits survive, seeded from the old constant if the file is gone entirely.
  if (!enabled.some(item => item.id.toLowerCase() === CODEX_ID)) {
    const disabledCodex = personas.find(item => item.id.toLowerCase() === CODEX_ID);
    enabled.push({
      id: CODEX_ID,
      name: CODEX_NAME,
      description: CODEX_DESCRIPTION,
      order: CODEX_ORDER,
      enabled: true,
      text: disabledCodex?.text || readSeedText(),
      builtin: true,
      // Its sampling block survives the disable for the same reason its body does: un-hiding a
      // persona must not quietly drop settings the user chose.
      params: disabledCodex?.params ?? {},
    });
  }
  return [builtinSentinel(), ...enabled].sort(comparePersonas);
}

/** The list the interface gets: no bodies, because the client never needs them. */
export function listPersonas() {
  return loadPersonas().map(({ id, name, description, order, enabled, builtin }) => ({ id, name, description, order, enabled, builtin }));
}

/**
 * Id resolution for stored values: exact first, then letter-case-insensitive. This is what makes
 * the `Codex` a session persisted resolve to `codex.md`, and `deepseek` to the built-in row.
 */
export function resolvePersonaId(id) {
  if (typeof id !== 'string') return null;
  const needle = id.trim();
  if (needle.length === 0) return null;
  const personas = loadPersonas();
  const exact = personas.find(item => item.id === needle);
  if (exact) return exact.id;
  const lower = needle.toLowerCase();
  const match = personas.find(item => item.id.toLowerCase() === lower);
  return match ? match.id : null;
}

/** The body a persona injects; the empty string for the built-in row and for unknown ids. */
export function textFor(id) {
  const needle = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (needle.length === 0) return '';
  const found = loadPersonas().find(item => item.id.toLowerCase() === needle);
  return typeof found?.text === 'string' ? found.text : '';
}

/**
 * The sampling parameters one persona asks for, e.g. `{ temperature: 0.7, top_p: 0.95 }`.
 *
 * Only keys the file actually sets are present, so a caller tests `'temperature' in params` rather
 * than comparing against a default: "not set" and "set to 0" are different requests. The built-in
 * `DeepSeek` row is the native prompt with nothing added, so it never asks for anything. Unknown
 * ids get `{}` for the same reason `textFor` gets `''` — a stale stored mode must not fail a turn.
 */
export function paramsFor(id) {
  const needle = typeof id === 'string' ? id.trim().toLowerCase() : '';
  if (needle.length === 0 || needle === BUILTIN_ID.toLowerCase()) return {};
  const found = loadPersonas().find(item => item.id.toLowerCase() === needle);
  return found === undefined ? {} : { ...found.params };
}

/**
 * Read one persona straight off the disk, for the editor. `textFor` is the *injection* view and hides
 * disabled personas; an editor built on it would show an empty box for a hidden persona and then let
 * a save write that emptiness back. This answers "what does the file say", and returns the stem the
 * file actually has on disk, so the caller never receives a casing the menu cannot match.
 */
export function readPersonaFile(id) {
  const dir = personasDir();
  if (dir === null) return null;
  const requested = typeof id === 'string' ? id.trim() : '';
  if (requested.length === 0) return null;
  const file = findFile(dir, requested);
  if (file === null) return null;
  const stem = file.slice(0, -EXTENSION.length);
  try {
    const persona = parsePersona(join(dir, file), stem);
    // The sampling block rides as `persona` rather than as flat keys: the client half of the editor
    // reads `value?.persona ?? value`, so the route can keep returning `found` as-is instead of
    // projecting the same file a second time. The field is attached only when the file actually sets
    // something, because a persona without sampling keys must keep answering exactly `{ id, text }`
    // — that shape is what the editor and the existing tests already consume.
    const params = persona.params;
    return Object.keys(params).length === 0
      ? { id: stem, text: persona.text }
      : { id: stem, text: persona.text, persona: params };
  } catch (error) {
    console.warn(`[dsh-codex-ui] persona ${file}: 读取失败（${String(error)}）`);
    return null;
  }
}

/**
 * Write one persona: create when the file is new, update in place when it exists. Every field the
 * caller omits is taken from the file, not from a default, so a partial edit cannot quietly reset
 * something the user set — including on a persona that is currently hidden from the menu.
 */
export function writePersona(input) {
  const dir = personasDir();
  if (dir === null) throw personaError('persona/no-home', 'DSH_HOME 未设置，无法保存人设。');
  const requested = String(input?.id ?? '').trim();
  if (requested.length === 0) throw personaError('persona/invalid', '缺失人设标识。');
  // The id becomes a file name: separators and the characters Windows rejects are removed, not escaped.
  const stem = requested.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();
  if (stem.length === 0 || stem === '.' || stem === '..') throw personaError('persona/invalid', '人设标识无效。');
  if (stem.toLowerCase() === BUILTIN_ID.toLowerCase()) throw personaError('persona/protected', '内置 DeepSeek 人设不可写入。');
  mkdirSync(dir, { recursive: true });
  const existingFile = findFile(dir, stem);
  // Read the file directly, not through `loadPersonas`: that list is the *offered* set, so it drops
  // disabled personas, and taking `existing` from it left a partial update of a hidden persona with
  // nothing to fall back on — the body was blanked, `order` reset and `enabled` flipped back on.
  // The stem is taken from the file on disk rather than from the request, so an update asked for in a
  // different casing still returns the id the menu knows.
  let existing = null;
  if (existingFile !== null) {
    try {
      existing = parsePersona(join(dir, existingFile), existingFile.slice(0, -EXTENSION.length));
    } catch (error) {
      // Only "it vanished between the listing and the read" means create. Anything else — EPERM,
      // EISDIR, a decode failure — is a file that certainly exists and merely cannot be read right
      // now; falling through to create would replace it with nothing but defaults.
      if (error?.code !== 'ENOENT') throw error;
      console.warn(`[dsh-codex-ui] persona ${existingFile}: 读取时已消失，按新建处理`);
    }
  }
  const name = oneLine(input?.name) || existing?.name || stem;
  const description = input?.description === undefined ? existing?.description ?? '' : oneLine(input.description);
  const order = Number.isFinite(input?.order) ? input.order : existing?.order ?? DEFAULT_ORDER;
  const enabled = typeof input?.enabled === 'boolean' ? input.enabled : existing?.enabled ?? true;
  const file = existingFile ?? `${stem}${EXTENSION}`;
  // Omitted means "leave it alone", the same as the four fields above. `?? ''` here would have turned
  // any partial update — a rename, a re-description — into an empty persona body, and the whole point
  // of this file is that the body is the part the user actually wrote.
  const text = input?.text === undefined ? existing?.text ?? '' : input.text;
  // Sampling keys arrive flat (`temperature`, `top_p`, …) exactly as the editor sends them, and obey
  // the same omission rule: the ones the request leaves out keep what the file already has.
  const params = mergeSampling(input, existing?.params ?? {});
  writeAtomically(join(dir, file), formatPersona({ name, description, order, enabled, text, params }));
  return { id: existing?.id ?? stem };
}

/** Remove one persona file. The built-in row and `codex` are the two the plugin itself depends on. */
export function deletePersona(id) {
  const dir = personasDir();
  // Home first: this check used to sit after `resolvePersonaId`, which already returns null without a
  // home, so the specific error was unreachable and the caller always saw "not found" instead.
  if (dir === null) throw personaError('persona/no-home', 'DSH_HOME 未设置，无法删除人设。');
  const requested = typeof id === 'string' ? id.trim() : '';
  if (requested.length === 0) throw personaError('persona/invalid', '缺失人设标识。');
  // Protection and existence are judged on the name the caller gave, not on the offered list: a
  // disabled persona is still a file the user may want gone, and `resolvePersonaId` cannot see one.
  const key = requested.toLowerCase();
  if (key === BUILTIN_ID.toLowerCase()) throw personaError('persona/protected', '内置 DeepSeek 人设不可删除。');
  if (key === CODEX_ID) throw personaError('persona/protected', 'Codex 人设不可删除。');
  const file = findFile(dir, requested);
  if (file === null) throw personaError('persona/not-found', '人设不存在。');
  unlinkSync(join(dir, file));
  return { id: file.slice(0, -EXTENSION.length) };
}
