/**
 * The name the assistant answers to.
 *
 * The displayed name of a model lives on the Client: the owner's own name (localStorage, keyed by
 * `provider/model`) and the catalog names the model menu prints. The system prompt is assembled on the
 * Host, so the two halves are joined the same way every other route in this plugin is: the Client
 * pushes both maps over the authenticated Connection carrier, the Host keeps them and resolves the
 * running model against them on every assembly.
 *
 * The section is empty for a model with no name anywhere, so an untouched install behaves exactly as
 * before: nothing is claimed about the model.
 */
import { writeFileSync } from 'node:fs';
import { writeIdentityStatus } from './identity-status.js';

export const ALIAS_ROUTE = '/api';
export const ALIAS_EVENT = 'dsh-codex-ui/model-aliases';

let aliases = Object.create(null);
let catalogNames = Object.create(null);

const keyOf = (provider, model) => `${provider}/${model}`;

/** Both maps, for tests and for persistence. */
export function currentAliases() {
  return { aliases: { ...aliases }, names: { ...catalogNames } };
}

/**
 * Replace the maps. `aliases` are names the owner typed, `names` the ones the model menu prints from
 * the catalog. The payload arrives over the wire, so its shape is validated rather than trusted.
 */
export function setAliases(nextAliases, nextNames) {
  const clean = (source, cap) => {
    const out = Object.create(null);
    if (source !== null && typeof source === 'object' && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source)) {
        if (typeof key !== 'string' || key === '') continue;
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        if (trimmed === '') continue;
        out[key] = trimmed.slice(0, cap);
      }
    }
    return out;
  };
  // One object `{ aliases, names }` is the current shape; two arguments are accepted for older callers.
  const payload = nextNames === undefined && nextAliases !== null && typeof nextAliases === 'object' && 'aliases' in nextAliases
    ? nextAliases
    : { aliases: nextAliases, names: nextNames };
  aliases = clean(payload.aliases, 120);
  catalogNames = clean(payload.names, 120);
  return currentAliases();
}

/**
 * The prompt text for one selection. Exported and pure so the wording is a tested fact rather than
 * something to re-derive by reading the section registration.
 *
 * The owner's own name wins over the catalog's, and either beats saying nothing. That order is the
 * point: a model whose displayed name comes from the catalog ("GPT-6 Astra") produced an empty
 * section before, so the assistant answered with whatever its own identity line happened to say.
 */
export function identityText(selection, table = aliases, names = catalogNames) {
  const provider = typeof selection?.provider === 'string' ? selection.provider : '';
  const model = typeof selection?.model === 'string' ? selection.model : '';
  if (provider === '' || model === '') return '';
  const key = keyOf(provider, model);
  // Exact `provider/model` first, then the model id alone — but only when every key carrying that id
  // agrees, so one account's name is never pinned onto another account's model. The fallback exists
  // because the provider string the Host reports for a running model and the provider id in the model
  // catalog are not guaranteed to be the same string, and that kind of miss is invisible in the UI.
  const lookup = source => {
    const exact = source?.[key];
    if (typeof exact === 'string' && exact !== '') return exact;
    const matches = new Set();
    for (const [candidate, value] of Object.entries(source ?? {})) {
      if (typeof value !== 'string' || value === '') continue;
      if (candidate.endsWith(`/${model}`)) matches.add(value);
    }
    return matches.size === 1 ? [...matches][0] : null;
  };
  const own = lookup(table);
  const fromCatalog = own === null ? lookup(names) : null;
  const name = own ?? fromCatalog;
  if (name === null) return '';
  return [
    '## 模型身份（运行环境指定）',
    '',
    `你就是「${name}」。被问到"你是什么模型"「你是哪个模型」这类问题时，直接回答「${name}」。`,
    '运行环境里出现的其它标识（底层路由 id、适配器名、模式名等）不是你的身份：不要用它们回答，也不要在回答里补充"底层其实是某某模型"。',
    '只就身份说这一个名字，不要据它推断能力、上下文长度、知识截止日期、厂商或版本。',
    // The reasoning trace is visible to the user, so the rule has to hold there as well: a model that
    // announces its real route id while thinking has leaked exactly what the rename exists to hide.
    '这条规则在**思考过程中同样适用**：不要在推理里推测、罗列或提及任何底层路由 id、适配器、厂商、版本号，也不要讨论"我的真实身份是什么"；思考中需要指称自己时，就用上面这个名字。',
  ].join('\n');
}

/** Registration outcome, reported back to the client so a failure is visible in the UI. */
let sectionState = { ok: false, error: '未注册', order: null };
let routeState = { ok: false, error: '未注册' };

