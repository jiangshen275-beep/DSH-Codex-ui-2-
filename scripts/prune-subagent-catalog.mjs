/**
 * 独立清理工具：在 **DSH 完全退出后** 运行，把父会话日志里那些「子代理目录已不存在」的
 * `subagent/catalog` 事件删掉，并同步删掉对应的投影缓存。
 *
 * 为什么必须在 DSH 关闭后跑：宿主进程内存里的投影状态是权威，每次 checkpoint 都会整份覆写
 * 磁盘缓存——DSH 开着的时候改，下一次 checkpoint 就被冲掉。日志同理，live 会话在持续追加。
 *
 * 安全设计：
 *   · 只删 `type === 'subagent/catalog'` 且 `childId` 在磁盘上**没有对应目录**的事件；
 *     用户自己的会话（`session-` 前缀）和还在跑的子代理一律不动。
 *   · 原日志先复制一份 `.bak`，改坏了原样在手。
 *   · 事件删掉后 seq 会留洞，但宿主的投影只按 seq 单调过滤，不留 seq 连续性校验（实测读码）。
 *   · 对应的 projcache 一并删除，宿主下次启动从删减后的日志重新 fold，数字才真的会小。
 *
 * 用法：先完全退出 DSH，然后 `node scripts/prune-subagent-catalog.mjs [父会话id]`。
 * 不带参数就处理**所有**含死引用的父会话日志。
 */
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const home = process.env.DSH_HOME || '';
if (home === '') {
  console.error('没找到 DSH_HOME 环境变量。在 DSH 的环境里运行，或者手动指到 home 目录。');
  process.exit(1);
}

const sessionsDir = join(home, 'sessions');
const projDir = join(home, 'storages', 'session_projcache', 'sessions');

/** 解压一份日志，按帧切行，返回 { lines, frames }。 */
function readLog(file) {
  const buf = readFileSync(file);
  const offsets = [];
  let i = 0;
  while ((i = buf.indexOf(MAGIC, i)) !== -1) { offsets.push(i); i += 4; }
  const chunks = [];
  for (let k = 0; k < offsets.length; k += 1) {
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length;
    try { chunks.push(zstdDecompressSync(buf.subarray(offsets[k], end))); } catch { /* 坏帧跳过 */ }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return { lines: text.split('\n').filter(l => l.trim() !== ''), frames: offsets.length };
}

/** 子代理会话目录存在吗（在任意项目目录下找）。 */
function childDirExists(id) {
  for (const project of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    if (existsSync(join(sessionsDir, project.name, id, 'session.v4.jsonl.zstd'))) return true;
  }
  return false;
}

/** 逐帧重新压缩写回；原文件改名成 .bak 留底。 */
function writeLog(file, lines) {
  renameSync(file, `${file}.bak`);
  const body = lines.join('\n');
  const chunk = 64 * 1024;
  const out = [];
  for (let i = 0; i < body.length; i += chunk) out.push(zstdCompressSync(Buffer.from(body.slice(i, i + chunk), 'utf8')));
  writeFileSync(file, Buffer.concat(out));
}

let totalRemoved = 0;
const targets = process.argv[2] ? [process.argv[2]] : [null];

for (const only of targets) {
  for (const project of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const file = join(sessionsDir, project.name, only ? `${only}.v4.jsonl.zstd` : 'session.v4.jsonl.zstd');
    if (!existsSync(file)) continue;

    // 只处理父会话（用户自己的，带 session- 前缀）——子代理日志里不会有 catalog 事件。
    if (!project.name.startsWith('session-') && !only) continue;
    if (only && !only.startsWith('session-')) continue;

    const { lines } = readLog(file);
    const kept = [];
    let removed = 0;
    const removedIds = [];

    for (const line of lines) {
      let event = null;
      if (line.includes('"subagent/catalog"')) {
        try { event = JSON.parse(line); } catch { /* 不是 JSON 就原样保留 */ }
      }
      if (event?.type === 'subagent/catalog' && typeof event.data?.childId === 'string'
          && !childDirExists(event.data.childId)) {
        removed += 1;
        removedIds.push(event.data.childId);
        continue; // 这一行的子代理目录已经没了，删
      }
      kept.push(line);
    }

    if (removed === 0) continue;

    // 同步删投影缓存，宿主下次启动从删减后的日志重 fold。
    for (const id of [removedIds[0], ...removedIds]) {
      const cache = join(projDir, `${id}.json`);
      if (id === removedIds[0] && existsSync(join(projDir, `${project.name}.json`))) {
        rmSync(join(projDir, `${project.name}.json`), { force: true });
      }
      if (existsSync(cache)) rmSync(cache, { force: true });
    }

    writeLog(file, kept);
    totalRemoved += removed;
    console.log(`${project.name}: 删掉 ${removed} 条死引用（${removedIds.slice(0, 3).join('…, ')}`);
  }
}

console.log(`\n完成：共删掉 ${totalRemoved} 条子代理目录死引用。现在可以启动 DSH 了。`);
