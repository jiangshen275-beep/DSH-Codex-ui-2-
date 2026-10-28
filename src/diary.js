/**
 * Agent 日记：把一篇篇交接文档整合成能长期累积的现场记录。
 *
 * 为什么要有它：长会话里上下文一压缩，模型就不记得自己早先改过什么，交接时只能凭最近几轮
 * 重新总结，前面那些改动、用户反馈、没做完的事全丢了。日记让这些信息落在磁盘上，下一个
 * Agent 读得到。
 *
 * 三条设计约束，与 rail-config 一致：
 *   · 文件是唯一真相。一篇日记就是一个 .md 文件，用户可以直接用资源管理器或别的编辑器打开。
 *   · 名字即标题。新建时给什么名字就用什么名字，重名自动变成「日记(1)」「日记(2)」。
 *   · 坏文件不能炸宿主。读的时候容错，写的时候先写 .tmp 再 rename。
 *
 * 谁写：只有用户能新建日记。Agent 侧的工具没有 create —— 用户明确说过「Agent 不会自己
 * 创建日记」，所以工具只提供 list / read / append / write 四种，且都要指明已有的日记。
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 日记目录名，文档、RPC、工具三处引用同一个常量。 */
export const DIARY_DIR = 'codex-ui-diary';
const DIARY_METHOD = 'dsh-codex-ui/diary';
const DIARY_ROUTE = '/api/dsh-codex-ui/diary';
/** Windows 文件名里不能出现的字符，外加控制字符。 */
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;
const NAME_LIMIT = 80;

/** `$DSH_HOME/codex-ui-diary`，或者 null（宿主没给 home）。 */
export function diaryDir(home = process.env.DSH_HOME) {
  const root = typeof home === 'string' && home !== '' ? home : '';
  return root === '' ? null : join(root, DIARY_DIR);
}

function diaryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** 把用户给的名字整理成安全文件名（不含扩展名）。非法字符换成空格，压掉多余空白。 */
export function sanitizeName(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = text.replace(UNSAFE_NAME, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (cleaned === '') throw diaryError('diary/name', '日记名字不能为空。');
  if (cleaned.length > NAME_LIMIT) throw diaryError('diary/name', `日记名字不能超过 ${NAME_LIMIT} 个字符（现在 ${cleaned.length} 个）。`);
  return cleaned;
}

/**
 * 在目录里找一个还没被占用的名字。
 *
 * 「日记」已存在就试「日记(1)」「日记(2)」…… 用户要求的就是这个行为：不填名字时排下去，
 * 填了重名时也一样，不覆盖别人的日记。
 */
function uniqueName(dir, base) {
  if (!existsSync(join(dir, `${base}.md`))) return base;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base}(${i})`;
    if (!existsSync(join(dir, `${candidate}.md`))) return candidate;
  }
  throw diaryError('diary/name', `「${base}」的重名太多了，换个名字吧。`);
}

function requireDir(home) {
  const dir = diaryDir(home);
  if (dir === null) throw diaryError('diary/home', '宿主没有提供 DSH_HOME，日记没有地方可存。');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** 文件内容里的第一个一级标题就是标题；没有就退回文件名。 */
function titleOf(name, text) {
  const match = /^#\s+(.+)$/m.exec(text);
  return match === null ? name : match[1].trim();
}

/** 列出全部日记，最近改过的在前。读不到的文件跳过，不让一篇坏文件挡住整张表。 */
export function listDiaries(home = process.env.DSH_HOME) {
  const dir = diaryDir(home);
  if (dir === null || !existsSync(dir)) return [];
  const items = [];
  for (const file of readdirSync(dir)) {
    if (!file.toLowerCase().endsWith('.md')) continue;
    const full = join(dir, file);
    const name = file.slice(0, -3);
    let text = '';
    let updatedAt = 0;
    try {
      text = readFileSync(full, 'utf8');
      updatedAt = statSync(full).mtimeMs;
    } catch { continue; }
    items.push({
      name,
      title: titleOf(name, text),
      updatedAt: Math.round(updatedAt),
      bytes: Buffer.byteLength(text, 'utf8')
    });
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return items;
}

/** 读一篇。名字不安全或不存在都报清楚。 */
export function readDiary(name, home = process.env.DSH_HOME) {
  const dir = diaryDir(home);
  if (dir === null) throw diaryError('diary/home', '宿主没有提供 DSH_HOME。');
  const safe = sanitizeName(name);
  const full = join(dir, `${safe}.md`);
  if (!existsSync(full)) throw diaryError('diary/missing', `没有叫「${safe}」的日记。`);
  let text = '';
  try { text = readFileSync(full, 'utf8'); } catch (error) { throw diaryError('diary/read', `读「${safe}」失败：${error?.message ?? error}`); }
  return { name: safe, title: titleOf(safe, text), text };
}

/** 新建。只有用户从面板里按才是这条路；Agent 工具没有这个动作。 */
export function createDiary(rawName, home = process.env.DSH_HOME) {
  const dir = requireDir(home);
  const base = sanitizeName(rawName === undefined || rawName === null || rawName === '' ? '日记' : rawName);
  const name = uniqueName(dir, base);
  const text = [
    `# ${name}`,
    '',
    '## 改动',
    '',
    '## 用户情绪',
    '',
    '## 重要文件',
    '',
    '## 用户反馈',
    '',
    '## 未完成',
    '',
    '## 崩溃记录',
    ''
  ].join('\n');
  const full = join(dir, `${name}.md`);
  try { writeFileSync(full, text, 'utf8'); } catch (error) { throw diaryError('diary/write', `新建「${name}」失败：${error?.message ?? error}`); }
  return { name, title: name, text };
}

