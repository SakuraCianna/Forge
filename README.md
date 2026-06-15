# Forge

[中文](README.md) | [English](README.en.md)

Forge 是一个开源的本地 AI 编程 Agent 桌面应用。它面向真实项目工作流, 不是 VS Code fork, 也不是编辑器插件市场。用户可以选择本地项目, 配置自己的模型和 Provider, 让 Agent 生成计划, 审查文件修改, 运行验证命令, 并按当前权限模式完成 Git 操作。

Forge 的目标是把 AI 编程从“聊天里的建议”推进到“可审查, 可恢复, 可验证的本地工程流程”。

> ⚠️ Forge 当前仍处于 0.x 早期开发阶段。
> 部分功能可能不完整、不稳定，接口和行为也可能发生变化。
> 目前更适合试用、反馈和早期探索，不建议用于生产环境。

## 功能特性

### 本地项目工作台

- 打开本地项目目录并建立项目文件索引。
- 浏览文件树, 预览文本、代码、Markdown、图片、PDF、音频和视频等内容。
- 项目文件树会展示非敏感文件, 即使普通文件被 `.gitignore` 忽略也可在界面中浏览。
- Agent 的目录列表、文本搜索和 glob 工具仍遵循 `.gitignore`, 用于控制自动化搜索范围和大项目性能。
- `.env`、私钥、证书、凭据目录、数据库文件等敏感路径默认不会进入 Agent 文件工具或预览流程。
- 文件页支持按目录懒加载和大目录分页, 避免一次性渲染完整大项目文件树。
- 项目扫描会复用进行中的同路径索引和最近内存索引, 扫描元数据和全文搜索快照也会缓存在本地应用数据目录, 用于后续加速。
- AI 生成的文件修改默认先进入待审查区, 用户确认后才写入磁盘; 完全访问权限下, Agent 计划生成的文件修改和本地命令会自动执行, 不再额外弹出命令批准或内置工具确认。

### Agent 任务线程

- 每个任务以独立线程组织, 记录用户请求、模型计划、执行日志、文件事件和命令结果。
- 计划会被解析为读取文件、目录列表、glob、文本搜索、文件编辑、命令执行、Git 检查和人工确认等动作。
- Agent Profile 可以控制系统提示词、上下文预算、计划步数、自动推进上限、验证策略、失败恢复策略、恢复次数和工具权限。
- 确认队列会汇总待审查 diff、命令审批、人工门禁、提交门禁和失败恢复步骤。
- Stop 会暂停队列, 恢复后不会跳过 diff 审查、命令审批或提交门禁。
- 失败恢复会基于真实工具结果和命令输出生成后续计划。完全访问权限下, 本地依赖安装、文件删除和 Git 动作会继续自动推进; 外部服务权限和生产发布仍需要按对应扩展或平台策略处理。
- 普通问答、解释、记忆和聊天类请求不会强行进入项目改动流程。

### Built-in Tools 内置工具体系

- 内置工具统一注册到 8 个一级分类: Project、File、Search、Edit、Terminal、Git、Diagnostics 和 Auxiliary。
- 工具元数据包含名称、说明、分类、风险等级、确认要求、输入输出 Schema、可用状态和执行入口。
- 普通权限模式下, 写文件、删文件、移动文件、应用补丁、安装依赖、提交、切换分支、撤销修改和 push 仍会进入确认队列。
- Full Access 统一表示自动运行本地 Agent 队列动作, 包括命令、依赖安装、文件写入、内置工具和 Git 动作。
- critical 工具仍保留 typed confirmation 元数据, 用于普通权限模式和审计视图展示工具名、风险等级、影响目标、操作后果和是否可撤销。
- 工具调用会记录结构化审计日志和本地质量指标, 用于追踪成功率、失败、确认阻断和 Full Access 自动授权执行。
- `searchSemantic` 当前使用本地轻量语义 fallback, 不调用 embedding 模型, 不读取敏感文件, 返回结果会标注 `local_semantic_fallback`。
- 浏览器截图和页面控制台检查使用受限本地预览 URL, 截图默认写入应用数据目录并返回文件路径、尺寸和大小, 避免把大图直接塞入上下文。

### 输入框、附件和上下文引用

