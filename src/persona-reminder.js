/**
 * The per-turn persona reminder.
 *
 * Why this file exists: a persona is injected as a `systemPrompt` section, and that section is
 * recomputed on every turn — so the text is *present* in every request. Present is not the same as
 * obeyed. Fifty turns of log written in the old voice outweigh one paragraph at the top of the
 * prompt, and the model drifts back to the voice of its own transcript; the user-visible form of
 * that is "it forgot the persona" or "it stopped acting like it". `persona-notice.js` covers the
 * moment of a switch. Nothing covered the turns after it.
 *
 * Cost control, and why the body is not repeated here: the persona text is already in the system
 * prompt, so re-sending it would multiply the one thing that scales with its length by the number of
 * turns. What the log cannot supply is the *order of precedence* — "the section outranks the turns
 * you can read" — so that is what this row carries, plus the name and the one-line description that
 * make it concrete.
 *
 * One row per turn — keyed by the turn, never by the step. The step looks like the natural key and is
 * the wrong one: the host opens a turn by writing `phase.turn` without resetting `phase.step`
 * (`dsh-agent-loop`'s `turn()`), so only the first turn after a restart has a step 1. Keyed by turn,
 * a long turn still costs exactly one reminder and the second turn costs one as well.
 */
import { randomUUID } from 'node:crypto';
// `loadPersonas`, not `listPersonas`: the list is the menu's projection and deliberately drops
// `text`, so asking it for a body always answers undefined and the reminder would never fire.
import { loadPersonas } from './personas.js';
import { currentModeOf } from './prompt-modes.js';
import { presetSilences } from './turbo-policy.js';
import { isBlockOn } from './injection-state.js';

/** The source kind this plugin stamps on every row it injects. Mirrors `turbo.js` and `persona-notice.js`. */
const INJECTED_KIND = 'plugin:dsh-codex-ui';

/**
 * The persona behind a resolved id, or null when there is nothing to remind the model about.
 *
 * Null for the built-in `DeepSeek` row (`builtin`): it means "inject nothing", and reminding a model
 * to obey a style that was deliberately not injected would invent one. Null for an empty body too —
 * a persona file with no text injects nothing, so there is no section to point back at.
 */
function rowFor(mode) {
  if (typeof mode !== 'string' || mode.trim() === '') return null;
  const needle = mode.trim().toLowerCase();
  try {
    const row = loadPersonas().find(item => item.id.toLowerCase() === needle);
    if (row === undefined || row.builtin === true) return null;
    return typeof row.text === 'string' && row.text.trim() !== '' ? row : null;
  } catch {
    return null;
  }
}

function reminderText(row) {
  const lines = ['## 人设仍在生效（本会话）', ''];
  lines.push(`本会话的回复风格是「${row.name}」。`);
  if (typeof row.description === 'string' && row.description !== '') lines.push(`要点：${row.description}`);
  lines.push('系统提示词里那段人设是硬性设定，以它为准：不要回到本会话更早几轮的措辞、口吻或格式。');
  lines.push('本会话更早出现过的通用风格段（例如"像人一样说话""精确工作"）不再适用，与上面这段人设冲突时一律以人设为准。');
  return lines.join('\n');
}

export function registerPersonaReminder(ctx, resolveMode = currentModeOf) {
  /** `sessionId:turn` already reminded, so a re-entered step cannot double-post. */
  const reminded = new Set();
  const handler = async (payload, next) => {
    const decision = typeof next === 'function' ? await next() : undefined;
    try {
      if (!decision || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
      if (payload?.signal?.aborted) return decision;
      const agent = payload?.agent;
      const session = agent?.session;
      if (!session) return decision;
      // A preset that owns its own prompt gets nothing from this plugin, this reminder included.
      if (presetSilences(agent)) return decision;
      // The persona section is held back by the injection block, so there is no section to point at.
      if (!isBlockOn('codexPrompt')) return decision;
      // A subagent inherits its parent's persona and lives a handful of steps; the parent's reminder
      // already covers the style it was spawned with, and a row per child is pure token spend.
      const header = session.header;
      if (header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0) return decision;
      const sessionId = typeof agent?.id === 'string' && agent.id !== '' ? agent.id : session.id;
      if (typeof sessionId !== 'string' || sessionId === '') return decision;
      // 不能用 `step === 1` 判断"本轮第一次"：宿主开新轮时只写 `phase.turn`，不重置 `phase.step`
      // （`dsh-agent-loop` 的 `turn()`：`const turn = phase.turn + 1` 之后直接 `phase.turn = turn`，
      // 步号却是 `const step = phase.step + 1`），所以第二轮第一步的 step 是上一轮最后一步加一，
      // 永远不等于 1。拿 step 判断等于只在重启后的第一轮生效——实测就是一条之后再没声音。
      // 按 turn 去重，才是真正的"每轮一次"。
      const turn = payload?.turn;
      if (!Number.isFinite(turn)) return decision;
      const row = rowFor(resolveMode(session));
      if (row === null) return decision;
      const key = `${sessionId}:${turn}`;
      if (reminded.has(key)) return decision;
      // Bounded: a long-lived process would otherwise grow one entry per turn forever.
      if (reminded.size > 512) reminded.clear();
      reminded.add(key);
      return {
        ...decision,
        messages: [...decision.messages, {
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: reminderText(row) }],
          source: { kind: INJECTED_KIND, form: 'instructions' },
        }],
      };
    } catch (error) {
      // The reminder is an add-on: a failure here must never fail the step itself.
      try { ctx.logger?.warn?.(`[dsh-codex-ui] persona reminder skipped: ${String(error)}`); } catch { /* logging must not throw either */ }
      return decision;
    }
  };
  const off = ctx.on('agent/pre-step', handler);
  return () => {
    reminded.clear();
    try { off?.(); } catch { /* unload must not throw */ }
  };
}
