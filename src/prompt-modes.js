import { presetSilences, SECTION_MANDATE } from './turbo-policy.js';
import { BUILTIN_ID, deletePersona, ensurePersonasDir, listPersonas, loadPersonas, readPersonaFile, resolvePersonaId, textFor, writePersona } from './personas.js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const MODE_KEY = 'cgPromptMode';
export const MODE_EVENT = 'chatgpt-ui/prompt-mode';
export const PERSONA_EVENT = 'chatgpt-ui/personas';
export const PERSONA_PATH = '/api/chatgpt-ui/personas';
/**
 * The prompt this plugin used to hard-code. Still exported because `tests/prompt-modes.test.mjs` and
 * older consumers import it, and still the seed source: `apply` hands it to `ensurePersonasDir`, so
 * the first `codex.md` on a machine is written from exactly this text.
 */
export const CODEX_PROMPT = readFileSync(new URL('../prompts/codex.txt', import.meta.url), 'utf8').trim();
/** 侧栏快捷项的安装说明。系统提示词里交给 Agent 的必须是绝对路径，它才能直接打开。 */
const RAIL_GUIDE_URL = new URL('../SIDEBAR-RAIL.zh.md', import.meta.url);
// A persona id is now any file stem, so the stored value can no longer be an enum. What keeps a
// stale or mistyped value out is the whitelist in `selectMode`, not the schema: the projection has to
// parse whatever an older build persisted (`DeepSeek`, `Codex`), or one bad row would stop every
// `apply` that follows this one from ever registering.
const modeSchema = z.string().min(1).max(64);
const selectionSchema = z.object({ sessionId: z.string().min(1).max(256), mode: modeSchema.optional(), action: z.enum(['read', 'select']).default('select') }).strict();
const requestSchema = z.object({ type: z.literal('client-request'), rpcId: z.string().min(1).max(256), method: z.literal(MODE_EVENT), payload: z.unknown() }).strict();
// The persona endpoint accepts the same envelope but does not pin `method`: the client half of this
// feature is shipped separately and a mismatch there would 404 the whole menu.
const personaRequestSchema = z.object({ type: z.literal('client-request'), rpcId: z.string().min(1).max(256), method: z.string().min(1).max(128).optional(), payload: z.unknown() });
const personaPayloadSchema = z.object({
  action: z.enum(['create', 'delete', 'list', 'read', 'update']),
  id: z.string().min(1).max(128).optional(),
  name: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  text: z.string().max(200000).optional(),
  // Sampling parameters belong to the persona, so they travel with its file rather than with the
  // session. Numbers only: `writePersona` does the range checking and drops a bad value with a warning
  // instead of failing the request, because one out-of-range number must not cost the whole edit.
  temperature: z.number().nullable().optional(),
  top_p: z.number().nullable().optional(),
  max_tokens: z.number().nullable().optional(),
});

/** `name` -> file stem: lowercase, spaces to dashes, and the characters a Windows file name rejects. */
function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[\s-]+|[\s-]+$/g, '');
}

/**
 * The row in the `sessions` table that remembers the persona the user picked last.
 *
 * Why a row and not a global key: this unit is declared `hasGlobal: false`, and that declaration is
 * not a lever — the storage layer builds the unit from it, so flipping it would discard every stored
 * mode. Why not "take the newest session row instead": a row is only `id -> mode`, there is no
 * timestamp to sort by, and stamping one would change the value shape `stateVersion: 1` promises to
 * keep readable for the rows already on disk. Collision: every Session id the host mints carries a
 * `session-` segment (`session-<n>` from the store, `session-<uuid>` on disk), the purge route's own
 * `SESSION_ID` guard requires a leading alphanumeric, and the workspace UI only reuses ids it already
 * holds — nothing in the product names a Session `__last__`. Pollution: every reader of this table
 * looks a row up by Session id, so the row is dropped at load and never reaches the `modes` map.
 */
const LAST_MODE_KEY = '__last__';
/** The id every unset path has always fallen back to; `codex` always resolves. */
const DEFAULT_MODE = 'Codex';

/**
 * The persona the user picked last, mirrored from `sessions[LAST_MODE_KEY]`, or null before `apply`
 * has read the unit — being null is what makes a brand-new profile answer `Codex`.
 *
 * Module-level because `init` is synchronous and is called while the registry builds a Session's cell,
 * long after `apply` loaded the row, and without a handle to the unit.
 */
let lastMode = null;

/**
 * The persona one live Session resolves to, or null before `apply` has run. Exported as a function
 * rather than as the `modes` map: that map is activation state, and handing it out would let a
 * reader mutate the record the plugin writes.
 */