- 输入框支持通过加号菜单、拖拽和粘贴添加附件。
- 支持图片、PDF、DOCX、XLSX、CSV、TSV、Markdown、JSON、代码文件和常见文本文件。
- 图片和扫描 PDF 可在本地 Worker 中进行 OCR, 避免阻塞主界面。
- DOCX、XLSX、CSV 和 TSV 会在本地解析为可控大小的文本摘要。
- 敏感附件会默认跳过, 避免误把密钥或本地数据加入模型上下文。
- 输入 `/` 可以打开 Forge 命令和技能候选, 命令会执行界面操作而不是作为普通对话文本发送。
- `/init` 会在当前项目创建默认 `AGENTS.md`, 如果文件已存在则只打开预览, 不覆盖原内容。
- `/compact` 会压缩当前对话的旧上下文; 当线程接近上下文预算时, Forge 也会自动压缩旧上下文并保留摘要。
- 输入 `@` 可以搜索文件、插件和技能。
- 通过加号菜单或候选列表引入的文件、插件和技能会作为当前任务上下文发送。

### 插件与技能

- 侧边栏提供插件目录, 插件用于组织一组可复用技能。
- Forge 会扫描本机常见 skill 目录, 包括 `~/.codex/skills`、`~/.agents/skills` 和 Codex 插件缓存中的 `SKILL.md`。
- 插件页可以在“插件”和“技能”列表之间切换。
- 插件详情展示插件包含的技能。
- 技能详情展示来源、本机路径、核心文件和 `SKILL.md` 只读内容。
- GitHub 扩展入口支持打开 `https://github.com/owner/repo` 或 `owner/repo` 格式的仓库。
- 当前版本不会自动 clone、安装或执行第三方插件代码。

### Extensions 扩展

- 侧边栏提供独立的扩展页面, 与插件和技能区分开。
- 扩展用于连接外部服务, 能读取、创建或修改外部系统中的真实数据。
- 内置 QQ Mail 扩展支持列出收件箱、读取邮件、搜索邮件、创建草稿和发送邮件。
- 内置服务扩展覆盖 GitHub、GitLab、Bitbucket、Confluence Cloud、Slack、Notion、Airtable、HubSpot、Salesforce、Zendesk、Intercom、Freshdesk、Pipedrive、Todoist、Asana、ClickUp、monday.com、Trello、Stripe、Shopify、Mailchimp、Postmark、Twilio、Google Calendar、Calendly、Miro、Zoom、Figma、Gmail、Google Drive、Dropbox、Microsoft 365、Linear、Sentry、PagerDuty、Datadog、Cloudflare、Okta、Jira Cloud 和 Discord。
- 扩展凭据保存在 Electron 主进程侧的安全存储中, 页面只展示配置状态和尾号提示。
- 支持 OAuth 元数据和网页登录授权基座。Google Calendar、Gmail 和 Google Drive 使用 Forge 内置桌面 OAuth 应用配置, GitHub 支持 device flow, Linear 支持 loopback + PKCE, 需要 HTTPS 回调或 client secret 的服务通过 Forge OAuth broker 接入。
- 用户只需在扩展页点击“网页登录授权”, 授权完成后 token 会自动保存到安全存储。走连接器/OAuth 的内置扩展不再展示手动 token 输入框。OAuth Client ID、Client Secret、同意屏幕和 broker 部署属于产品维护者发布前配置, 不应要求普通用户自行创建。
- Salesforce、Zendesk、Intercom、Freshdesk、Pipedrive、Trello、Stripe、Shopify、Mailchimp、Postmark、Twilio、PagerDuty、Datadog、Cloudflare 和 Okta 当前使用手动保存的服务 token 或 API key, 适合先开放稳定的只读动作。
- 扩展权限支持 allow、ask 和 deny, 调用日志只保存输入和输出摘要。
- Agent 可以把已启用扩展作为工具动作调用, 但必须通过 Agent Profile 工具权限和扩展权限检查。
- `sendEmail` 始终要求用户二次确认, Forge 不会让 Agent 静默发送邮件。

### 模型与 Provider

Forge 内置多种 Provider 预设, 包括 OpenAI、Anthropic、Gemini、OpenRouter、DeepSeek、Kimi、DashScope、Z.AI、MiniMax、SiliconFlow、Volcengine、Qianfan、Hunyuan、Groq、Together AI、Mistral AI、xAI、Fireworks AI、Cerebras、StepFun、ModelScope、Xiaomi MiMo、GitHub Models / Copilot 和 Ollama。

