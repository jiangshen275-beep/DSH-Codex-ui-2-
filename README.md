<img src="assets/codex.png" width="72" alt="Codex icon">

# dsh-codex-ui

DeepSeek Harness 的 Codex 风格 UI 插件（MIT，上游 `Loliyer520/dsh-codex-ui` 的衍生版），适配 **0.2.0-rc.2 Web**（CHANGELOG 另记录对照过 0.2.1-rc.2）；本包不声明 DSH 版本范围——DSH 的兼容门只认 `peerDependencies`，写死版本会让别的 DSH 版本装不上，兼容性改由实测对照保证（理由见〈安装前须知〉）；除界面外，还带一套通过系统提示词注入的编排契约——派发动作由模型按契约执行，插件本身不调用子代理工具。

> **2.0 是破坏性版本（自 2.0.0 起；2.0.1 / 2.0.2 仅为版本号调整，功能与 2.0.0 相同），需要配套插件。** 输入框右下角那一整块（模型选择器 + 推理强度条 + 流星）已拆成独立插件 `dsh-codex-ui-reasoning`，**必须一起装**：只装主包时右下角会退回 DSH 原生模型选择器，没有强度条、也没有流星。两个都装时要给副包配 `promptInjection: false`，否则同一套提示词会注入两遍。升级步骤、分工表、回滚办法与可直接粘贴的 `cordis.patch.yml` 片段见 **[MIGRATION-2.0.zh.md](MIGRATION-2.0.zh.md)**。下面功能清单里凡涉及模型选择器、推理强度条、流星的部分，自 2.0 起由副包提供。
>
> **2.0 is a breaking release (from 2.0.0; 2.0.1 / 2.0.2 are version-number bumps only, functionally identical to 2.0.0) and needs a companion plugin.** The model selector, the reasoning-effort slider and the meteor effect moved into `dsh-codex-ui-reasoning`; installing the main package alone falls back to DSH's stock model selector, with no slider and no meteors. See [MIGRATION-2.0.zh.md](MIGRATION-2.0.zh.md) for the split of responsibilities, the required `promptInjection: false` config for the companion, and the rollback steps.

![界面预览：新对话页](assets/screenshot-1.0.0.png)

*界面预览：新对话页——左侧是插件重绘的侧栏；会话区顶部居中是聊天 / 工作两个页签（截图时选中「工作」，即默认值）。*

> **About this project**: a derivative of [Loliyer520/dsh-codex-ui](https://github.com/Loliyer520/dsh-codex-ui) (MIT), developed further here — three orchestration tiers, Ultra tier, enforced Chinese, session rename, archived-session deletion, subagent/branch grouping, plus a batch of fixes. **Not affiliated with or endorsed by OpenAI**; the bundled Codex icon and OpenAI Sans font belong to OpenAI — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

- **侧栏**：紧凑会话列表、项目与最近会话分组、置顶（调用宿主 workspace 接口）、悬浮预览卡、重命名、归档（宿主能力）与**永久删除**（仅限已归档会话）、子代理 / 分支分组。
- **模型面板**（面板 UI、滑条与流星自 2.0 起由副包 `dsh-codex-ui-reasoning` 渲染；主包只保留模型身份段落与注入侧）：原生模型与推理强度档位（列表来自宿主）、模型显示名自定义（同时写入"模型身份"提示词段落）、**编排模式三档菜单**（标准 / 快速 / 超快）、滑条末追加虚拟 **Ultra 格**并注入"最严验收"契约、开启编排时披露 token 成本倍率（1.5× / 2.5×）。
- **提示词**：DeepSeek 模式不追加本插件的风格段（宿主原版系统提示词不受影响，中文策略与模型身份段仍生效）；Codex 模式追加"严谨、理性、严肃、简短"的回复规则；强制中文，模型身份段落同时约束思考过程；新对话页有回复风格页签与品牌图标。
- **编排契约**：快速 / 超快已开启的会话里，委派按四条客观条件触发——答案依赖本机没有的事实、改动或判断跨两处以上、两个各自能翻盘的未知、明确要求多角度；四条都不成立时单路做完，并须点名哪条为假。每轮 step 1–3 各注入一条带轮次号的短提醒（step 4 起不再注入）；超快模式下每个**一级**子代理再开两个孙代理，**二级即止**。
- **界面与其它**（其中滑条与流星属副包）：浅色 / 深色 / 窄窗口适配；超快模式滑条四段暖色递深（minimal·low / high / xhigh·max / ultra 渐变）；努力滑条旋钮 24×24 正圆（常态带投影，超快 + Ultra 态加描边与发光）；字体与图标随包分发（字体以 base64 内联进 `lib/client.js`）；设置菜单显示官方 DeepSeek API 余额（服务端缓存 30 秒，只有校验过的余额字段回到前端），并带刷新 / 控制台 / 设置 / 插件 / 帮助入口。

**当前版本（2.0.2）**：产物 `dsh-codex-ui-2.0.2.tgz`（`npm pack` 生成，不入库）；2.0.1 / 2.0.2 仅为版本号调整（移除 `peerDependencies` 声明），功能与 2.0.0 相同；1.0.0 与 1.1.0 的历史要点见 [CHANGELOG.md](CHANGELOG.md)。界面类改动刷新页面即可，提示词契约类需重启 DSH。

## 安装

三种方式任选其一；三种方式都装到同一个 profile，**重启 Harness** 后才会加载。

**A. 本地 tarball（不依赖 registry）**

拿到 `dsh-codex-ui-2.0.2.tgz` 后，在 DSH **插件 → 添加插件**里填该文件的绝对路径，或：

```powershell
dsh plugin --profile <profile> add 'C:/path/dsh-codex-ui-2.0.2.tgz'
```

**B. npm**

```powershell
dsh plugin --profile <profile> add dsh-codex-ui@2.0.2
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