let modeLookup = null;
export function currentModeOf(session) {
  if (typeof modeLookup !== 'function' || !session) return null;
  try { return modeLookup(session); } catch { return null; }
}

/**
 * The persona body in force for one Session, or '' when it carries none (the built-in `DeepSeek`
 * row, an empty file, or a Session this process has not resolved yet).
 *
 * Exported because `turbo.js` needs the same answer for a different decision: 「聊天/工作」is a
 * generic voice template (`CHAT_PERSONA` / `WORK_PERSONA`) delivered as a `pre-step` message, i.e.
 * *nearer* the newest turn than the system-prompt section this file owns — so the two together read
 * as "the persona was ignored", with the template winning. Whoever holds the concrete persona is the
 * one that should speak, and this is how `turbo.js` asks whether that is the case.
 */
export function personaTextOf(session) {
  const mode = currentModeOf(session);
  if (typeof mode !== 'string' || mode.trim() === '') return '';
  try { return textFor(mode); } catch { return ''; }
}

/**
 * `init`'s answer: a new Session continues on the persona the user chose last.
 *
 * The stored id is re-resolved rather than trusted. The persona it names may have been deleted or
 * disabled since it was chosen, and answering with such an id would both inject nothing (it is not in
 * the offered set) and make the menu display a persona that no longer exists. `resolvePersonaId` is
 * the same whitelist `selectMode` checks on the way in and it is synchronous; `Codex` is the fallback
 * because it is the one id that always resolves, so this function cannot itself fail.
 */
function defaultMode() {
  if (typeof lastMode !== 'string' || lastMode.length === 0) return DEFAULT_MODE;
  try {
    // The projection's own view schema caps an id at 64 characters, while `resolvePersonaId` returns
    // the stem of whatever markdown file is on disk — including one the user named by hand with more
    // than 64. A value that long would make `snapshot()` throw, and the query layer wraps that into
    // SESSION_QUERY_CORRUPT_SESSION for the entire session list, so the length is checked here rather
    // than trusted from the filename.
    const resolved = resolvePersonaId(lastMode);
    if (typeof resolved !== 'string' || resolved.length === 0 || resolved.length > 64) return DEFAULT_MODE;
    return resolved;
  } catch {
    return DEFAULT_MODE;
  }
}

// Read legacy mode events; all new choices use a dedicated durable KV unit.
// The default mode is the last persona the user picked, and Codex while none has been picked: a
// session with no stored choice of its own (neither the KV record nor a legacy event) resolves to it,
// so its prompt section is appended from the first turn on.
export const modeProjection = {
  key: MODE_KEY,
  stateSchema: modeSchema,
  stateVersion: 1,
  init: () => defaultMode(),
  apply: (state, event) => event.type === MODE_EVENT ? modeSchema.parse(event.data.mode) : state,
  wire: { viewSchema: modeSchema, view: state => state },
};

// 'webServer' 是 3.0.1 为并入的回复锻造加的：它要注册 /api/reply-forge-v3/* 路由。
// 宿主缺这个服务时插件照常加载，只是那条能力自然失效（见 reply-forge/index.mjs）。
export const inject = ['systemPrompt', 'sessionProjections', 'sessionController', 'sessions', 'webServer', 'connection', 'storage', 'storage.backend.json'];