用户也可以添加自定义 OpenAI-compatible API Provider, 并配置 Base URL、API Key、模型列表和价格信息。

模型选择器支持:

- 拉取远端模型列表。
- 手动添加模型 ID。
- 按 Provider、模型 ID 和名称搜索。
- 启用或禁用模型。
- 显示上下文窗口、工具调用、流式输出、vision、reasoning、pricing 和价格来源等元信息。
- 自动过滤明显不适合编码任务的语音、图像、嵌入和审核类模型。

### 命令、Git 和验证

- 在当前项目目录内运行受控命令。
- 命令输出会写入任务线程。
- 支持取消运行中的命令。
- 支持命令安全规则和人工审批。
- 支持只读、自动审查和完全访问三档权限模式。
- 查看 Git 状态和 diff 摘要。
- 用户输入提交信息后创建 Git commit。
- 支持显式 push 或在提交时选择 push; 普通权限模式下需要确认, Full Access 下可由 Agent 队列自动执行。
- 从项目菜单创建永久 Git worktree, 并加入最近项目列表。

### 个性化、记忆和用量

- 内置开发、审查和文档 Agent Profile。
- 支持项目隔离的 Agent 记忆。Forge 会在项目扫描时读取根目录 `MEMORY.md`, Agent 可通过 `writeProjectMemory` 无感创建或更新其中的受控记忆区, 用户显式要求“记住”的项目规则也会同步写入该文件, 长线程上下文压缩摘要也会在绑定项目时沉淀为 `MEMORY.md` 记忆, 用于长期项目约定、用户纠正和可复用决策。
- `writeProjectMemory` 写入前会脱敏常见 key、token、password、cookie、私钥和云访问密钥片段; 写入失败会记录到当前线程事件, 不会假装记忆已经落盘; 旧版 `.forge/project-memory.json` 仍可兼容读取, 下一次写入会落到 `MEMORY.md`。
- 支持回复风格、自定义指令、背景图和界面语言设置。
- 支持本地 token 用量记录和成本估算。
- 用量估算基于本地记录、缓存 token 和用户配置的价格表, 不代表 Provider 最终账单。

## 技术栈

- Electron / electron-vite
- React
- TypeScript
- Tailwind CSS
- Radix UI
- Lucide React
- Shiki
- Tesseract.js
- PDF.js
- Mammoth
- read-excel-file
- ImapFlow
- Nodemailer
- Mailparser
- Prettier
- ESLint

## 环境要求

- Windows 11 是当前主要开发和验证平台。
- Node.js 和 npm。
- 如需使用 Ollama, 需要本机已安装并运行 Ollama。
- 如需使用远程模型 Provider, 需要对应 Provider 的 API Key 或 OpenAI-compatible 网关配置。

## 安装依赖

```powershell
npm install
```

## 本地开发

```powershell
npm run dev
```

## 构建命令

```powershell
npm run build
```

## 生成 Windows 安装包

```powershell
npm run dist:win
```

安装包会输出到 `release` 目录。当前 Windows 安装包未接入代码签名, 首次安装时可能出现系统安全提示。

