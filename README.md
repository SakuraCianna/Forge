# Forge

[中文](README.md) | [English](README.en.md)

Forge 是一个开源的本地 AI 编程 Agent 桌面应用。它面向真实项目工作流, 不是 VS Code fork, 也不是编辑器插件市场。用户可以选择本地项目, 配置自己的模型和 Provider, 让 Agent 生成计划, 审查文件修改, 运行验证命令, 并在人工确认后完成 Git 操作。

Forge 的目标是把 AI 编程从“聊天里的建议”推进到“可审查, 可恢复, 可验证的本地工程流程”。

## 功能特性

### 本地项目工作台

- 打开本地项目目录并建立项目文件索引。
- 浏览文件树, 预览文本、代码、Markdown、图片、PDF、音频和视频等内容。
- 项目文件树会展示非敏感文件, 即使普通文件被 `.gitignore` 忽略也可在界面中浏览。
- Agent 的目录列表、文本搜索和 glob 工具仍遵循 `.gitignore`, 用于控制自动化搜索范围和大项目性能。
- `.env`、私钥、证书、凭据目录、数据库文件等敏感路径默认不会进入 Agent 文件工具或预览流程。
- 文件页支持按目录懒加载和大目录分页, 避免一次性渲染完整大项目文件树。
- 项目扫描元数据和全文搜索快照会缓存在本地应用数据目录, 用于后续加速。
- AI 生成的文件修改会先进入待审查区, 用户确认后才写入磁盘。

### Agent 任务线程

- 每个任务以独立线程组织, 记录用户请求、模型计划、执行日志、文件事件和命令结果。
- 计划会被解析为读取文件、目录列表、glob、文本搜索、文件编辑、命令执行、Git 检查和人工确认等动作。
- Agent Profile 可以控制系统提示词、上下文预算、计划步数、自动推进上限、验证策略、失败恢复策略、恢复次数和工具权限。
- 确认队列会汇总待审查 diff、命令审批、人工门禁、提交门禁和失败恢复步骤。
- Stop 会暂停队列, 恢复后不会跳过 diff 审查、命令审批或提交门禁。
- 失败恢复会基于真实工具结果和命令输出生成后续计划, 但依赖安装、外部权限、高风险删除和生产发布等场景仍需要人工介入。
- 普通问答、解释、记忆和聊天类请求不会强行进入项目改动流程。

### Built-in Tools 内置工具体系

- 内置工具统一注册到 8 个一级分类: Project、File、Search、Edit、Terminal、Git、Diagnostics 和 Auxiliary。
- 工具元数据包含名称、说明、分类、风险等级、确认要求、输入输出 Schema、可用状态和执行入口。
- 低风险读取工具可以自动执行, 但写文件、删文件、移动文件、应用补丁、安装依赖、提交、切换分支、撤销修改和 push 必须经过确认。
- Full Access 只扩大可用工具范围, 不会绕过高风险或 critical 操作确认。
- critical 工具预留 typed confirmation 能力, 确认视图会展示工具名、风险等级、影响目标、操作后果和是否可撤销。
- 工具调用会记录结构化审计日志和本地质量指标, 用于追踪成功率、失败、确认阻断和写盘前确认。
- `searchSemantic` 当前使用本地轻量语义 fallback, 不调用 embedding 模型, 不读取敏感文件, 返回结果会标注 `local_semantic_fallback`。
- 浏览器截图和页面控制台检查使用受限本地预览 URL, 截图默认写入应用数据目录并返回文件路径、尺寸和大小, 避免把大图直接塞入上下文。

### 输入框、附件和上下文引用