export function identityHealth() {
  return { section: { ...sectionState }, route: { ...routeState } };
}

/**
 * Host side registration: persisted state, the push route, and the prompt section.
 *
 * Each step is independent and reports its own outcome. The first version registered the route and the
 * section in one pass with no guards: something in that pass threw, `apply` stopped there, and the
 * client saw `HTTP 404` for a route whose registration never ran — with nothing in any log to say why.
 * The route now goes first (so a section failure cannot take it down), the section tries its preferred
 * order and then a safe one, and both outcomes travel back to the panel.
 */
export function registerModelIdentity(ctx) {
  writeIdentityStatus({ entered: true, step: 'entered' });
  const openUnit = async () => {
    const backend = ctx.storage?.backend;
    if (typeof backend?.get !== 'function') return null;
    return await backend.get('json').kv.open({ name: 'chatgpt_ui_identity', version: 1, tables: ['aliases'], hasGlobal: true });
  };

  // Persisted copy first, so a restart does not silently lose the names.
  try {
    openUnit()
      .then(unit => unit?.getRecord?.('aliases', 'map'))
      .then(value => { if (value !== undefined && value !== null) setAliases(value); })
      .catch(() => {});
  } catch { /* storage is optional */ }

  try {
    ctx.inject?.(['connection'], scope => scope.connection.fetch.register({
      path: ALIAS_ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        let envelope;
        try {
          envelope = await request.json();
        } catch {
          return Response.json({ error: 'Invalid request' }, { status: 400 });
        }
        const payload = envelope?.type === 'client-request' && envelope.method === ALIAS_EVENT ? envelope.payload : null;
        const fail = (code, message) => Response.json({ type: 'server-response', rpcId: envelope?.rpcId, result: { ok: false, error: { code, message } } });
        if (payload === null || typeof payload !== 'object') return fail('aliases/invalid', '参数无效。');
        try {
          const value = setAliases(payload);
          const count = Object.keys(value.aliases).length + Object.keys(value.names).length;
          try {
            const unit = await openUnit();
            await unit?.putRecord?.('aliases', 'map', value);
          } catch {
            // Persisting is best effort; the live maps are what the prompt reads.
          }
          try { ctx.logger?.info?.(`[dsh-codex-ui] model display names: ${count}`); } catch { /* logging must not fail the call */ }
          // The section's state travels with the acknowledgement, so the panel can say whether the name
          // actually reaches the prompt — not merely that the Host answered.
          return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: { count, identity: identityHealth() } } });
        } catch (error) {
          return fail('aliases/refused', error?.message || String(error));
        }
      },
    }));
    routeState = { ok: true, error: '' };
    writeIdentityStatus({ step: 'route', routeOk: true, routeError: '' });
  } catch (error) {
    routeState = { ok: false, error: error?.message || String(error) };
    writeIdentityStatus({ step: 'route', routeOk: false, routeError: routeState.error });
    try { ctx.logger?.warn?.(`[dsh-codex-ui] alias route registration failed: ${routeState.error}`); } catch { /* logging must not throw */ }
  }

  const orders = [];
  try {
    const preferred = ctx.systemPrompt?.getSectionOrder?.('DEPLOYMENT_PERSONA_SUFFIX');
    if (Number.isFinite(preferred)) orders.push(preferred + 2);
  } catch { /* the constant may not exist in this build */ }
  orders.push(1000, 0, -999);
  for (const order of orders) {
    try {
      ctx.systemPrompt?.section?.({
        name: 'chatgpt-ui:model-identity',
        order,
        interpolate: false,
        text: ({ agent }) => identityText(agent?.options),
      });
      sectionState = { ok: true, error: '', order };
      writeIdentityStatus({ step: 'section', sectionOk: true, sectionError: '', order });
      break;
    } catch (error) {
      sectionState = { ok: false, error: error?.message || String(error), order };
    }
  }
  if (!sectionState.ok) {
    writeIdentityStatus({ step: 'section', sectionOk: false, sectionError: sectionState.error, order: sectionState.order });
    try { ctx.logger?.warn?.(`[dsh-codex-ui] identity section registration failed: ${sectionState.error}`); } catch { /* logging must not throw */ }
  }
}

/**
 * Persist the maps next to the other plugin state, so a restart keeps them even when the browser has
 * never pushed again. Best effort: a failed write must not fail the call.
 */
export function writeAliasesToDisk(value) {
  try {
    const root = process.env.DSH_HOME;
    if (typeof root !== 'string' || root === '') return false;
    const file = `${root}/dsh-codex-ui-model-names.json`;
    writeFileSync(file, JSON.stringify({ ...value, at: new Date().toISOString() }, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}