## 检查命令

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run qa:built-in-tools
npm run qa:built-in-tools:browser
npm run quality:installer-smoke
npm run quality:metrics
npm run quality:regression
npm run quality:v0.3:status
```

Built-in Tools QA 和 Browser QA 是 v0.3.x 固定检查入口, 回归记录和发布说明都应保留这两个真实脚本名。

发布前可以运行:

```powershell
npm run release:check
```

## CI/CD 工作流

GitHub Actions 工作流位于 `.github\workflows\ci-cd.yml`。

- PR 和任意分支 push 会在 `windows-latest` 上运行 `npm ci`、`npm test`、`npm run typecheck`、`npm run lint` 和 `npm run build`。
- workflow 使用只读 `GITHUB_TOKEN` 权限、PowerShell 7 shell 和 Node.js 24; checkout 不持久化写入凭据。
- 推送 `v*` tag 或手动运行 workflow 时, 会在 CI 通过后执行 `npm run dist:win`, 并上传 `forge-windows-installer` artifact。
- 当前工作流只生成和上传安装包 artifact, 不会自动创建 GitHub Release, 不会自动发布, 也不会跳过发布前人工检查和安装包烟测。

`npm test` 会先编译轻量回归测试, 再运行 Node.js 测试, 用于覆盖 Agent 上下文隔离等关键逻辑。

`npm run quality:metrics` 会读取本机 Forge 的 `agent-quality-metrics.json` 并输出各项指标的 numerator、denominator、value 和可用级状态。没有找到指标文件时会显示 missing, 这表示真实任务指标仍未证明, 不能按达标处理。也可以通过环境变量指定指标文件:

```powershell
$env:FORGE_AGENT_METRICS_FILE = "C:\Users\you\AppData\Roaming\Forge\agent-quality-metrics\agent-quality-metrics.json"
npm run quality:metrics
```

`npm run quality:regression` 会读取 v0.3.x 真实任务回归结果 JSON, 并按 Agent 质量指标口径汇总一次完成率、错误文件修改率、无关代码改动率、修改后验证通过率和失败恢复率。摘要会列出每个有效任务的 `changedFiles`, 方便复盘错误文件和无关改动证据。没有找到结果文件时会显示 missing, 这表示真实任务回归指标仍未证明。默认结果文件可以放在 `docs\V0_3_REGRESSION_RESULTS.json`, 也可以通过环境变量指定:

```powershell
$env:FORGE_REGRESSION_RESULTS_FILE = "docs\V0_3_REGRESSION_RESULTS.json"
npm run quality:regression
```

当需要把真实任务回归作为 v0.3.x 可用级证据门时, 使用严格版本。它要求 `forgeVersion` 匹配当前 `package.json` 版本, 固定任务集 S1-S5、M1-M5、C1-C3 每个任务恰好有一条有效结果, 每条 run 必须记录非空 `changedFiles`; 当 `wrongFileModified` 为 `false` 时, `changedFiles` 必须落在该固定任务允许文件范围内。每条 run 还必须恰好包含一次 `typecheck`、`build`、`lint` validation, 每条 validation 必须是修改后验证结果, 记录实际命令和退出码, 命令必须与 validation 类型匹配且与 `passed` 一致, 且真实任务相关指标达到 usable 阈值; 文件缺失、报告结构错误、版本不匹配、任务覆盖不完整、出现未定义任务 ID、重复 taskId、存在 invalid run、缺少 changedFiles、changedFiles 与错误文件标记矛盾、validation 种类缺失或重复、指标分母为 0 或低于 usable 时都会以非 0 状态退出:

```powershell
npm run quality:regression:gate
```

`npm run quality:v0.3:status` 会快速汇总当前可用性证据状态, 不运行打包。只有缺少正式回归结果或安装烟测报告时会显示 `unproven`; 只要已有证据结构、元数据、任务覆盖、指标或安装包绑定无效, 即使另一份证据仍缺失, 也会显示 `blocked` 并给出对应 blocker, 用于在运行完整门禁前快速确认还缺哪些证据或需要先修复哪些报告。证据文件存在但未通过时, 文本输出会打印 `Regression details` 或 `Installer smoke details`; 使用 `-- --json` 时会在 `regression.details` 或 `installerSmoke.details` 中给出无效元数据、invalid run 数量和原因、invalid changedFiles、缺失任务、阻塞指标、flagged changedFiles、缺失或失败的烟测检查等复盘字段。

Built-in Tools QA 的固定入口是 `npm run qa:built-in-tools` 和 `npm run qa:built-in-tools:browser`; 文档、发布流程和回归记录应使用这两个真实脚本名, 不要写成临时别名或未验证的新 QA 命令。

发布候选版本可以运行完整 v0.3.x 质量门禁。该命令会串联测试、发布检查、Built-in Tools QA、Browser QA 和 Windows 安装包生成, 因为包含打包所以耗时更长。没有显式设置 `FORGE_QA_PROJECT_ROOT` 时, 它会使用 `.tmp-test\quality-gate-sandbox` 作为受控 QA 沙箱:

```powershell
npm run quality:v0.3
```

该门禁只执行本地检查和打包, 不会发布、上传或执行 Git 写操作; 摘要会列出每个子命令的 PASS/FAIL, 并在打包输出包含已知警告时标记 `duplicate-dependencies` 或 `dep0190-shell-args`。

可用级候选版本需要运行更严格的总门禁。该命令会先执行可用性证据预检并一次列出所有 blocker; 只有真实任务回归证据和安装包人工烟测证据都通过后, 才会继续运行真实任务回归门禁、安装包烟测门禁和不重写安装包的完整工程门禁。安装包必须先通过 `npm run quality:v0.3` 或 `npm run dist:win` 生成, 再执行安装烟测并记录当前 SHA-256, 避免总门禁在烟测后重新打包导致证据失效。如果缺少 `docs\V0_3_REGRESSION_RESULTS.json`, 缺少 `docs\V0_3_INSTALLER_SMOKE.json`, 证据报告结构错误、版本不匹配、烟测元数据无效、安装包 SHA-256 不匹配, 或任一门禁未达标, 会以非 0 状态退出:

```powershell
npm run quality:v0.3:usable
```

`npm run qa:built-in-tools` 会先编译测试产物, 再对开发 QA 沙箱运行 Built-in Tools 验证。Forge 不再内置个人开发沙箱路径; 需要临时指定沙箱时, 可以在 PowerShell 中设置:

```powershell
$env:FORGE_QA_PROJECT_ROOT = "E:\CodeHome\YourSandboxProject"
$env:FORGE_QA_MODEL_ID = "mimo-v2.5-pro"
npm run qa:built-in-tools
```

如果需要把 browser 工具纳入 QA, 先启动本地预览服务, 再传入本地 URL:

```powershell
$env:FORGE_QA_BROWSER_PREVIEW_URL = "http://localhost:5173/"
npm run qa:built-in-tools
```

没有配置 `FORGE_QA_BROWSER_PREVIEW_URL` 时, browser 截图和控制台场景会以 skipped 记录, 不会被伪装成成功。

也可以运行 Electron 真实浏览器 QA, 这个命令会临时启动本地 fixture 页面并用隐藏 Electron 窗口执行截图和控制台检查:

```powershell
npm run qa:built-in-tools:browser
```

## 环境变量说明

本地开发不需要项目级 `.env` 文件。API Key 通过应用设置保存, 并由 Electron 主进程侧的安全存储能力处理。

OAuth 相关变量仅供维护者在自定义构建或部署 Forge OAuth broker 时使用, 普通用户不需要配置:

- `FORGE_GOOGLE_OAUTH_CLIENT_ID`: 覆盖内置 Google 桌面 OAuth client ID
- `FORGE_GITHUB_OAUTH_CLIENT_ID`: 启用 GitHub device flow
- `FORGE_LINEAR_OAUTH_CLIENT_ID`: 启用 Linear loopback + PKCE 授权
- `FORGE_OAUTH_BROKER_BASE_URL`: 启用 GitLab、Bitbucket、Confluence Cloud、Slack、Notion、Airtable、HubSpot、Todoist、Asana、ClickUp、monday.com、Calendly、Miro、Zoom、Figma、Dropbox、Microsoft 365、Sentry、Jira Cloud 和 Discord 的 brokered 授权入口

请不要把 API Key、token、cookie、私钥或证书写入 README、提交信息或日志。

PR 描述、Release notes 和回归证据也只能写凭据用途或脱敏摘要, 不能写真实凭据。

示例配置只描述变量用途, 不写入真实凭据、完整 token、cookie、私钥正文或证书内容。

## 项目结构

```text
src/
  main/        Electron 主进程: IPC、密钥、模型请求、Git、命令和文件服务
  preload/     安全暴露给渲染层的 window.forge API
  renderer/    React 桌面界面、状态管理、组件和 i18n
  shared/      主进程与渲染层共享的类型、Provider 适配和请求逻辑