/** 整篇覆盖。先写 .tmp 再 rename，任何时刻磁盘上都是一个完整文件。 */
export function writeDiary(name, content, home = process.env.DSH_HOME) {
  const dir = requireDir(home);
  const safe = sanitizeName(name);
  const full = join(dir, `${safe}.md`);
  if (!existsSync(full)) throw diaryError('diary/missing', `没有叫「${safe}」的日记。新建请用面板上的「新建日记」。`);
  const text = typeof content === 'string' ? content : '';
  const tmp = `${full}.tmp`;
  try {
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, full);
  } catch (error) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* 收尾失败就算了，别盖住原始错误 */ }
    throw diaryError('diary/write', `写「${safe}」失败：${error?.message ?? error}`);
  }
  return { name: safe, title: titleOf(safe, text), text };
}

/**
 * 追加一段。Agent 记日记主要走这条：不重写全文，只在末尾接上，别的段落原样留着。
 * 前面自动补一个空行，免得接在上一段最后一个字后面。
 */
export function appendDiary(name, content, home = process.env.DSH_HOME) {
  const current = readDiary(name, home);
  const piece = typeof content === 'string' ? content : '';
  if (piece.trim() === '') throw diaryError('diary/empty', '要追加的内容是空的。');
  const head = current.text.endsWith('\n') ? current.text : `${current.text}\n`;
  const next = `${head}\n${piece.trim()}\n`;
  return writeDiary(current.name, next, home);
}

/** 改名。重名同样会自动排号，不覆盖。 */
export function renameDiary(name, newName, home = process.env.DSH_HOME) {
  const dir = requireDir(home);
  const safe = sanitizeName(name);
  const full = join(dir, `${safe}.md`);
  if (!existsSync(full)) throw diaryError('diary/missing', `没有叫「${safe}」的日记。`);
  const wanted = sanitizeName(newName);
  if (wanted === safe) return { name: safe, title: safe };
  const target = uniqueName(dir, wanted);
  const nextPath = join(dir, `${target}.md`);
  let text = '';
  try { text = readFileSync(full, 'utf8'); } catch (error) { throw diaryError('diary/read', `读「${safe}」失败：${error?.message ?? error}`); }
  // 标题行跟着改，否则面板上显示的还是旧名字。
  const replaced = /^#\s+(.+)$/m.test(text) ? text.replace(/^#\s+(.+)$/m, `# ${target}`) : `# ${target}\n\n${text}`;
  try {
    writeFileSync(nextPath, replaced, 'utf8');
    unlinkSync(full);
  } catch (error) { throw diaryError('diary/write', `改名失败：${error?.message ?? error}`); }
  return { name: target, title: target };
}

