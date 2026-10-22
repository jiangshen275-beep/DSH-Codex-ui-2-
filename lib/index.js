import { apply as applyPromptModes } from '../src/prompt-modes.js';
import { registerPersonaNotice } from '../src/persona-notice.js';
// 人设每轮提醒：切换通知只管"切换那一刻"，长会话里模型会飘回旧口吻，这条每轮把优先级
// 重新摆一次（正文仍在系统提示词里，这条只带名字与"以人设为准"）。
import { registerPersonaReminder } from '../src/persona-reminder.js';
import { registerBalance } from '../src/api-balance.js';
import { registerTurbo } from '../src/turbo.js';
import { registerSessionPurge } from '../src/session-purge.js';
import { registerSubagentReaper } from '../src/subagent-reaper.js';
import { registerSubagentDepth } from '../src/subagent-depth.js';
import { registerAgentDoneSound } from '../src/agent-done-sound.js';
import { registerModelIdentity } from '../src/model-identity.js';
// 侧栏侧配置面：配置文件 + RPC + 工具。用户自己的 Agent 靠它把别的插件挂到侧栏上，
// 不需要写客户端代码，也不需要重新打包。
import { registerRailRoute, registerRailTool } from '../src/rail-config.js';
import { writeIdentityStatus } from '../src/identity-status.js';
import { registerSampling } from '../src/sampling.js';
// 回复锻造（原 dsh-codex-ui-HF）：消息改写 + 会话落盘。从 3.0.1 起并进本包，
// 同一插件 id、同一套路由前缀，不再作为独立插件安装。
import { apply as applyReplyForge } from '../src/reply-forge/index.mjs';
// 电脑操控（原 dsh-computer-use 独立插件）：从 3.0.0 起并进本包，作为本插件自己注册的
// 工具，不再单独安装。代码保留它自己的 lib/scripts 结构，内部相对路径不用改。
import { apply as applyComputerUse } from '../computer-use/lib/index.js';
import { inject as promptModesInject } from '../src/prompt-modes.js';
// 透出 prompt-modes 的依赖，并补上 tools —— 电脑操控要靠 ctx.tools 注册工具。
export const inject = [...promptModesInject, 'tools'];
export async function apply(ctx, config = {}) {
  // Records how far host activation got, so a 404 on a plugin route can be traced to a step.
  writeIdentityStatus({ applyEntered: true });
  // Contained like the rest: this line registers the routes the whole left-corner menu depends on, and
  // an exception here used to take balance, turbo, purge and identity with it — every one of them is
  // registered after this point. One broken feature is a bug; five broken features because one threw
  // is a dead plugin.
  try {
    await applyPromptModes(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] reply modes unavailable: ${String(error)}`);
  }
  // After the modes plugin, because it reads the persona that plugin resolves, and contained like
  // everything else here: a notice that cannot be built must not cost balance, turbo, purge or
  // identity.
  try {
    registerPersonaNotice(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] persona-switch notice unavailable: ${String(error)}`);
  }
  // 每轮人设提醒。放在切换通知之后，两者共用 `currentModeOf`，谁也不会读到另一份解析结果。
  // 单独兜一层：提醒装不上不该拖累余额、turbo、清理与身份这些后面的能力。
  try {
    registerPersonaReminder(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] persona reminder unavailable: ${String(error)}`);
  }
  // After the modes plugin, because the sampling listener reads the persona record that plugin owns.
  // Contained on its own: a sampling failure must not cost balance, turbo, purge or identity.
  try {
    await registerSampling(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] persona sampling unavailable: ${String(error)}`);
  }
  registerBalance(ctx);
  // Contained like the reply modes and the sampling listener above, and for the same reason: the
  // effort half of this route is the part that will move to its own plugin, and a host that cannot
  // load it must cost the switches alone — not balance, purge, identity and the prompt section.
  try {
    registerTurbo(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] turbo switches unavailable: ${String(error)}`);
  }
  registerSessionPurge(ctx);
  // 委派深度的只读诊断：只报读到的原文，不改配置。
  try {
    registerSubagentDepth(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] subagent depth probe failed: ${String(error)}`);
  }
  // 子代理会话的自动清收：父会话一轮结束时，把已经跑完的子树归档后删掉，
  // 免得它们在上下文和侧栏里一直占着。失败只留日志，绝不拖累别的能力。
  try {
    const stopReaper = registerSubagentReaper(ctx);
    if (typeof stopReaper === 'function') ctx.effect?.(() => stopReaper);
  } catch (error) {
    console.warn(`[dsh-codex-ui] subagent reaper unavailable: ${String(error)}`);
  }
  // Contained: a sound that cannot be served must not cost deletion, identity, or the switch routes.
  try {
    registerAgentDoneSound(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] done-sound route unavailable: ${String(error)}`);
  }
  registerModelIdentity(ctx);
  // 侧栏快捷项：路由负责把文件内容交给客户端，工具负责让用户的 Agent 一条命令就能加。
  // 单独兜一层——配置面装不上时，侧栏只剩内置五项，别的功能一点不受影响。
  try {
    registerRailRoute(ctx);
    registerRailTool(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] rail config unavailable: ${String(error)}`);
  }
  // Contained like everything above: 回复锻造装不上时，本包其余能力照常。它自己
  // 内部也把每一步包在 try 里（投影 / ignorable shim / 路由互不牵连），这里再兜
  // 一层是防它加载期就抛。
  try {
    applyReplyForge(ctx);
  } catch (error) {
    console.warn(`[dsh-codex-ui] reply-forge unavailable: ${String(error)}`);
  }
  // 电脑操控放最后：它要 ctx.tools，注册失败只该影响它自己，上面的 UI 功能此时已全部
  // 装完。配置从插件 config 的 computerUse 段读，不写即启用。
  try {
    applyComputerUse(ctx, config?.computerUse ?? {});
  } catch (error) {
    console.warn(`[dsh-codex-ui] computer-use unavailable: ${String(error)}`);
  }
  writeIdentityStatus({ applyCompleted: true });
}