docs/
  AGENT_RUNTIME.md   Agent Runtime 产品化路线
  EXTENSIONS.md      Extensions 扩展系统说明
  PERFORMANCE.md     性能策略和大项目优化路线
  RELEASE.md         Windows 安装包发布流程
  V0_3_REGRESSION_TASKS.md
                    v0.3.x 真实任务回归集
  V0_3_REGRESSION_RESULTS.example.json
                    v0.3.x 真实任务回归结果模板, 不是正式证据
  V0_3_INSTALLER_SMOKE.example.json
                    v0.3.x 安装包烟测报告模板, 不是正式证据
  superpowers/plans/2026-06-05-v0-2-stabilization.md
                    历史 v0.2.x 稳定化指标和实施计划
```

## 使用流程

1. 启动 Forge。
2. 打开设置并选择界面语言、偏好和 Agent Profile。
3. 配置 Provider API Key、Base URL 和模型。
4. 选择本地项目目录。
5. 根据需要配置 Extensions, 例如为 QQ Mail 保存邮箱地址和授权码。
6. 根据需要通过加号菜单、`/` 或 `@` 引入附件、文件、插件或技能上下文。
7. 输入任务并选择模型。
8. 查看 Agent 计划和执行队列。
9. 审查 AI 生成的文件 diff。
10. 审查扩展确认项, 例如发送邮件前的二次确认。
11. 运行必要命令验证结果。
12. 查看 Git 状态, 输入提交信息并创建 commit。
13. 如需要, 显式执行 push。

## 安全边界

- 普通权限模式下, 文件修改必须经过用户确认; Full Access 下, Agent 队列生成的文件修改可自动写入。
- 命令执行受项目目录和权限模式约束; Full Access 下, Agent 队列中的本地命令会自动运行。
- 只读模式不会生成修改、运行命令或执行 Git 操作。
- 敏感文件和敏感附件默认跳过。
- 普通权限模式下, Git commit 和 push 需要用户显式操作; Full Access 下, Agent 队列中的 Git 动作可自动执行。
- 当前版本不会自动安装或执行第三方 GitHub 插件代码。
- 外部服务写操作受扩展权限和确认策略约束, 发送邮件始终需要二次确认。
- Forge 不会自动发布、自动部署或自动删除项目外文件。

## 常见问题

### Forge 会上传我的整个项目吗?

不会自动上传整个项目。Forge 会根据用户发起的任务读取必要文件并构造模型上下文。敏感文件默认被排除。

### Forge 会自动执行下载的插件吗?

不会。当前 GitHub 扩展入口只负责打开仓库, 方便用户手动检查或下载。Forge 不会自动 clone、安装或执行第三方仓库代码。

### Forge 会自动 push 代码吗?

普通权限模式下不会在未确认的情况下自动 push。用户可以在源码管理界面显式 push, 或在提交时选择 push。Full Access 下, Agent 队列中的 push 动作会按完全访问权限自动执行。

### Forge 会自动发送邮件吗?

不会。QQ Mail 的 `sendEmail` 属于高风险扩展动作, 主进程会强制要求二次确认。

### 本地开发需要 `.env` 吗?

不需要。API Key 在应用设置中保存。

### 为什么部分文件没有语法高亮?

Forge 对常见工程语言使用 Shiki 高亮。少见语言仍可作为纯文本预览, 以减少应用构建体积和异步加载 chunk。

## 当前状态

Forge 目前处于 v0.3.x 稳定化阶段。核心工作流已经可运行, 包括本地项目索引、Provider 配置、Agent 计划、文件审查、命令执行、Git 操作、Built-in Tools、插件与技能上下文、Extensions 扩展、Agent Profile、记忆、用量统计和本地化错误提示。

v0.3.x 的主要目标不是继续扩张新功能, 而是把 Forge 稳定到可用级本地 AI Coding Agent。当前工具层 QA、lint、typecheck、build 和 Windows 安装包生成已有自动化验证入口; 真实简单、中等和复杂任务的一次完成率、错误文件修改率、无关改动率和失败恢复率仍需要持续采集足够样本后才能声称达到可用级。

在 `npm run quality:v0.3:usable` 通过前, README 和发布文档都应把 v0.3.x 描述为稳定化阶段, 不能写成已达到可用级。

当前 v0.3.x 真实任务回归集见 `docs/V0_3_REGRESSION_TASKS.md`。历史 v0.2.x 稳定化记录仍保留在 `docs/superpowers/plans/2026-06-05-v0-2-stabilization.md`, 不能作为 v0.3.x 可用级证据复用。

仍在推进的方向包括:

- 更完整的 Runtime 状态机拆分。
- 更细粒度的权限策略。
- 更完整的自动验证和失败恢复闭环。
- 更强的大项目增量扫描、全文索引和大文件预览。
- 更稳定的产品级打包和发布流程。

## License

MIT