/** 删除。不可恢复，所以面板那边要二次确认。 */
export function removeDiary(name, home = process.env.DSH_HOME) {
  const dir = diaryDir(home);
  if (dir === null) throw diaryError('diary/home', '宿主没有提供 DSH_HOME。');
  const safe = sanitizeName(name);
  const full = join(dir, `${safe}.md`);
  if (!existsSync(full)) throw diaryError('diary/missing', `没有叫「${safe}」的日记。`);
  try { unlinkSync(full); } catch (error) { throw diaryError('diary/write', `删除「${safe}」失败：${error?.message ?? error}`); }
  return { name: safe };
}

/** RPC 路由。client-request 进，server-response 出，与 rail 那条同构。 */
export function registerDiaryRoute(ctx, home = process.env.DSH_HOME) {
  const respond = (rpcId, result) => Response.json({ type: 'server-response', rpcId, result });
  const failure = (code, message) => ({ ok: false, error: { code, message } });
  const guard = body => {
    try { return { ok: true, value: body() }; }
    catch (error) { return failure(error?.code ?? 'diary/failed', error?.message ?? String(error)); }
  };
  ctx.connection.fetch.register({
    path: DIARY_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try { envelope = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (envelope?.type !== 'client-request' || envelope.method !== DIARY_METHOD || typeof envelope.rpcId !== 'string' || envelope.rpcId.length > 256) {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
      }
      const payload = envelope.payload ?? {};
      const action = typeof payload.action === 'string' ? payload.action : 'list';
      if (action === 'list') {
        const listed = guard(() => ({ items: listDiaries(home), dir: diaryDir(home) }));
        return respond(envelope.rpcId, listed.ok ? { ok: true, value: listed.value } : listed);
      }
      if (action === 'read') {
        const read = guard(() => readDiary(payload.name, home));
        return respond(envelope.rpcId, read.ok ? { ok: true, value: read.value } : read);
      }
      if (action === 'create') {
        const created = guard(() => createDiary(payload.name, home));
        return respond(envelope.rpcId, created.ok ? { ok: true, value: created.value } : created);
      }
      if (action === 'write') {
        const written = guard(() => writeDiary(payload.name, payload.content, home));
        return respond(envelope.rpcId, written.ok ? { ok: true, value: written.value } : written);
      }
      if (action === 'rename') {
        const renamed = guard(() => renameDiary(payload.name, payload.next, home));
        return respond(envelope.rpcId, renamed.ok ? { ok: true, value: renamed.value } : renamed);
      }
      if (action === 'remove') {
        const removed = guard(() => removeDiary(payload.name, home));
        return respond(envelope.rpcId, removed.ok ? { ok: true, value: removed.value } : removed);
      }
      return respond(envelope.rpcId, failure('diary/action', `不认识的 action：${action}（可用 list / read / create / write / rename / remove）。`));
    }
  });
}

/**
 * Agent 用的工具。
 *
 * 没有 create：用户说过 Agent 不会自己创建日记，日记只能由他在面板上新建。工具只负责往
 * 已有的日记里记东西。
 *
 * 描述写得罗嗦是故意的：调用方是模型，它需要知道「append 和 write 的区别」「记什么」，
 * 这几句决定了它记出来的东西对下一个 Agent 有没有用。
 */
