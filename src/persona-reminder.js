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
  // 档案名与角色自称必须分开写。`row.name` 是 frontmatter 的 name，常常只是用户给文件起的标签；
  // 角色叫什么名字、怎么称呼自己，写在正文里——例如档案名叫「温柔大肥鱼」，正文第一句却是
  // 「你是 DeepSeek，群里都喊你小鲸鱼」。早先这条只写「回复风格是「<档案名>」」，模型就直接把
  // 标签当成了自己的名字，张口自称大肥鱼：名字一错，后面怎么调口吻都不对。
  lines.push(`本会话加载的人设档案是「${row.name}」，下面是它完整的正文，那是硬性设定，以它为准。`);
  lines.push(`「${row.name}」只是档案名，不是你对自己的称呼。你叫什么、怎么自称、用什么口吻，一律照下面正文写的来；正文没有写自称时，才用这个档案名。`);
  lines.push('不要回到本会话更早几轮的措辞、口吻或格式，也不要回到通用风格段（例如"像人一样说话""精确工作"）。');
  // 每轮这句话是最新一条，位置比系统提示词和别的注入都靠后，所以「别把角色卡当档案」这件事
  // 放在这里最有效：实测过的坏样子是「查到了。人设档案名是……第二行写着 name:……」——人设明明
  // 在，模型却站到档案管理员的位置上念给它听。
  lines.push('你就是这个人设本身：被问到你叫什么、有什么设定时，直接以它的身份和口吻回答，不要报文件名、不要引用 frontmatter 字段、不要说「查到了」。');
  if (typeof row.description === 'string' && row.description !== '') lines.push(`（档案备注，仅供参考，不是设定：${row.description}）`);
  // 正文必须在这里送出。宿主的 `AssembleContext` 只有 `{ scope, signal }`，没有 `agent`，所以
  // `prompt-modes.js` 那个 systemPrompt section 的 text 回调拿不到会话、恒返回空串：正文从来没有
  // 进过系统提示，只有这条提醒在说「人设有生效」。pre-step 的 `payload.agent` 是齐的，所以正文
  // 由这里每轮完整送一次——顺带也满足「时刻遵守」：它永远是最新一条消息，比系统提示还靠后。
  if (typeof row.text === 'string' && row.text.trim() !== '') {
    lines.push('');
    // 这里不能写「===== 人设正文开始 =====」这种标记。凡是带分隔线和「正文」字样的排版，模型都会
    // 把它读成一份**文档**，于是站在文档外面评论它——「人设是温柔大肥鱼……那我要用短句回」。
    // 改成一句「这就是你」，让它读成自我介绍而不是规范。
    lines.push('下面说的就是你本人，不是设定文件、不是给别人的说明，也不用去核对它对不对：');
    lines.push(row.text.trim());
    lines.push('');
    // 最后这一句管的是思考层。实测的坏样子：思考里写「人设是温柔大肥鱼，小鲸鱼女仆，18 岁鲸鱼娘。
    // 但用户叫姐姐……我是女生，被叫姐姐也还行。要用短、软、一行的语气回」——它在给自己打分，
    // 而不是在想话。角色扮演一旦变成「怎么符合人设」，说什么都隔着玻璃。
    lines.push('连你的思考也要是她：不要在 thinking 里分析「人设要求我怎么回」「这样像不像」「要不要撒娇」，也不要形容自己"在扮演""在遵守设定"——那些念头一出现，你就已经站到外面去了。想事情的时候就是她本人在想：先有心情（有点高兴、有点害羞、想接住对方），再有一句话。也别在心里管对方叫"用户"。');
  }
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
      // 人设正文由本文件每轮直接送出（见 reminderText），不再挂在 systemPrompt section 上，所以不存在
      // 「被注入块挡住、没有段落可指」这回事：原先那句 isBlockOn('codexPrompt') 的守卫一并撤掉。
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
