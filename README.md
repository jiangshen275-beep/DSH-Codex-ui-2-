<img src="assets/codex.png" width="72" alt="Codex icon">

# dsh-codex-ui

DeepSeek Harness 的 Codex 风格 UI 插件（MIT，上游 `Loliyer520/dsh-codex-ui` 的衍生版），适配 **0.2.0-rc.2 Web**（CHANGELOG 另记录对照过 0.2.1-rc.2）；本包不声明 DSH 版本范围——DSH 的兼容门只认 `peerDependencies`，写死版本会让别的 DSH 版本装不上，兼容性改由实测对照保证（理由见〈安装前须知〉）；除界面外，还带一套通过系统提示词注入的编排契约——派发动作由模型按契约执行，插件本身不调用子代理工具。

> **本包是完整版，同时我新增了子项目，单独的滑动推理强度条，输入框右下角那一整块（模型选择器 + 推理强度条 + 流星）都在里面。** 这独立插件 `dsh-codex-ui-reasoning`，给不想要整套 Codex 界面、只想要那个模型选择与强度条的人单独使用：它自带样式表、根属性与注入层，只装它也能工作。两者面板是同一份代码，都注册 `conversation.input.model` 这个**单一类槽位**（`priority: -10`），同时启用必有一个注册被拒，所以是二选一，不要同装。早期拆包版曾声明「必须一起装」，该叙述已作废——本仓库主干已把面板合回主包，时间线见 **[MIGRATION-2.0.zh.md](MIGRATION-2.0.zh.md)**。
>
> **This package is the complete one: the model selector, the reasoning-effort slider and the meteor effect all ship inside it — nothing else has to be installed.** `dsh-codex-ui-reasoning` is a separate, optional plugin for people who do not want the whole Codex skin but do want that picker and slider; it carries its own stylesheet, root attribute and injection layer, so it works on its own. Both packages mount the *same* panel code into the single-kind `conversation.input.model` slot at `priority: -10`, so enabling both means one registration is refused: pick one, do not install both. The 2.0.0 note that called the split breaking and required the companion is void — the main package has carried the full UI again since 2.0.1 / 2.0.0; see [MIGRATION-2.0.zh.md](MIGRATION-2.0.zh.md) for the timeline.

![界面预览：新对话页](assets/screenshot-1.0.0.png)

*界面预览：新对话页——左侧是插件重绘的侧栏；会话区顶部居中是聊天 / 工作两个页签（截图时选中「工作」，即默认值）。*