export function diaryTool(home = process.env.DSH_HOME) {
  return {
    name: 'agent_diary',
    description: [
      '读写用户建立的 Agent 日记（一篇篇 markdown 交接记录，存放在 $DSH_HOME/codex-ui-diary）。',
      '日记的用途：长会话里上下文会被压缩，早先的改动很容易忘干净。把「改了什么、用户情绪如何、动了哪些重要文件、用户的反馈、还没做完的事、崩溃或中断记录」写进日记，下一个 Agent 接活时就能读到现场，不用从头猜。',
      '**要勤记，不要攒。** 用户明确要求：每完成一个能说清的步骤——改完一处、跑通一次验证、拿到用户的一次反馈、遇到一次报错或重启中断——就立刻 append 一段。不要等会话结束，也不要攒到最后一次性补记：上下文压缩常常正好发生在两步之间，攒着的那段细节会一起丢掉。宁可分成多条短记录，也不要一条含混的长记录。',
      '会话被重启或中断、换了新的 Agent 接活时，先 append 一条把中断点写下来，再动手。',
      '日记由用户新建，你**不能**创建：没有 create 动作。用 action=list 看他建了哪几篇，挑对的那篇再动手。',
      '用户的固定说法：写「阅读[某篇日记名]」就是让你读那篇，方括号里是日记名，直接 action=read 即可，不用再问「哪一篇」；他说「记到[某篇]里」就是 action=append。这套格式和面板上的「复制指令」按钮一致。',
      'action=append 往末尾接一段，最常用，不会动到已有内容；action=write 整篇覆盖，只有在用户要求重写时才用；action=read 读全文；action=list 列出全部。',
      '记的时候写结论和位置：改了哪个文件、为什么改、用户当时什么态度、还有什么没做。不要抄整段代码，也不要写「正在处理」这类当时有效、过后没用的中间态。',
      '每次记完返回一行确认；失败会写明原因，照原因改，不要重试同一个错误。'
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read', 'append', 'write'], description: 'list 列出日记，read 读一篇，append 往末尾追加，write 整篇覆盖。' },
        name: { type: 'string', description: '日记名字，就是 list 里那一列（不含 .md）。read / append / write 必填。' },
        content: { type: 'string', description: '要写入的 markdown 内容。append 只写这次新增的这一段，不要带上前文；write 写整篇。' }
      },
      required: ['action']
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : String(value ?? '') }]
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : 'list';
      try {
        if (action === 'list') {
          const items = listDiaries(home);
          const dir = diaryDir(home) ?? '（DSH_HOME 未设置）';
          if (items.length === 0) return `OK\tlist\t0 篇。用户还没建日记。目录：${dir}`;
          const lines = items.map(item => `${item.name}\t${item.bytes} 字节\t${new Date(item.updatedAt).toISOString()}`);
          return `OK\tlist\t${items.length} 篇\t${dir}\n${lines.join('\n')}`;
        }
        if (action === 'read') {
          const { name, title, text } = readDiary(args.name, home);
          return `OK\tread\t${name}\t标题：${title}\n---\n${text}`;
        }
        if (action === 'append') {
          const { name } = appendDiary(args.name, args.content, home);
          return `OK\tappend\t${name}\t已追加`;
        }
        if (action === 'write') {
          const { name, bytes } = (() => {
            const result = writeDiary(args.name, args.content, home);
            return { name: result.name, bytes: Buffer.byteLength(result.text, 'utf8') };
          })();
          return `OK\twrite\t${name}\t${bytes} 字节`;
        }
        return `FAILED\tdiary/action\t不认识的 action：${action}（可用 list / read / append / write）`;
      } catch (error) {
        return `FAILED\t${error?.code ?? 'diary/failed'}\t${error?.message ?? String(error)}`;
      }
    }
  };
}

export function registerDiaryTool(ctx, home = process.env.DSH_HOME) {
  ctx.effect(() => ctx.tools.register(diaryTool(home)));
}
