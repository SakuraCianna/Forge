# Forge

Forge 是一个开源的本地 AI 编程 Agent 桌面应用。它不是 VS Code fork，也不是编辑器插件市场，而是一个面向真实项目的 Agent 工作台：选择本地项目，配置自己的模型，生成计划，审查文件改动，运行验证命令，并在确认后提交代码。

Forge 的核心目标是把 AI 编程从“聊天窗口里的建议”推进到“可审查、可恢复、可验证的本地工程流程”。

## 产品定位

Forge 适合这些场景：

- 你想让 AI 读取本地项目结构，而不是只粘贴零散代码片段。
- 你希望模型改文件之前先形成计划，改完之后能看到 diff。
- 你需要同时管理 OpenAI、Anthropic、Gemini、OpenRouter、Ollama 和多个 OpenAI-compatible 中转配置。
- 你希望 API Key、项目路径、对话、偏好和用量统计都尽量留在本机。
- 你想把 Agent 的权限、命令执行和 Git 提交放进清晰的人工确认流程里。

## 核心能力

### 本地项目工作台

- 选择本地项目目录并建立文本文件索引。
- 浏览项目文件，预览内容和 diff。
- 项目文件索引、目录列表和 glob 匹配会遵循 `.gitignore`，默认展示所有未忽略文件，不再按固定数量截断。
- 通过受控目录列表工具查看项目目录结构，不需要把目录当成文本文件读取。
- 通过受控 glob 和文本搜索工具定位文件与文本命中，不需要让 Agent 拼接 shell 搜索命令。
- 通过受控 Git 状态工具读取变更文件和 diff 摘要，不需要让 Agent 拼接 shell Git 检查命令。
- 针对单个或多个选中文件生成 AI 修改建议。
- 所有文件修改先进入待审查区，用户确认后才写入磁盘。

### Agent 任务线程

- 每个需求会进入独立任务线程，保留用户输入、模型计划、执行日志、文件事件和命令结果。
- 主对话区默认只展示用户请求、最终回答和真正需要处理的低打扰图标入口，Agent 动作流水、目录列表、文件读取、命令细节和队列状态默认折叠进“已处理”，避免把内部执行记录铺满屏幕。
- 模型生成的计划会被解析成 Agent 动作队列，包括读取文件、生成修改、运行命令、提交检查和人工审查门禁。
- 计划提示支持 read、list_directory、glob、grep、git_status、bash 和 edit 等受控工具名，让模型优先产出可执行工具步骤。
- 后续文件编辑会带上前置文件读取、目录、glob、文本搜索和 Git 检查结果，让多步骤 Agent 不丢失刚收集到的上下文。
- 动作详情会显示受控工具的最近结果，方便回看每一步读取、搜索、目录、glob 和 Git 检查输出。
- 动作详情可以复制当前动作上下文，包含状态、目标、下一步、命令结果和工具结果，方便继续排查。
- 每个 Agent 动作会记录开始、完成、失败、等待、确认或跳过事件，动作详情会显示最近执行记录和耗时。
- 当动作队列完成或没有下一步可执行时，可以基于当前线程状态生成后续计划，复用已完成动作和工具结果继续推进。
- 失败恢复计划会带上最近受控工具结果和命令错误输出，让模型基于真实执行上下文生成修复步骤。
- 失败的动作可以重试，也可以基于失败上下文生成修复计划。
- 动作详情里也提供人工确认、命令批准、提交入口、失败重试和跳过操作，减少用户寻找下一步确认入口的成本。
- Agent 运行视图会把待审查修改、命令批准、人工确认、提交门禁和失败恢复汇总成确认队列，并区分当前等待项和后续停止点。
- 命令批准支持仅本次执行或保存为精确 allow 规则，后续同一命令可以按规则自动通过内置审批门禁。
- 确认队列会展示命令、目录、风险原因和批准后的后续动作，并支持复制审批摘要，方便审计和继续排查。
- 用户可以显式跳过被阻止或已不需要的动作，Forge 会记录跳过事件并继续推进后续安全步骤。
- Stop 会暂停 Agent 队列，恢复后只继续后续安全动作，不会越过审查或命令门禁。
- Commit 门禁会把 Agent 计划里的提交建议带到源代码管理页，提交成功后回写任务线程。
- 支持普通问答和项目任务两种路由：解释、记忆、聊天类问题不会强行进入项目改动流程。

### 模型与 Provider 管理

内置 Provider 包括：

- OpenAI
- Anthropic
- Gemini
- OpenRouter
- DeepSeek
- 月之暗面 / Kimi
- 通义千问 / DashScope
- 智谱 AI / Z.AI
- MiniMax
- 硅基流动
- 火山方舟
- 百度千帆
- 腾讯混元 / TokenHub
- Groq
- Together AI
- Mistral AI
- xAI
- Fireworks AI
- Cerebras
- 阶跃星辰
- 魔搭 ModelScope
- 小米 MiMo
- GitHub Models / Copilot
- Ollama

