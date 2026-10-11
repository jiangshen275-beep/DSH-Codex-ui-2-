<img src="assets/codex.png" width="72" alt="Codex icon">

# dsh-codex-ui

DeepSeek Harness 的 Codex 风格 UI 插件，适配 **0.2.0-rc.2 Web**。

> **关于本项目**：这是 [Loliyer520/dsh-codex-ui](https://github.com/Loliyer520/dsh-codex-ui) 的衍生版本（MIT），在其基础上继续开发：新增 Ultra 档与闪电编排两套提示词契约、强制中文、会话重命名、已归档会话删除、子代理/分支分组，并修掉了一批缺陷。**与 OpenAI 无隶属或背书关系**；随包分发的 Codex 图标与 OpenAI Sans 字体属于 OpenAI，授权与风险见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

- 紧凑会话侧栏、项目分组、置顶与最近会话、悬浮详情。
- 原生模型与推理强度选择、权限管理、附件、文件和插件入口。
- DeepSeek 模式保留原版系统提示词；Codex 模式追加严谨、理性、严肃、简短的回复规则。
- 浅色、深色和窄窗口适配；字体资源随插件打包。
- 左下角设置菜单显示已配置的官方 DeepSeek API 余额，提供刷新、控制台、设置、插件和帮助入口。余额由后端读取，API 密钥不会返回前端；查询缓存 30 秒。
- **强制中文**：每个被注入的会话都会收到一条语言契约——**用中文思考、用中文作答**，不得先写英文再翻译、不得留英文思考痕迹；代码、标识符、路径、命令、日志与引用原文照抄不翻译。这是既定行为而非开关，只有"该轮明确要求另一种语言"时例外；常量在 `src/turbo.js` 的 `FORCE_CHINESE`，置 `false` 即恢复可选。

## 新对话页：回复风格、标题与图标

新对话（空白会话）页面上有三个由本插件渲染的元素：

- **回复风格页签（聊天 / 工作）**：位于会话区顶部、与品牌图标同一条中线上，选中态是一枚平滑滑动的胶囊。聊天注入"说人话、先回应人"的风格，工作注入"精确、可验证"的风格。因为这时还没有会话 id，选择通过 `/api/dsh-codex-ui/turbo` 以空 sessionId 写成宿主的"下一次选择"，并记录选择时刻；宿主在**该时刻之后才开始的会话**的第一个 turn 上把风格**落章**到那个会话，此后不再改动。因此：选择只作用于当时开的那次对话，进行中的旧会话与其它会话都不受影响；打开页面时页签显示的当前值也会被记为一次选择。默认是"工作"。
- **标题**：`我们要构建什么?`。原生标题来自 `conversation` locale 字典（插件不能重复注册），所以由前端隐藏原生 span、渲染自己的标题元素；当工作区 chip 显示的是真实项目名时，标题后会追加一个项目胶囊（克隆原生 chip，去掉下拉箭头与按钮语义），在默认工作区时不显示。
- **图标**：品牌位换成 DeepSeek 鲸鱼标记，颜色跟随主题。

## Ultra 档与闪电编排

模型面板（输入框里的模型选择器）上有两个提示词层的开关，由宿主半边的 `agent/pre-step` 按会话精确注入：

- **Ultra 档**：滑条末尾追加一格 `Ultra`（模型自带 `ultra` 档时直接用该真实档）。选中时写回模型**真实的最高档**，`ultra` 从不作为推理档 id 下发；同时注入"最严验收"契约——先定验收标准、证据先于断言、对抗式复查、根因优先、显式停止条件、不许改测试迁就实现。界面进入 Ultra 时轨道有流星特效。
- **闪电编排**：点面板左上角那枚闪电启用。注入的编排契约要求父 agent 在**同一条消息里并发派发至少两个子代理**，按角度而不是复制切分，每个子代理提示词自包含，父 agent 只做编排与整合；正文末尾带防递归守卫，子代理不会继续派活。

两个开关按会话记录在 `$DSH_HOME/storages/codex-ui-turbo.json`（最多 40 个会话），通过 `/api/dsh-codex-ui/turbo` 读写。关闭时会补一条一次性"模式已关闭"提示，避免历史里那条契约继续生效。这是提示词层的能力，不会给模型加算力；闪电会显著增加 token 消耗。

## 安装

三种方式任选其一；三种方式装到同一个 profile，都需要**重启 Harness** 才会加载。

**A. 本地 tarball（不依赖 registry，最快）**

拿到 `dsh-codex-ui-1.0.0.tgz` 后，在 DSH **插件 → 添加插件**里填该文件的绝对路径，或：

```powershell
dsh plugin --profile <profile名称> add 'C:/路径/dsh-codex-ui-1.0.0.tgz'
```

**B. npm**

```powershell
dsh plugin --profile <profile名称> add dsh-codex-ui@1.0.0
```

DSH 插件页只会安装**发布满 24 小时**的版本，因此首次安装请带上版本号。

**C. 仓库 / 本地目录**

下载或克隆仓库后，可以交给启动脚本，也可以直接指向目录：

```powershell
git clone https://github.com/Loliyer520/dsh-codex-ui.git
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

从 `dsh-chatgpt-ui` 迁移时，先移除旧插件，再安装本包；启动脚本会自动完成此步骤。

```powershell
dsh plugin --profile <profile名称> remove dsh-chatgpt-ui
```

### 安装前须知

- **本插件强制中文**：装上之后，被注入的会话都会用中文思考并作答（代码与路径等保持原样）；只有该轮明确要求另一种语言时才例外。不想要这个行为，把 `src/turbo.js` 里的 `FORCE_CHINESE` 改成 `false`。
- 本插件通过 `cordis.patch.yml` **禁用内置 `ui-sidebar`** 并插入自己的侧栏（右侧栏仍由宿主提供，本插件不接管）；这会改变界面结构。想先试用，请装到一个独立 profile。
- **已知限制**：插件管理页里的启用/停用开关**对本插件无效**——它是以自定义 id 插入的，页面按包名写开关。要停用请从 profile 的 `cordis.patch.yml` 里移除对应的插入条目，或直接卸载。
- 对等依赖为 `@deepseek-ai/dsh 0.2.0-rc.2`；CSS 依赖参考版本的类名，升级 DSH 后需要重新校验。
- 包内包含 `src/`：`lib/index.js` 运行时导入 `../src/*.js`，因此不要只发布 `lib/`。
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
