/**
 * The persona-switch notice.
 *
 * Why this file exists: a persona is injected as a `systemPrompt` section, and that section is
 * recomputed on every turn — so from the next turn on the new text *is* there. Nothing, however,
 * tells the model that the text it read earlier is gone. Its log still carries the old style, the
 * old contracts and dozens of replies written in the old voice, and a section that quietly changed
 * underneath it loses to that log: the switch looks like it did nothing.
 *
 * The fix is one row, once per switch, carried the same way `turbo.js` carries its nudges. It names
 * the persona now in force and says the earlier instructions are void — the one sentence the log
 * cannot supply by itself.
 *
 * Not a rebuild of the client bundle: this is host side, so `lib/index.js` loads it directly and a
 * restart of the Harness is what makes it take effect.
 */
import { randomUUID } from 'node:crypto';
import { listPersonas, readPersonaFile, resolvePersonaId } from './personas.js';
import { currentModeOf } from './prompt-modes.js';
import { presetSilences } from './turbo-policy.js';
import { isBlockOn } from './injection-state.js';

/** The source kind this plugin stamps on every row it injects. Mirrors `turbo.js`. */
const INJECTED_KIND = 'plugin:dsh-codex-ui';

/**
 * The name, description and sampling block of one persona, or null when the row is gone.
 *
 * Built from `listPersonas`, not from `readPersonaFile`: that reader answers "what gets injected"
 * and deliberately returns only `{ id, text }` plus sampling — a notice needs the label the menu
 * shows, which is the list's job. The id is resolved first because a session can carry `Codex` while
 * the file stem is `codex`.
 */
function describePersona(id) {
  if (typeof id !== 'string' || id === '') return null;
  const resolved = resolvePersonaId(id);
  if (resolved === null) return null;
  const row = listPersonas().find(item => item.id === resolved);
  if (row === undefined) return null;
  // The built-in row carries the empty string — "use the native prompt" — and has no file to read.
  if (row.builtin === true) {
    return { name: row.name, description: '不追加风格段，回到宿主原始系统提示词', sampling: '' };
  }
  const found = readPersonaFile(row.id);
  const sampling = [
    found?.temperature === undefined ? '' : `temperature=${found.temperature}`,
    found?.top_p === undefined ? '' : `top_p=${found.top_p}`,
    found?.max_tokens === undefined ? '' : `max_tokens=${found.max_tokens}`,
  ].filter(Boolean).join(' / ');
  return { name: row.name, description: row.description || '', sampling };
}

function noticeText(from, to) {
  const lines = ['## 人设已切换（本会话）', ''];
  lines.push(from ? `本会话的回复风格已从「${from.name}」切换为「${to.name}」。` : `本会话的回复风格现在是「${to.name}」。`);
  if (to.description) lines.push(`新设定：${to.description}`);
  if (to.sampling) lines.push(`采样参数：${to.sampling}`);
  lines.push('');
  lines.push('以新设定为准：本会话里此前注入的风格、契约与格式要求一律作废，不要再沿用旧人设的口吻或规则。');
  return lines.join('\n');
}

/**
 * `agent/pre-step` notice for a persona switch.
 *
 * The record of "which persona this session was last told about" is in memory on purpose: after a
 * restart the first turn of an already-switched session stays silent, because the section it is
 * assembled with is the new one from the very first turn the restarted host serves — there is no
 * earlier text in that process for the model to be retracted from.
 */
export function registerPersonaNotice(ctx, resolveMode = currentModeOf) {
  /** sessionId -> the persona the session was last observed carrying. */
  const seen = new Map();
  const handler = async (payload, next) => {
    const decision = typeof next === 'function' ? await next() : undefined;
    try {
      if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
      if (payload?.signal?.aborted) return decision;
      const agent = payload?.agent;
      const session = agent?.session;
      if (!session) return decision;
      const sessionId = typeof agent?.id === 'string' && agent.id !== '' ? agent.id : session.id;
      if (typeof sessionId !== 'string' || sessionId === '') return decision;
      // A child session inherits its parent's persona at creation; a switch there is not a switch
      // this row should be spent on.
      const header = session.header;
      if (header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0) return decision;
      // A preset that owns its own prompt gets nothing from this plugin, this notice included.
      if (presetSilences(agent)) return decision;
      // The persona section is held back by the injection block: announcing a persona that is not
      // being injected would be a notice about nothing.
      if (!isBlockOn('codexPrompt')) return decision;
      const mode = resolveMode(session);
      if (typeof mode !== 'string' || mode === '') return decision;
      // The first sighting records the baseline; only a change from it is announced.
      if (!seen.has(sessionId)) {
        seen.set(sessionId, mode);
        return decision;
      }
      const previous = seen.get(sessionId);
      if (previous === mode) return decision;
      seen.set(sessionId, mode);
      const to = describePersona(mode);
      // The row this session switched to no longer resolves — say nothing rather than name a
      // persona that is not in force.
      if (to === null) return decision;
      return {
        ...decision,
        messages: [...decision.messages, {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: noticeText(describePersona(previous), to) }],
          source: { kind: INJECTED_KIND, form: 'instructions' },
        }],
      };
    } catch (error) {
      // The notice is an add-on: a failure here must never fail the step itself.
      try { ctx.logger?.warn?.(`[dsh-codex-ui] persona-switch notice skipped: ${String(error)}`); } catch { /* logging must not throw either */ }
      return decision;
    }
  };
  const off = ctx.on('agent/pre-step', handler);
  return () => {
    seen.clear();
    try { off?.(); } catch { /* unload must not throw */ }
  };
}
