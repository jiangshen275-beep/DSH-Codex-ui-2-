# 从 1.1.0 升到 2.0.0

> **前提已变（2026-10-18 更正）。** 本文描述的是 2.0.0 那次发布时的拆包态，与当前主干不一致：主包后来把整套模型面板合了回来（`src/client.js:600` 无条件调用 `registerModelUI(ctx)`，`src/style.css` 仍有 365 行 `.cg-model-*`、596 处），而 `dsh-codex-ui-reasoning` 也已自带样式表、根属性 `data-chatgpt-ui` 与整套注入层，可以单独安装。因此下面「主包不再注册 `conversation.input.model`」「主包单独装会缺块」「必须一起装」「要给副包配 `promptInjection: false`」这几条都不再成立。现行关系是：**主包完整；副包是给只需要强度条、不想要整套 Codex 界面的人准备的可选独立件；两者都向单种类槽位 `conversation.input.model` 注册，同装必有一个被拒，二选一。** 本文其余部分保留为历史的升级与回滚记录，不要照它安装。

## 一句话

输入框右下角那一整块（**模型选择器 + 推理强度条 + 流星**）已经从本包拆出去，成为独立插件 `dsh-codex-ui-reasoning`。主包不再注册 `conversation.input.model` 槽位，也不再带那批样式。

## 升级后必须做的事

**主包单独装会缺块。** 2.0.0 的主包：

- 不注册 `conversation.input.model`（`src/model-ui.js` 删掉 13 行注册块）；
- `src/style.css` 里已无 `.cg-model-*` 选择器（79 条随面板搬走，文件 **148,820 → 71,360 字节**）；
- `src/turbo.js` 只**读** `storages/codex-ui-effort.json`，写侧下线（收到 effort 更新返回 `turbo/effort-moved`）。

只装主包的后果，逐条对应：

1. 右下角退回 **DSH 原生模型选择器** —— 没有本插件的模型面板，也没有显示名自定义入口；
2. 没有推理强度条、没有 Ultra 档、没有流星；
3. 三档开关（Ultra / 闪电 / 超快）**无处可拨**。主包只读 `codex-ui-effort.json`，没人再写它：记录里已经是 `true` 的会话仍会照原样注入（读侧没动），但从界面上改不了了 —— 没有面板就没有开关。

旧记录 `$DSH_HOME/storages/codex-ui-turbo.json` 不会被删。拆包迁移要等 `codex-ui-effort.json` 真正出现在磁盘上，才会把旧文件改名为 `.migrated`；所以「先装主包、后装副包」不会丢数据，副包会从这份旧文件里把强度那一半补出来。

## 两个包各自管什么

| 能力 | `dsh-codex-ui`（主包） | `dsh-codex-ui-reasoning`（副包） |
| --- | --- | --- |
| 侧边栏、工作区导航 | ✓ | |
| 人设（`CHAT_PERSONA` / `WORK_PERSONA`）、中文约束、`OFF_NOTICE`、`presetSilences` | ✓ | |
| 模型身份提示词段落 | ✓ | |
| 余额、会话清理 | ✓ | |
| 峰谷徽标（仍注册 `conversation.session.header.actions`） | ✓ | |
| 皮肤（`data-chatgpt-ui`） | ✓ | |
| 右下角模型选择器 | | ✓ |
| 推理强度条、Ultra 档 | | ✓ |
| 流星 | | ✓ |
| 三档契约文本注入 | ✓（读侧仍在） | ✓ |
| `storages/codex-ui-effort.json` | 只读 | **唯一写入方** |

装一个就少一半，两个都装才是完整界面。

## 两个都装时：必须关掉副包的提示词注入

主包的注入是副包的超集（多 persona、中文约束、`OFF_NOTICE`）。两个都注册，同一会话每步会收到**两份**合同 + 两份提醒。

在 profile 的 `cordis.patch.yml` 里加这一段：

```yaml
- id: codex-reasoning-ui
  name: 'dsh-codex-ui-reasoning'
  config:
    promptInjection: false
```

