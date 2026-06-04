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
npm run typecheck
npm run lint
npm run build
```

发布前可以运行:

```powershell
npm run release:check
```

当前项目没有独立的 `npm test` 脚本。

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
  PERFORMANCE.md     性能策略和大项目优化路线
  RELEASE.md         Windows 安装包发布流程
```

## 使用流程

1. 启动 Forge。
2. 打开设置并选择界面语言、偏好和 Agent Profile。
3. 配置 Provider API Key、Base URL 和模型。
4. 选择本地项目目录。
5. 根据需要通过加号菜单、`/` 或 `@` 引入附件、文件、插件或技能上下文。
6. 输入任务并选择模型。
7. 查看 Agent 计划和执行队列。
8. 审查 AI 生成的文件 diff。
9. 运行必要命令验证结果。
10. 查看 Git 状态, 输入提交信息并创建 commit。
11. 如需要, 显式执行 push。

## 安全边界

- 文件修改必须经过用户确认。
- 命令执行受项目目录、权限模式和命令规则约束。
- 只读模式不会生成修改、运行命令或执行 Git 操作。
- 敏感文件和敏感附件默认跳过。
- Git commit 和 push 都需要用户显式操作。
- 当前版本不会自动安装或执行第三方 GitHub 插件代码。
- Forge 不会自动发布、自动部署或自动删除项目外文件。

## 常见问题

### Forge 会上传我的整个项目吗?

不会自动上传整个项目。Forge 会根据用户发起的任务读取必要文件并构造模型上下文。敏感文件默认被排除。

### Forge 会自动执行下载的插件吗?

不会。当前 GitHub 扩展入口只负责打开仓库, 方便用户手动检查或下载。Forge 不会自动 clone、安装或执行第三方仓库代码。

### Forge 会自动 push 代码吗?

不会在未确认的情况下自动 push。用户可以在源码管理界面显式 push, 或在提交时选择 push。

### 本地开发需要 `.env` 吗?

不需要。API Key 在应用设置中保存。

### 为什么部分文件没有语法高亮?

Forge 对常见工程语言使用 Shiki 高亮。少见语言仍可作为纯文本预览, 以减少应用构建体积和异步加载 chunk。

## 当前状态

Forge 目前处于 0.1.x 阶段。核心工作流已经可运行, 包括本地项目索引、Provider 配置、Agent 计划、文件审查、命令执行、Git 操作、插件与技能上下文、Agent Profile、记忆、用量统计和本地化错误提示。

仍在推进的方向包括:

- 更完整的 Runtime 状态机拆分。
- 更细粒度的权限策略。
- 更完整的自动验证和失败恢复闭环。
- 更强的大项目增量扫描、全文索引和大文件预览。
- 更稳定的产品级打包和发布流程。

## License

MIT