- 输入框支持通过加号菜单、拖拽和粘贴添加附件。
- 支持图片、PDF、DOCX、XLSX、CSV、TSV、Markdown、JSON、代码文件和常见文本文件。
- 图片和扫描 PDF 可在本地 Worker 中进行 OCR, 避免阻塞主界面。
- DOCX、XLSX、CSV 和 TSV 会在本地解析为可控大小的文本摘要。
- 敏感附件会默认跳过, 避免误把密钥或本地数据加入模型上下文。
- 输入 `/` 可以打开 Forge 命令和技能候选, 命令会执行界面操作而不是作为普通对话文本发送。
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
- 扩展凭据保存在 Electron 主进程侧的安全存储中, 页面只展示配置状态和尾号提示。
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
- 支持显式 push 或在提交时选择 push, 但 Forge 不会在未确认的情况下自动推送。
- 从项目菜单创建永久 Git worktree, 并加入最近项目列表。

### 个性化、记忆和用量

- 内置开发、审查和文档 Agent Profile。
- 支持项目隔离的 Agent 记忆。
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
npm run quality:v0.2:status
```

发布前可以运行:

```powershell
npm run release:check
```

`npm test` 会先编译轻量回归测试, 再运行 Node.js 测试, 用于覆盖 Agent 上下文隔离等关键逻辑。

`npm run quality:metrics` 会读取本机 Forge 的 `agent-quality-metrics.json` 并输出各项指标的 numerator、denominator、value 和可用级状态。没有找到指标文件时会显示 missing, 这表示真实任务指标仍未证明, 不能按达标处理。也可以通过环境变量指定指标文件:

```powershell
$env:FORGE_AGENT_METRICS_FILE = "C:\Users\you\AppData\Roaming\Forge\agent-quality-metrics\agent-quality-metrics.json"
npm run quality:metrics
```

`npm run quality:regression` 会读取 v0.2.x 真实任务回归结果 JSON, 并按 Agent 质量指标口径汇总一次完成率、错误文件修改率、无关代码改动率、修改后验证通过率和失败恢复率。没有找到结果文件时会显示 missing, 这表示真实任务回归指标仍未证明。默认结果文件可以放在 `docs\V0_2_REGRESSION_RESULTS.json`, 也可以通过环境变量指定:

```powershell
$env:FORGE_REGRESSION_RESULTS_FILE = "docs\V0_2_REGRESSION_RESULTS.json"
npm run quality:regression
```

当需要把真实任务回归作为 v0.2.x 可用级证据门时, 使用严格版本。它要求 `forgeVersion` 匹配当前 `package.json` 版本, 固定任务集 S1-S5、M1-M5、C1-C3 每个任务恰好有一条有效结果, 每条 run 必须恰好包含一次 `typecheck`、`build`、`lint` validation, 每条 validation 记录实际命令和退出码且与 `passed` 一致, 且真实任务相关指标达到 usable 阈值; 文件缺失、报告结构错误、版本不匹配、任务覆盖不完整、出现未定义任务 ID、重复 taskId、存在 invalid run、validation 种类缺失或重复、指标分母为 0 或低于 usable 时都会以非 0 状态退出:

```powershell
npm run quality:regression:gate
```

`npm run quality:v0.2:status` 会快速汇总当前可用性证据状态, 不运行打包。缺少正式回归结果或安装烟测报告时会显示 `unproven`, 用于在运行完整门禁前快速确认还缺哪些证据。

发布候选版本可以运行完整 v0.2.x 质量门禁。该命令会串联测试、发布检查、Built-in Tools QA、Browser QA 和 Windows 安装包生成, 因为包含打包所以耗时更长。没有显式设置 `FORGE_QA_PROJECT_ROOT` 时, 它会使用 `.tmp-test\quality-gate-sandbox` 作为受控 QA 沙箱:

```powershell
npm run quality:v0.2
```

可用级候选版本需要运行更严格的总门禁。该命令会先跑真实任务回归门禁和安装包人工烟测报告门禁, 证据齐全后再跑完整工程门禁和打包门禁; 如果缺少 `docs\V0_2_REGRESSION_RESULTS.json`, 缺少 `docs\V0_2_INSTALLER_SMOKE.json`, 证据报告结构错误、版本不匹配、烟测元数据无效、安装包 SHA-256 不匹配, 或任一门禁未达标, 会以非 0 状态退出:

```powershell
npm run quality:v0.2:usable
```

`npm run qa:built-in-tools` 会先编译测试产物, 再对开发 QA 沙箱运行 Built-in Tools 验证。默认沙箱配置位于 `src/shared/developmentSandboxConfig.ts`, 仅用于本地开发验证, 不会作为普通用户默认项目路径。需要临时指定沙箱时, 可以在 PowerShell 中设置:

```powershell
$env:FORGE_QA_PROJECT_ROOT = "E:\CodeHome\已完结的项目\测试项目"
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