两点必须照抄：

- **`id` 写 `codex-reasoning-ui`，不是包名。** patch 按 `id` 定位行，`name` 才决定加载哪个模块；`codex-reasoning-ui` 是副包自己 `cordis.patch.yml` 里 `- insert:` 声明的行 id。写成包名匹配不到任何行，宿主只会 warn 一句然后跳过 —— 注入仍然是开的。
- **不要用 `disabled: true` 代替。** 那会把 `/effort` 路由和 `codex-ui-effort.json` 的写入一起拿走，面板的读写会变成 404。

副包独立部署时默认是**开的**：它不导出 `Config` schema，拿到的是原始 `config` 对象，只有显式 `false` 才关（`"false"` 这种字符串按「读不懂」处理，仍然开着）。关掉后宿主日志会有一行 `[dsh-codex-ui-reasoning] effort injection off by config (promptInjection: false)`；更可靠的确认是看 `$DSH_HOME/storages/codex-ui-injection.json` —— 生效时 `enabled` 变成 `false`、`source` 变成 `config`。改完 patch 必须**重启 DSH**，热改不会重算已加载那一行的 config。

## 对等依赖声明（`peerDependencies`）已整个删除

原声明是 `"@deepseek-ai/dsh": "0.2.0-rc.2"`（精确版，`peerDependenciesMeta` 里标 `optional: true`）。2.0.1 / 2.0.0 把它删掉了：`package.json` 里现在既没有 `peerDependencies`，也没有 `peerDependenciesMeta`。

删的原因不是「声明无效」，而是**它有效，而且是一道硬门槛**：DSH 的兼容门只读 `peerDependencies` 字段，用 `semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })` 判版本，并且**不读 `peerDependenciesMeta`** —— 所以标 `optional: true` 也不免除拦截。写死 `0.2.0-rc.2` 的实际后果是别的 DSH 版本一律装不上，只能逐个 `allow-version` 精确豁免：1.1.0 那版装在 `dsh 0.2.1-alpha.3` 上就必须用 `--accept-risk` 豁免（见 [CHANGELOG.md](CHANGELOG.md) 的 `1.1.0+0.2.1-alpha.3` 条）。

**不声明范围 = 任何 DSH 版本都装得进去，但功能是否正常要实测。** 安装不再有版本门；兼容性只由 [CHANGELOG.md](CHANGELOG.md) 里对照过的版本（`0.2.0-rc.2` / `0.2.1-rc.2`）和实测保证，不由声明保证。

## 回滚到 1.1.0

1.1.0 自带完整面板与样式，回滚后不需要副包。

```powershell
dsh plugin --profile <profile> remove dsh-codex-ui-reasoning
dsh plugin --profile <profile> add 'C:/路径/dsh-codex-ui-1.1.0.tgz'
```

再把 profile `cordis.patch.yml` 里那段 `codex-reasoning-ui` 删掉。留着也无害：包已卸载，这一行匹配不到模块。

数据侧有一件事必须做。1.1.0 只认 `$DSH_HOME/storages/codex-ui-turbo.json` 这一个文件；2.0.0 已经把这份记录拆成 `codex-ui-persona.json` + `codex-ui-effort.json`，并把原文件改名为 `codex-ui-turbo.json.migrated`（重命名，不删数据）。不改名回去，1.1.0 会当成全新安装，三档开关全部回到未开启：

```powershell
Rename-Item "$env:DSH_HOME/storages/codex-ui-turbo.json.migrated" "codex-ui-turbo.json"
```

界面类改动用完刷新页面即可；提示词注入类改动需要重启 DSH。

## 已知遗留

`src/model-ui.js` 里 `ModelControl` 已无调用点（面板搬走后留下的死代码），但该文件里仍有 **83 处** `cg-model-*` 类名。`src/style.css` 侧的 `.cg-model-*` 规则是清干净了的（0 条，见上文），所以这批类名没有对应样式 —— 搬走后没清理干净的残留，不影响运行。