export async function apply(ctx) {
  // First, because the section below reads the directory on every turn: create it and write the
  // Codex seed once. A failure here only costs the files; the fallback row in `loadPersonas` keeps
  // the default style working, so it must never stop the rest of `apply` from running.
  try {
    await ensurePersonasDir(CODEX_PROMPT);
  } catch (error) {
    console.warn(`[dsh-codex-ui] personas directory unavailable: ${String(error)}`);
  }
  const unit = await ctx.storage.backend.get('json').kv.open({ name: 'chatgpt_ui_modes', version: 1, tables: ['sessions'], hasGlobal: false });
  const saved = (await unit.loadAll()).tables.sessions;
  // The last-used row seeds `init`. Read here and skipped below, because `modes` holds Sessions and
  // every reader of that map looks an entry up by a real Session id. A missing, malformed or
  // over-long row leaves `lastMode` null, which `defaultMode` answers with `Codex` — a first boot
  // must never hand the projection an undefined state.
  const storedLast = modeSchema.safeParse(saved[LAST_MODE_KEY]);
  lastMode = storedLast.success ? storedLast.data : null;
  // One unreadable row is skipped rather than thrown: `lib/index.js` awaits this function before it
  // registers balance, turbo, purge and identity, so a single bad value would disable all of them.
  const modes = new Map(Object.entries(saved).flatMap(([id, mode]) => {
    if (id === LAST_MODE_KEY) return [];
    const parsed = modeSchema.safeParse(mode);
    if (parsed.success) return [[id, parsed.data]];
    console.warn(`[dsh-codex-ui] prompt mode row ignored: ${id} -> ${String(mode).slice(0, 64)}`);
    return [];
  }));
  let writes = Promise.resolve();
  ctx.effect(() => async () => { await writes.catch(() => {}); await unit.close(); });
  /**
   * Every id this build can inject right now, lowercased. Null when the directory cannot be read at
   * all, which is the one case where a stored value must be trusted: an unreadable home is not
   * evidence that the persona the user picked is gone.
   */
  function livePersonaIds() {
    try {
      return new Set(loadPersonas().map(item => item.id.toLowerCase()));
    } catch {
      return null;
    }
  }
  /** Sessions already healed below, so a dead row is rewritten once instead of on every assembly. */
  const healed = new Set();
  /**
   * The persona a Session actually resolves to.
   *
   * The stored value is checked before it is used. It can name a persona that is gone — the file was
   * deleted or renamed after the switch, or an older build wrote something that was never an id (one
   * row on this machine reads `1`). `textFor` answers '' for those, so the section renders zero bytes
   * and the Session silently loses its style while the menu keeps showing the old name: that is the
   * "the model forgot my persona" report, and it is invisible from both ends. A dead value is
   * therefore replaced by `Codex` — the one id that always resolves — and written back, so the loss
   * is repaired rather than repeated on every turn.
   */
  const modeFor = session => {
    const stored = modes.get(session.id) ?? ctx.sessionProjections.stateOf(session, MODE_KEY) ?? DEFAULT_MODE;
    const live = livePersonaIds();
    const known = typeof stored === 'string' && stored.trim() !== '';
    if (live === null || (known && live.has(stored.trim().toLowerCase()))) return stored;
    if (healed.has(session.id)) return DEFAULT_MODE;
    healed.add(session.id);
    modes.set(session.id, DEFAULT_MODE);
    writes = writes.catch(() => {}).then(() => unit.putRecord('sessions', session.id, DEFAULT_MODE));
    writes.catch(error => ctx.logger?.warn?.(`prompt mode heal save failed: ${error.message}`));
    ctx.logger?.warn?.(`prompt mode row healed: ${session.id} -> ${DEFAULT_MODE}（原值 ${String(stored).slice(0, 64)} 已不存在）`);
    return DEFAULT_MODE;
  };
  // Hand the same resolution to `persona-notice.js`: it has to answer "which persona is in force
  // for this session right now" on every pre-step, and duplicating the lookup would let the two
  // answers drift (the durable row and the projection are updated by different callers).
  modeLookup = modeFor;
  ctx.sessionProjections.register(modeProjection);
  ctx.on('session/created', session => {
    const parent = session.header.isSeeded && session.header.parentSession;
    if (!parent || modes.has(session.id) || !modes.has(parent)) return;
    const mode = modes.get(parent);
    modes.set(session.id, mode);
    writes = writes.catch(() => {}).then(() => unit.putRecord('sessions', session.id, mode));
    writes.catch(error => ctx.logger.warn(`prompt mode fork save failed: ${error.message}`));
  });
  // 人设正文不再从这里注入。宿主 `@deepseek-ai/dsh-system-prompt@0.2.1-rc.2` 的
  // `AssembleContext` 只有 `{ scope, signal }`——**没有 agent**，而 section 的 text 回调只能拿到这个
  // context。原先这里写的是 `text: ({ agent }) => { if (!agent) return ''; … }`，于是 `agent` 恒为
  // undefined，这段每次组装都返回空串：正文一次都没进过系统提示，界面上却只有「人设仍在生效」
  // 在说好话。模型的思考记录里写着「我实际收到的系统提示里没有明显的人设正文段落」，就是它。
  // 正文改由 `persona-reminder.js` 在 `agent/pre-step` 每轮送出——那条路 `payload.agent` 是齐的，
  // 而且作为最新一条消息，位置比系统提示更靠后，"时刻遵守"反而是它更强。
  // 这里不再注册一个永远产出空串的 section：留着它只会让人以为它在工作。

  // 用户在会话里说「帮我在侧栏加个 XX」时，Agent 得知道去哪读说明书——它没有别的途径知道
  // 这个插件带了文档。路径从本文件的位置推，装到哪个 profile、目录叫什么名字都对；写死一个
  // 绝对路径，换个安装位置就指丢了（和上面 prompts/codex.txt 是同一个路子）。
  // 常驻三行值得：让 Agent 凭空猜一个 panel key，代价是用户点了没反应还得回来问。
  // 文档被删掉时干脆不挂这一段——指向一个不存在的文件，比不给路径更糟。
  const railGuide = fileURLToPath(RAIL_GUIDE_URL);
  if (existsSync(railGuide)) {
    ctx.systemPrompt.section({
      name: 'chatgpt-ui:sidebar-rail',
      order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 2,
      interpolate: false,
      text: () => [
        '### 侧栏快捷项（dsh-codex-ui）',
        `用户在会话里提出「往左侧栏加一个按钮」「换个侧栏快捷方式」「把侧栏那个删掉」这类要求时，按这个顺序做，不要跳过前两步：`,
        `1. 先完整读 ${railGuide}，照里面的步骤做，不要凭记忆猜格式；`,
        '2. 读完再来问用户：点下去希望看到什么（DSH 里已有的界面 / 设置里的某一页 / 一个网址 / 打开电脑上的某个程序）、叫什么名字、要不要占用侧栏那三个位子之一；',
        '3. 拿到他的答案再调用 sidebar_rail 去装。他答得含糊就再问一句，别自己替他选。',
      ].join('\n'),
    });
  }

  // Use DSH's authenticated Connection carrier; no extra HTTP server or token.
  async function selectMode(payload, signal) {
    const parsed = selectionSchema.safeParse(payload);
    const fail = (code, message, details = {}) => ({ ok: false, error: { code, message, details } });
    if (!parsed.success) return fail('prompt-mode/invalid', '模式参数无效。');
    const { sessionId, mode, action } = parsed.data;
    try {
      signal.throwIfAborted();
      if (action === 'read') {
        const session = ctx.sessions.get(sessionId);
        if (session) return { ok: true, value: { sessionId, mode: modeFor(session) } };
        const inspection = await ctx.sessionController.inspect(sessionId, signal);
        const legacy = inspection.events.findLast(event => event.type === MODE_EVENT)?.data.mode;
        return { ok: true, value: { sessionId, mode: modes.get(sessionId) ?? modeSchema.parse(legacy ?? 'Codex') } };
      }
      if (mode === undefined) return fail('prompt-mode/invalid', '缺少模式参数。');
      // The id has to name a persona this build can inject. Rejecting it here — before `resolveAgent`,
      // before the KV write — is what keeps a stale or mistyped value out of both the session row and
      // the durable record, while the schema itself stays permissive enough to read what 1.x stored.
      if (resolvePersonaId(mode) === null) return fail('prompt-mode/unknown', '未知的回复模式。');
      const resolved = await ctx.sessionController.resolveAgent(sessionId);
      if (resolved.error) return fail(resolved.error.code, resolved.error.message, resolved.error.details);
      const { agent } = resolved;
      if (agent.status !== 'idle') return fail('prompt-mode/busy', '请等待当前回复完成后再切换模式。');
      // Hold the idle phase through durability: a new turn cannot race this write.
      return await agent.runMaintenance(async maintenanceSignal => {
        signal.throwIfAborted();
        maintenanceSignal.throwIfAborted();
        const write = writes.catch(() => {}).then(async () => {
          await unit.putRecord('sessions', sessionId, mode);
          modes.set(sessionId, mode);
          lastMode = mode;
          // The row above is what this Session answers with; the last-used row only tells the next
          // new Session where to start, so its failure is logged instead of turned into an error —
          // the switch has already committed, and reporting failure here would leave the menu
          // disagreeing with the host about a mode that is in fact in force.
          await unit.putRecord('sessions', LAST_MODE_KEY, mode)
            .catch(error => ctx.logger?.warn?.(`prompt mode last-used save failed: ${error.message}`));
        });
        writes = write;
        await write;
        return { ok: true, value: { sessionId, mode } };
      });
    } catch (error) {
      return fail('prompt-mode/failed', error.message || String(error));
    }
  }
  /**
   * The persona menu: one route for list / create / update / delete. Every failure is a value, never a
   * throw, so a bad payload cannot take the carrier down with it.
   */
  function handlePersonas(payload) {
    const fail = (code, message) => ({ ok: false, error: { code, message } });
    const parsed = personaPayloadSchema.safeParse(payload);
    if (!parsed.success) return fail('persona/invalid', '人设参数无效。');
    const { action, id, name, description, text, temperature, top_p, max_tokens } = parsed.data;
    try {
      if (action === 'list') return { ok: true, value: { personas: listPersonas() } };
      // Editing a persona needs its body, and a persona body can be thousands of characters — far
      // too much to ship inside every `list`. The editor reads the one it is about to open, and it
      // reads it from the file rather than from the list: `resolvePersonaId`/`textFor` answer "what
      // gets injected", so they hide a disabled persona, and being disabled is not being deleted —
      // a hidden persona still has to open in the editor, or the user can never re-enable it. The
      // file read also returns the stem the file really has on disk, which is the id the menu knows.
      if (action === 'read') {
        const found = readPersonaFile(id ?? '');
        if (found === null) return fail('persona/not-found', '人设不存在。');
        return { ok: true, value: found };
      }
      if (action === 'create') {
        const label = (name ?? '').trim();
        if (label === '') return fail('persona/invalid', '缺少人设名称。');
        const stem = slugify(label);
        if (stem === '') return fail('persona/invalid', '人设名称无法生成标识。');
        // The id travels back as the `mode` value, whose schema caps at 64: a longer one would be
        // creatable and unselectable at the same time.
        if (stem.length > 64) return fail('persona/invalid', '人设标识过长（最多 64 字符）。');
        // Case-insensitive on purpose: `Codex` and `codex.md` are the same persona.
        if (resolvePersonaId(stem) !== null) return fail('persona/exists', '同名或同标识的人设已存在。');
        return { ok: true, value: { id: writePersona({ id: stem, name: label, description, text, temperature, top_p, max_tokens }).id } };
      }
      if (action === 'update') {
        // Protection before existence: the built-in row has no file, so a file lookup would report it
        // missing and the caller would never learn that it is protected.
        if (String(id ?? '').trim().toLowerCase() === BUILTIN_ID.toLowerCase()) return fail('persona/protected', '内置 DeepSeek 人设不可修改。');
        const target = readPersonaFile(id ?? '');
        if (target === null) return fail('persona/not-found', '人设不存在。');
        return { ok: true, value: { id: writePersona({ id: target.id, name, description, text, temperature, top_p, max_tokens }).id } };
      }
      // Explicit rather than a fallthrough: this arm used to be the tail of the function, so any
      // action it did not recognise arrived here and deleted the persona it was given.
      if (action === 'delete') {
        const removed = deletePersona(id ?? '');
        // 删文件不等于删引用。指过去那个 id 的会话仍留着它，`textFor` 又只会回答空串，
        // 于是那些会话静默失去风格、菜单却还显示旧名字——本机就有两条这样的历史记录。
        // 删除是这个问题的源头，就在源头把它们迁到 Codex（唯一恒可解析的 id）。
        const gone = typeof removed?.id === 'string' ? removed.id.trim().toLowerCase() : '';
        if (gone !== '') {
          for (const [sessionId, mode] of modes) {
            if (typeof mode !== 'string' || mode.trim().toLowerCase() !== gone) continue;
            modes.set(sessionId, DEFAULT_MODE);
            writes = writes.catch(() => {}).then(() => unit.putRecord('sessions', sessionId, DEFAULT_MODE));
            writes.catch(error => ctx.logger?.warn?.(`prompt mode migrate failed: ${error.message}`));
          }
          // 「上次选择」也指过去时就一起改，否则下一个新会话会从一个不存在的人设开局。
          if (typeof lastMode === 'string' && lastMode.trim().toLowerCase() === gone) {
            lastMode = DEFAULT_MODE;
            writes = writes.catch(() => {}).then(() => unit.putRecord('sessions', LAST_MODE_KEY, DEFAULT_MODE));
            writes.catch(error => ctx.logger?.warn?.(`prompt mode last-used migrate failed: ${error.message}`));
          }
        }
        return { ok: true };
      }
      return fail('persona/invalid', '未知的人设操作。');
    } catch (error) {
      return fail(error?.code ?? 'persona/failed', error?.message || String(error));
    }
  }

  ctx.connection.fetch.register({
    path: '/api/chatgpt-ui/prompt-mode', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try { envelope = requestSchema.parse(await request.json()); }
      catch { return Response.json({ error: 'Invalid mode request' }, { status: 400 }); }
      const result = await selectMode(envelope.payload, request.signal);
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result });
    },
  });
  // The persona menu rides a second route. It is registered through the soft `connection` dependency
  // rather than directly: the carrier is already hard-required above, and a host that composes none
  // must keep working with the menu simply unrouted (a bare `ctx.inject` check costs nothing).
  ctx.inject?.(['connection'], scope => scope.connection.fetch.register({
    path: PERSONA_PATH, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try { envelope = personaRequestSchema.parse(await request.json()); }
      catch { return Response.json({ error: 'Invalid persona request' }, { status: 400 }); }
      const result = handlePersonas(envelope.payload);
      return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result });
    },
  }));
}
