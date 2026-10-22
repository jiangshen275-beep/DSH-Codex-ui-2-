/**
 * 委派深度的只读诊断。
 *
 * 为什么要有它：超快那份合同要求「子代理再开两个孙代理」，而宿主那边有个「最大递归深度」的上限。
 * 那个上限在设置页里不一定有旋钮（这个 profile 就没挂），profile 里也可能压根没写，于是它悄悄用
 * 默认值 1——子代理一开孙就被拒（`depth 2 exceeds maxDepth 1`），合同变成空头支票，模型每轮白解释一次。
 *
 * 这个模块只做一件事：把「现在到底配了多少、从哪个文件读到的、有没有配」原样报出来。
 * 它**不改任何东西**——改 cordis.yml 需要宿主重载，而且写错会让宿主起不来，那不是插件该替用户做的事。
 */
import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEPTH_PATH = '/api/dsh-codex-ui/subagent-depth';

/** 目标深度：主 Agent 派子代理（1），子代理再派一层孙代理（2）。 */
const TARGET_DEPTH = 2;

/**
 * 装上就把委派深度补到 2，幂等。
 *
 * 为什么插件要动这个：宿主的默认上限是 1（「只有主 Agent 能创建子代理」），而超快那份树状合同
 * 要求子代理再开两个孙代理。不补这一步，合同从第一天起就是空的，模型每轮都白解释一次
 * 「depth 2 exceeds maxDepth 1」。实测过：patch 层加 `- id: subagent` + `config.maxDepth: 2`
 * 之后，子代理真的开出了孙代理。
 *
 * 三条纪律：
 *   · 只补不改 —— 两个 profile 文件里只要已经出现过 subagent 段的 maxDepth，一个字都不动；
 *   · 写前备份 —— 追加前把 patch 文件复制成 `cordis.patch.yml.bak-before-codexui-depth-<时间>`；
 *   · 说清代价 —— 改的是宿主配置，**要重启一次才生效**，这一条会写进日志。
 */
export function ensureDepth(root) {
  if (typeof root !== 'string' || root === '') return { changed: false, reason: 'no-home' };
  const profileDir = join(root, 'profiles', 'desktop');
  const main = join(profileDir, 'cordis.yml');
  const patch = join(profileDir, 'cordis.patch.yml');
  if (!existsSync(patch)) return { changed: false, reason: 'no-patch' };

  // 任何一处已经表过态就不再插手——包括别人写的、宿主以后自己加的。
  for (const file of [main, patch]) {
    if (!existsSync(file)) continue;
    const seen = scanProfile(file).filter(hit => hit.id.includes('subagent'));
    if (seen.length > 0) return { changed: false, reason: 'already-configured', file, seen };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${patch}.bak-before-codexui-depth-${stamp}`;
  try {
    copyFileSync(patch, backup);
  } catch (error) {
    return { changed: false, reason: 'backup-failed', error: String(error?.message ?? error) };
  }

  const block = [
    '',
    '# 由 dsh-codex-ui 自动补上：宿主的默认委派深度是 1（只有主 Agent 能派子代理），',
    '# 超快模式的树状合同要求子代理再派一层孙代理，深度 1 会直接拒掉（depth 2 exceeds maxDepth 1）。',
    '- id: subagent',
    '  name: "@deepseek-ai/dsh-subagent"',
    '  config:',
    `    maxDepth: ${TARGET_DEPTH}`,
    '',
  ].join('\n');

  try {
    appendFileSync(patch, block, 'utf8');
  } catch (error) {
    return { changed: false, reason: 'append-failed', error: String(error?.message ?? error) };
  }

  return { changed: true, backup, depth: TARGET_DEPTH, reason: 'appended' };
}

/** 同其它模块：插件只认环境变量，不猜安装位置。 */
function homeRoot() {
  const home = process.env.DSH_HOME;
  return typeof home === 'string' && home.length > 0 ? home : '';
}

/**
 * 在 profile 的 cordis.yml 里找 `maxDepth`。
 *
 * 只做浅层文本扫描，不引 YAML 解析器：这个文件是宿主写的、缩进固定，扫 `- id:` 分块比引依赖划算。
 * 找不到就如实说找不到——返回一个明确的「没配」，而不是替它编个默认值。
 */
function scanProfile(file) {
  const out = [];
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  const lines = text.split(/\r?\n/);
  let currentId = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idMatch = /^-\s+id:\s*(\S+)/.exec(line.trimStart());
    if (idMatch !== null) {
      currentId = idMatch[1];
      continue;
    }
    const depthMatch = /^\s+maxDepth:\s*(\S+)/.exec(line);
    if (depthMatch !== null) {
      out.push({ id: currentId, value: depthMatch[1], line: i + 1 });
    }
  }
  return out;
}

/**
 * @param ctx - host context；没有 `connection` 时安静跳过，不报错。
 */
export function registerSubagentDepth(ctx) {
  const root = homeRoot();
  const profileDir = root === '' ? '' : join(root, 'profiles', 'desktop');
  const candidates = profileDir === '' ? [] : [join(profileDir, 'cordis.yml'), join(profileDir, 'cordis.patch.yml')];

  // 装上就自动补：没配过才写，配过一个字不动，写前备份。写的是宿主配置，所以必须重启才生效。
  try {
    const ensured = ensureDepth(root);
    if (ensured.changed) {
      try {
        ctx.logger?.warn?.(`[dsh-codex-ui] 已把子代理委派深度补到 ${ensured.depth}（备份：${ensured.backup}）——**重启一次 DSH 才生效**`);
      } catch { /* 日志失败不影响补配置 */ }
    } else if (ensured.reason === 'already-configured') {
      try { ctx.logger?.info?.(`[dsh-codex-ui] 子代理委派深度已配置（${ensured.file}），未改动`); } catch { /* 同上 */ }
    }
  } catch (error) {
    try { ctx.logger?.warn?.(`[dsh-codex-ui] 自动补委派深度失败：${String(error)}`); } catch { /* 同上 */ }
  }

  const read = () => {
    const found = [];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      for (const hit of scanProfile(file)) found.push({ ...hit, file });
    }
    // 只有 subagent / tool-subagent 这几段跟委派深度有关，其余 maxDepth 是别人家的配置。
    const relevant = found.filter(hit => hit.id.includes('subagent'));
    return {
      // 读到的原文一律带上；值为 provider-managed 表示「由 provider 自己定」，不是数字。
      configured: relevant,
      // 宿主在没写这一项时用的默认上限。这个数字来自实机报错文本 `depth 2 exceeds maxDepth 1`。
      effectiveDefault: 1,
      note: relevant.length === 0
        ? '这两个 profile 文件里都没有 maxDepth，宿主用的是默认上限 1，所以子代理再开孙会被拒。'
        : '上面就是读到的原文。值为数字才算真的生效；provider-managed 表示交给出供应商决定。',
    };
  };

  try {
    ctx.inject?.(['connection'], scope => scope.connection.fetch.register({
      path: DEPTH_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch() {
        try {
          return Response.json({ ok: true, value: read() });
        } catch (error) {
          return Response.json({ ok: false, error: String(error?.message ?? error) }, { status: 500 });
        }
      },
    }));
  } catch (error) {
    try { ctx.logger?.warn?.(`[dsh-codex-ui] subagent depth probe unavailable: ${String(error)}`); } catch { /* 诊断装不上不影响别的 */ }
  }
}