> **About this project**: a derivative of [Loliyer520/dsh-codex-ui](https://github.com/Loliyer520/dsh-codex-ui) (MIT), developed further here — three orchestration tiers, Ultra tier, enforced Chinese, session rename, archived-session deletion, subagent/branch grouping, plus a batch of fixes. **Not affiliated with or endorsed by OpenAI**; the bundled Codex icon and OpenAI Sans font belong to OpenAI — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## The three big things in 3.0.0

**1. Replies become editable.** Every finished reply and every reasoning block gains an entry point; open it, rewrite the text, and it is written back into the session record. What gets written is the original event the host understands, not a display-layer patch — reopen, refresh, or let the model re-read the context and it sees the edited sentence. The previously separate `dsh-codex-ui-HF` (Reply Forge) now ships inside this package.

**2. The sidebar is handed to the Agent.** Below the five hard-coded buttons there is now an extensible strip. Say "帮我增加侧边栏" and the Agent reads its manual, asks what the button should do when clicked, and only then installs it — pointing at one of four targets: a panel, a settings page, a URL, or a local program/document. Three custom slots at most (five built-ins, eight total); the rest wait in the "more" table, where any entry can be raised, hidden, or deleted. Links and programs are opened by the DSH host process, so `steam://`-style protocols and `D:\qq\QQ.exe` both work even when the GUI is used from a browser. Two manuals: [SIDEBAR-RAIL.zh.md](SIDEBAR-RAIL.zh.md) for the Agent, [SIDEBAR-RAIL-USER.zh.md](SIDEBAR-RAIL-USER.zh.md) for people.

**3. DSH can drive the computer.** Screenshots, a window tree, pointer movement, clicks, typing, scrolling, dragging — while it controls, a hint stays at the top of the screen and its second line names the current target (e.g. "正在点击 (320, 480) · 记事本"). The previously separate `dsh-computer-use` now ships inside this package; turn it off with `computerUse.enabled: false`, leave it unset and it is on.


- **侧栏**：紧凑会话列表、项目与最近会话分组、置顶（调用宿主 workspace 接口）、悬浮预览卡、重命名、归档（宿主能力）与**永久删除**（仅限已归档会话）、子代理 / 分支分组。
- **模型面板**（面板 UI、滑条与流星都在本包内；`dsh-codex-ui-reasoning` 是同一份面板的独立精简版，二者不要同装）：原生模型与推理强度档位（列表来自宿主）、模型显示名自定义（同时写入"模型身份"提示词段落）、**编排模式三档菜单**（标准 / 快速 / 超快）、滑条末追加虚拟 **Ultra 格**并注入"最严验收"契约、开启编排时披露 token 成本倍率（1.5× / 2.5×）。
- **提示词**：DeepSeek 模式不追加本插件的风格段（宿主原版系统提示词不受影响，中文策略与模型身份段仍生效）；Codex 模式追加"严谨、理性、严肃、简短"的回复规则；强制中文，模型身份段落同时约束思考过程；新对话页有回复风格页签与品牌图标。
- **编排契约**：快速 / 超快已开启的会话里，委派按四条客观条件触发——答案依赖本机没有的事实、改动或判断跨两处以上、两个各自能翻盘的未知、明确要求多角度；四条都不成立时单路做完，并须点名哪条为假。每轮 step 1–3 各注入一条带轮次号的短提醒（step 4 起不再注入）；超快模式下每个**一级**子代理再开两个孙代理，**二级即止**。
- **会话改写**：每条回复与每条思维链旁有入口，点开改写后写回会话记录（写的是宿主认得的原始事件，重开与重载都保留）；思维链的改写记录在本地重放，被宿主重绘覆盖时补回去。原 `dsh-codex-ui-HF` 并入本包。
- **自定义侧边栏**：内置五颗按钮下方开放最多三格给自定义快捷项，四类目标（面板 / 设置页 / 网址 / 本机程序或文档），带图标的悬停说明、显示与隐藏、两段式确认的删除；条目可由 Agent 通过 `sidebar_rail` 工具增删，也可直接写 `$DSH_HOME/dsh-codex-ui-rail.json`，界面 15 秒内自己同步。
- **模型面板**（面板 UI、滑条与流星都在本包内；`dsh-codex-ui-reasoning` 是同一份面板的独立精简版，二者不要同装）：原生模型与推理强度档位（列表来自宿主）、模型显示名自定义（同时写入"模型身份"提示词段落）、**编排模式三档菜单**（标准 / 快速 / 超快）、滑条末追加虚拟 **Ultra 格**并注入"最严验收"契约、开启编排时披露 token 成本倍率（1.5× / 2.5×）。
- **提示词**：DeepSeek 模式不追加本插件的风格段（宿主原版系统提示词不受影响，中文策略与模型身份段仍生效）；Codex 模式追加"严谨、理性、严肃、简短"的回复规则；强制中文，模型身份段落同时约束思考过程；新对话页有回复风格页签与品牌图标。
- **编排契约**：快速 / 超快已开启的会话里，委派按四条客观条件触发——答案依赖本机没有的事实、改动或判断跨两处以上、两个各自能翻盘的未知、明确要求多角度；四条都不成立时单路做完，并须点名哪条为假。每轮 step 1–3 各注入一条带轮次号的短提醒（step 4 起不再注入）；超快模式下每个**一级**子代理再开两个孙代理，**二级即止**。
- **电脑控制**：截屏、窗口树检查、指针移动、点击、键入、滚动、拖拽；控制期间屏幕顶部常驻提示并实时显示当前目标（如「正在点击 (320, 480) · 记事本」）。原 `dsh-computer-use` 并入本包，配置 `computerUse.enabled: false` 可关（不写即开）。
- **界面与其它**：浅色 / 深色 / 窄窗口适配；超快模式滑条四段暖色递深（minimal·low / high / xhigh·max / ultra 渐变）；努力滑条旋钮 24×24 正圆（常态带投影，超快 + Ultra 态加描边与发光）；字体与图标随包分发（字体以 base64 内联进 `lib/client.js`）；设置菜单显示官方 DeepSeek API 余额（服务端缓存 30 秒，只有校验过的余额字段回到前端），并带刷新 / 控制台 / 设置 / 插件 / 帮助入口。

**当前版本（3.0.0）**：产物 `dsh-codex-ui-3.0.0.tgz`（`npm pack` 生成，不入库）。3.0.0 把三个原本独立的项目并回主干——回复锻造（会话改写）、可自定义侧边栏、电脑操控——安装方式没变，装一个包就有全部能力。2.x 的历史要点见 [CHANGELOG.md](CHANGELOG.md)。界面类改动刷新页面即可，提示词契约类与宿主侧改动（侧边栏的链接/程序启动、电脑控制）需要重启 DSH。

## 安装

三种方式任选其一；三种方式都装到同一个 profile，**重启 Harness** 后才会加载。

**A. 本地 tarball（不依赖 registry）**

拿到 `dsh-codex-ui-2.0.0.tgz` 后，在 DSH **插件 → 添加插件**里填该文件的绝对路径，或：

```powershell
dsh plugin --profile <profile> add 'C:/path/dsh-codex-ui-2.0.0.tgz'
```

**B. npm**

```powershell
dsh plugin --profile <profile> add dsh-codex-ui@2.0.0
```

> ⚠️ **这个包目前还没有发布到 npm**（公共 registry 上会返回 404）——现在执行上面这条会失败，首次安装请用上面的 A 或 C 方式。若你打算发布到 npm，这条命令在发布满 24 小时后即可用。

DSH 插件页只安装**发布满 24 小时**的版本，首次安装请带上版本号。

**C. 仓库 / 本地目录**

下载或克隆仓库后，可交给启动脚本，也可直接指向目录：

```powershell
git clone https://github.com/jiangshen275-beep/DSH-Codex-ui-2-.git
cd dsh-codex-ui
.\start-ui.ps1
```

启动脚本默认使用本机 `.dsh-win/versions/0.2.0-rc.2/dsh.cmd`，创建独立的 `codex-ui` Web profile，并打开端口 3088。也可指定位置和端口：

```powershell
.\start-ui.ps1 -Dsh 'C:/路径/dsh.cmd' -Profile codex-ui -Port 3089
```

安装到已有的自定义 Web profile：

```powershell
dsh plugin --profile <profile名称> add 'file:C:/路径/dsh-codex-ui'
```

从 `dsh-chatgpt-ui` 迁移时，先移除旧插件，再安装本包；启动脚本会自动完成此步骤。重启 Harness 后加载新版。

```powershell
dsh plugin --profile <profile名称> remove dsh-chatgpt-ui
```

### 安装前须知

- 本插件通过 `cordis.patch.yml` **禁用内置 `ui-sidebar`** 并插入自己的侧栏（右侧栏仍由宿主提供，本插件不接管），会改变界面结构；想先试用请装到独立 profile。
- **强制中文**：被注入的会话会用中文思考并作答（代码与路径保持原样），只有该轮明确要求另一种语言时才例外；把 `src/turbo.js` 的 `FORCE_CHINESE` 置 `false` 即恢复可选。
- **已知限制**：插件管理页的启用/停用开关对本插件无效（它按包名写开关，而本插件以自定义 id 插入）。停用请从 profile 的 `cordis.patch.yml` 移除插入条目，或直接卸载。
- 随包的 Codex 图标与 OpenAI Sans 字体属于 OpenAI，授权与风险见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)；与 OpenAI 无隶属关系。
- 本包**不声明 DSH 版本范围**：DSH 的插件兼容门只读 `peerDependencies`（`dsh-app-boot` 按 `includePrerelease` 判 semver，且不读 `peerDependenciesMeta`，所以标 `optional` 也不免除拦截），写死 `0.2.0-rc.2` 会让别的 DSH 版本装不上、必须逐个 `allow-version` 精确豁免（1.1.0 那版就如此）；兼容性因此由实测对照保证——CHANGELOG 记录对照过 0.2.0-rc.2 / 0.2.1-rc.2。CSS 依赖参考版本的类名，升级 DSH 后需重新校验。
- 包内含 `src/`：`lib/index.js` 运行时导入 `../src/*.js`，不要只发布 `lib/`。
- 变更记录见 [CHANGELOG.md](CHANGELOG.md)。


## 开发

仓库包含已构建的 `lib/client.js`，安装插件无需重新构建。修改源码后执行：

```powershell
npm install
npm run build
npm run check
npm test
```

测试需要本机安装参考版本的 DSH；可通过 `DSH_RUNTIME_PACKAGES` 指定其 `node_modules/.pnpm` 目录。

## 卸载

```powershell
dsh plugin --profile codex-ui remove dsh-codex-ui
```

重启后恢复原生侧栏。仅验证过 Web；CSS 部分依赖参考版本的类名，升级 DSH 时需要重新校验。定时任务页面目前只保存本地草稿。Codex 模式仅改变提示词风格，不会将 DeepSeek 模型变为 OpenAI 模型。

提示词说明见 [SYSTEM-PROMPT-PLAN.zh.md](SYSTEM-PROMPT-PLAN.zh.md)，本机资源定位方法见 [RESOURCE-REFERENCE.zh.md](RESOURCE-REFERENCE.zh.md)。第三方图标和字体的来源见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。本项目为个人界面插件，与 OpenAI 无隶属关系。