请不要把 API Key、token、cookie、私钥或证书写入 README、提交信息或日志。

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
  V0_2_REGRESSION_TASKS.md
                    v0.2.x 真实任务回归集
  V0_2_REGRESSION_RESULTS.example.json
                    v0.2.x 真实任务回归结果模板, 不是正式证据
  V0_2_INSTALLER_SMOKE.example.json
                    v0.2.x 安装包烟测报告模板, 不是正式证据
  superpowers/plans/2026-06-05-v0-2-stabilization.md
                    v0.2.x 稳定化指标和实施计划
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

- 文件修改必须经过用户确认。
- 命令执行受项目目录、权限模式和命令规则约束。
- 只读模式不会生成修改、运行命令或执行 Git 操作。
- 敏感文件和敏感附件默认跳过。
- Git commit 和 push 都需要用户显式操作。
- 当前版本不会自动安装或执行第三方 GitHub 插件代码。
- 外部服务写操作受扩展权限和确认策略约束, 发送邮件始终需要二次确认。
- Forge 不会自动发布、自动部署或自动删除项目外文件。

## 常见问题

### Forge 会上传我的整个项目吗?

不会自动上传整个项目。Forge 会根据用户发起的任务读取必要文件并构造模型上下文。敏感文件默认被排除。

### Forge 会自动执行下载的插件吗?

不会。当前 GitHub 扩展入口只负责打开仓库, 方便用户手动检查或下载。Forge 不会自动 clone、安装或执行第三方仓库代码。

### Forge 会自动 push 代码吗?

不会在未确认的情况下自动 push。用户可以在源码管理界面显式 push, 或在提交时选择 push。

### Forge 会自动发送邮件吗?

不会。QQ Mail 的 `sendEmail` 属于高风险扩展动作, 主进程会强制要求二次确认。

### 本地开发需要 `.env` 吗?

不需要。API Key 在应用设置中保存。

### 为什么部分文件没有语法高亮?

Forge 对常见工程语言使用 Shiki 高亮。少见语言仍可作为纯文本预览, 以减少应用构建体积和异步加载 chunk。

## 当前状态

Forge 目前处于 v0.2.x 稳定化阶段。核心工作流已经可运行, 包括本地项目索引、Provider 配置、Agent 计划、文件审查、命令执行、Git 操作、Built-in Tools、插件与技能上下文、Extensions 扩展、Agent Profile、记忆、用量统计和本地化错误提示。

v0.2.x 的主要目标不是继续扩张新功能, 而是把 Forge 稳定到可用级本地 AI Coding Agent。当前工具层 QA、lint、typecheck、build 和 Windows 安装包生成已有自动化验证入口; 真实简单、中等和复杂任务的一次完成率、错误文件修改率、无关改动率和失败恢复率仍需要持续采集足够样本后才能声称达到可用级。

稳定化计划见 `docs/superpowers/plans/2026-06-05-v0-2-stabilization.md`, 真实任务回归集见 `docs/V0_2_REGRESSION_TASKS.md`。

仍在推进的方向包括:

- 更完整的 Runtime 状态机拆分。
- 更细粒度的权限策略。
- 更完整的自动验证和失败恢复闭环。
- 更强的大项目增量扫描、全文索引和大文件预览。
- 更稳定的产品级打包和发布流程。

## License

MIT