也可以添加任意自定义 OpenAI-compatible API 配置。每个配置可以单独保存 Base URL、API Key、模型列表和价格信息。

### 模型选择体验

- 自动拉取远端模型列表。
- 支持手动添加模型 ID，适合中转站、私有网关或模型列表不可用的服务。
- 支持按 Provider、模型 ID 和模型名称搜索。
- 支持智能档位和速度档位。
- 根据模型能力显示 reasoning、speed mode、pricing 等元信息。

### 命令、Git 与验证

- 在当前项目目录内运行受控 PowerShell 命令。
- 命令输出实时写入线程日志。
- 支持取消运行中的命令。
- 支持命令安全规则：允许、询问、拒绝。
- 支持只读、自动审查和完全访问三档权限模式。
- 查看 Git 改动和 diff。
- 用户显式输入提交信息后创建 Git commit。
- 从项目菜单创建永久 Git worktree，并自动加入最近项目列表。
- Forge 不会自动 push。

### 个性化、记忆和 Agent Profile

- 内置编码 Agent、审查 Agent、文档 Agent 三类 Profile。
- 可配置 Agent 的系统提示词、上下文预算、工具权限和执行模式。
- 支持项目隔离的 Agent 记忆召回。
- 支持回复风格、自定义指令、背景图和界面语言设置。

### 用量与成本

- 本地记录模型请求的 token 用量。
- 可按 Provider 或模型维护输入/输出单价。
- 成本估算只根据本地记录和用户填写的价格计算。

### 国际化与错误提示

- 默认中文界面，支持 English。
- 常见模型、网络、API Key、Base URL、JSON/HTML 响应、文件路径、命令和 Git 错误会整理成单行中文提示，避免原始 HTML 或英文堆栈挤压 UI。

## 快速开始

需要 Node.js 和 npm。首次运行：

```powershell
npm install
npm run dev
```

常用检查：

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

## 使用流程

1. 打开设置，选择界面语言和偏好。
2. 在 API 配置中保存 Provider API Key。
3. 如使用中转站或私有网关，修改对应 Base URL，或添加自定义 API 配置。
4. 拉取模型列表，或手动添加模型 ID。
5. 启用希望出现在选择器里的模型。
6. 选择本地项目目录。
7. 输入任务，选择模型、智能档位和速度档位。
8. 查看 Agent 计划和动作队列。
9. 审查 AI 生成的文件 diff，确认后应用。
10. 运行必要命令验证结果。
11. 查看 Git 改动，输入提交信息并创建 commit。

## 安全边界

Forge 当前遵循这些边界：

- API Key 通过 Electron 安全存储能力保存在本机。
- 文件修改必须经过 diff 审查后才写入项目。
- 只读模式会把 Agent 工具收窄到读取能力，不生成修改、不运行命令、不执行 Git 操作。
- `.env`、私钥、凭据和密钥目录默认不会进入项目索引，也不能通过文件工具读取、预览或写入。
- 命令工作目录限制在用户选择的项目内。
- 高风险命令可以通过规则要求人工确认或直接拒绝。
- Git commit 需要用户显式触发。
- 不自动 push，不自动发布，不自动删除项目外文件。
- Ollama 等本地 Provider 可以不配置 API Key。

## 技术架构

Forge 使用 Electron + React + TypeScript 构建。

```text
src/
  main/        Electron 主进程：IPC、密钥、模型请求、Git、命令、文件服务
  preload/     安全暴露给渲染层的 window.forge API
  renderer/    React 桌面界面、状态管理、组件和 i18n
  shared/      主进程与渲染层共享的类型、Provider 适配和模型请求逻辑
```

主要技术栈：

- Electron / electron-vite
- React
- TypeScript
- Tailwind CSS
- Radix UI
- Vitest
- Testing Library
- Prettier

## 开发脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Electron 开发环境 |
| `npm run build` | 类型检查并构建应用 |
| `npm run typecheck` | 运行主进程和渲染层 TypeScript 检查 |
| `npm test` | 运行 Vitest；当前无测试文件时直接通过 |
| `npm run test:watch` | 以 watch 模式运行 Vitest；当前无测试文件时直接通过 |
| `npm run lint` | 运行 ESLint |

## 当前状态

Forge 目前处于 0.1.x 阶段，核心工作流已经可运行：

- 本地项目选择和索引
- 多 Provider 模型配置
- Agent 计划生成
- 文件修改预览和应用
- 命令执行和取消
- Git 状态、提交与永久 worktree 创建
- Agent Profile、记忆、用量统计和本地化错误提示

仍在继续推进的方向：

- 更完整的多文件自动执行闭环
- 更细粒度的变更接受/拒绝
- 更完整的 Provider 能力探测
- 更强的终端体验
- 更稳定的产品级打包和发布流程

## License

MIT
