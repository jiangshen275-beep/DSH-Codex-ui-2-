<img src="assets/codex.png" width="72" alt="Codex icon">

# dsh-codex-ui

DeepSeek Harness 的 Codex 风格 UI 插件（MIT，上游 `Loliyer520/dsh-codex-ui` 的衍生版），适配 **0.2.0-rc.2 Web**；除界面外，还带一套会真正派子代理的编排契约。

> **About this project**: a derivative of [Loliyer520/dsh-codex-ui](https://github.com/Loliyer520/dsh-codex-ui) (MIT), developed further here — three orchestration tiers, Ultra tier, enforced Chinese, session rename, archived-session deletion, subagent/branch grouping, plus a batch of fixes. **Not affiliated with or endorsed by OpenAI**; the bundled Codex icon and OpenAI Sans font belong to OpenAI — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

- **侧栏**：紧凑会话列表、项目与最近会话分组、置顶、悬浮详情卡、重命名、归档与**永久删除**、子代理 / 分支分组。
- **模型面板**：原生模型与推理强度选择、模型显示名自定义、**编排模式三档菜单**（标准 / 快速 / 超快）。
- **提示词**：DeepSeek 模式保留原版系统提示词；Codex 模式追加"严谨、理性、严肃、简短"的回复规则；强制中文，模型身份段落同时约束思考过程。
- **编排契约**：委派是默认动作——三条窄豁免 + 发答前自检；每轮 step 1–3 各注入一条带轮次号的短提醒；超快模式下每个子代理再开两个孙代理。
- **界面与其它**：浅色 / 深色 / 窄窗口适配；超快模式四档暖色递深带、努力滑条旋钮 24×24 正圆；字体与图标随包分发；设置菜单显示官方 DeepSeek API 余额（查询缓存 30 秒，密钥不出后端）。

**本版要点（1.0.0）**：首个正式版，产物 `dsh-codex-ui-1.0.0.tgz`；测试 79 条 / 78 通过 / 1 跳过 / 0 失败；界面类改动刷新页面即可，提示词契约类需重启 DSH。

## 安装

三种方式任选其一；三种方式都装到同一个 profile，**重启 Harness** 后才会加载。

**A. 本地 tarball（不依赖 registry）**

拿到 `dsh-codex-ui-1.0.0.tgz` 后，在 DSH **插件 → 添加插件**里填该文件的绝对路径，或：

```powershell
dsh plugin --profile <profile> add 'C:/path/dsh-codex-ui-1.0.0.tgz'
```

**B. npm**

```powershell
dsh plugin --profile <profile> add dsh-codex-ui@1.0.0
```

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
- 对等依赖 `@deepseek-ai/dsh 0.2.0-rc.2`；CSS 依赖参考版本的类名，升级 DSH 后需重新校验。
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
