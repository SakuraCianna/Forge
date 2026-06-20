# Forge Agent Runtime 产品化路线

本文档记录 Forge Agent Runtime 从 UI 内联逻辑走向产品级运行内核的路线。这里不把规划写成已完成能力。

## 长期产品化 Goal

Forge 要从可用原型推进到产品级本地工程工作台: 用户提出真实项目任务后, Agent 能先理解工程结构, 生成可执行计划, 在权限策略内自动读取, 编辑, 运行命令和自修复, 最后输出可审查的变更摘要和验证证据。Full Access 下, 本地命令、依赖安装、文件写入和 Git 队列动作不再停在二次批准; 缺少密钥, 外部权限, 生产发布等仍按对应平台或扩展策略处理。

这个 Goal 分三条主线推进:

- Runtime 内核: 把计划预检, 权限/风险判断, 队列推进, 工具执行, 失败恢复和完成总结从 `App.tsx` 迁入可测试模块。
- 工程体验: 把主界面输出, 确认队列, 已处理摘要, 命令历史, Git 证据和附件上下文做成稳定清晰的审计流。
- 大项目性能: 持续推进懒加载文件树, 持久化索引, 增量刷新, 本地全文索引, 可选语义检索和大文件分块预览。

## 外部产品参考

- Codex: 借鉴审批模式, Full Auto, 隔离运行环境, 可验证终端日志和测试输出证据。
- opencode: 借鉴 `allow / ask / deny` 权限抽象, Build / Plan Agent, 子 Agent 和多会话协作。
- Claude Code: 借鉴 plan mode, accept edits, hooks, subagents, 项目级 settings 和权限模式。

参考资料:

- https://developers.openai.com/codex/
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/permissions/
- https://docs.anthropic.com/en/docs/claude-code/overview
- https://docs.anthropic.com/en/docs/claude-code/sub-agents
- https://docs.anthropic.com/en/docs/claude-code/hooks

## 2026-06-03 代码扫描结论

本轮扫描覆盖 `package.json`, README, `docs/PERFORMANCE.md`, `docs/AGENT_RUNTIME.md`, `src/main`, `src/shared`, `src/renderer/src/agent`, `src/renderer/src/state` 和主要 React 组件。当前最高收益不是继续堆 UI 小功能, 而是先把 Agent 运行闭环稳定下来。

当前最大文件:

- `src/renderer/src/App.tsx`: 4385 行, 仍混合项目选择, 线程状态, Agent 执行, 文件树, Git, 命令和设置入口。
- `src/renderer/src/components/ThreadWorkspace.tsx`: 4280 行, 仍混合主输出, 已处理摘要, 确认队列, 命令历史, Agent 详情和日志视图。
- `src/renderer/src/components/SettingsPanel.tsx`: 3073 行, 仍混合常规设置, Provider, Agent Profile, 隐私, 记忆和归档对话。
- `src/main/agentPlanService.ts`: 1624 行, 负责模型计划提示, 计划解析和文件编辑内容生成, 后续需要拆出 prompt preset, plan parser 和 edit generator。

近期优先级:

1. 继续拆 `App.tsx` 的 Agent 队列状态机, 先把 `runAgentAction` 和 `runAgentActions` 周边的运行状态, reservation, cancellation, post action 调度收进 Runtime/生命周期模块。
2. 拆 `ThreadWorkspace.tsx` 的 Agent 运行视图, 优先分离确认队列, 命令历史, 已处理摘要和 Agent action details, 修复主界面文字/按钮对齐与输出稳定性。
3. 拆 `agentPlanService.ts` 的提示词和计划解析, 固化工程意识预设: 空项目要先脚手架, 全栈任务要覆盖前端, 后端, 配置, 启动和验证。
4. 在 Runtime 决策层补单元测试, 先覆盖完全访问权限, allow/ask/deny 命令策略, 缺失文件创建兜底, 自动恢复暂停原因和完成总结触发。
5. 性能线继续接 `docs/PERFORMANCE.md`: 增量扫描 v2, 本地全文索引 v3, 可选向量检索, 大文件分块和文件树虚拟滚动。

## 当前已落地

- 模型计划会先经过工程化 planner 提示和计划解析质量预检: 空项目脚手架任务会收到项目骨架检查清单, build 智能体默认计划预算为 12 步, 不存在脚手架文件的读取步骤会改成创建步骤。
- 计划提示和解析层已经固化基础软件工程闭环: 先理解项目, 再设计最小完整变更, 再做受控修改, 再运行验证并留下交付证据。对于包含项目变更但缺少发现步骤的模型计划, 解析层会在步数允许时补一个项目结构检查步骤, 降低上来就改文件的风险。
- 必需验证策略会根据变更目标推断验证命令: Maven 后端优先补 `mvn test` 或对应模块命令; 空项目 Spring Boot 脚手架首轮优先用 `mvn -f backend/pom.xml -DskipTests package` 验证编译和打包, 避免生成期测试样板先阻断工程落地。Vite/TypeScript 前端优先补对应包管理器 build 命令, Rust 优先补 `cargo test`, Go 模块优先补 `go test ./...`; 嵌套 Go 模块默认使用当前官方 `go -C <dir> test ./...`, 如果本机 Go 工具链过旧不支持 `-C`, Runtime 会降级到该模块目录下运行 `go test ./...`; 文档类改动退回到 `git status --short`。
- 直接写入类内置工具会补充写入前证据: 当模型计划直接调用 `applyEdit` 且提供 `relativePath` 和 `nextContent` 时, 解析层会在写入前自动插入同文件 `previewDiff`, 已有同文件 `previewDiff` 或 `proposeEdit` 时不会重复插入。
- 空项目脚手架还会做结构化覆盖检查: 对 Spring Boot, Vue, Vite 等常见新项目任务, 预检会识别依赖/构建配置, 后端入口, 领域模型, API, 运行配置, 前端配置, 前端入口, 页面组件和验证动作是否缺失, 并把缺失层补成受控 `edit-file` 或 `run-command` 动作。
- `agentActionExecutor.ts` 负责基础动作解析, 工具权限, 命令风险和自动执行队列判断。
- `agentRuntimeOrchestrator.ts` 已作为第一层运行内核入口, 把单步执行前的纯决策从 `App.tsx` 抽离出来:
  - 已完成或跳过的动作复用当前状态, 避免重复执行。
  - Agent Profile 工具权限在执行前形成硬边界。
  - 人工门禁和 commit 门禁在完全访问权限下可以被运行时接管。
  - `resolveAgentRuntimeManualGateStep` 已把人工审查, 自动完成和自动 commit 的策略分支收拢到 Runtime。
  - 命令门禁统一返回 `run`, `approval-required` 或 `deny`。
  - 权限拒绝和人工审查等待事件由 `agentActionLifecycle.ts` 统一生成, `App.tsx` 只更新状态和提示。
  - 执行分派已经通过 `runAgentRuntimeExecution` 收拢到 Runtime, `App.tsx` 只注入文件, 命令, Git 和线程事件等副作用 handler。
  - 自动失败恢复通过 `resolveAgentRuntimeAutoFailureRecoveryStep` 先决策恢复候选, 暂停通知或空闲状态, `App.tsx` 只负责写事件和触发修复计划。
  - 失败恢复计划的发起前校验, 起始事件, 恢复尝试记录和恢复提示词已经迁入 `agentFailureRecoveryPlan.ts`。
  - 完成总结触发通过 `resolveAgentRuntimePostActionStep` 决定, `agentActionLifecycle.ts` 负责实际追加总结事件。
- `agentRuntimeQueue.ts` 已承接动作预约, 取消检查和批量队列推进, `App.tsx` 只注入已预约动作的真实执行逻辑。
- `agentPlanLifecycle.ts` 已承接计划生成完成后的就绪事件, 质量预检提示, 空计划总结和线程状态选择, `App.tsx` 不再内联拼装 planner 完成文案。
- `AgentConfirmationQueue.tsx` 已承接完整确认队列和紧凑等待条 UI, `ThreadWorkspace.tsx` 只负责提供当前线程, 标签页切换和动作回调。
- `App.tsx` 仍负责真实副作用: 文件读取, 文件修改生成, 命令执行, Git 操作, 线程事件和 UI 状态。
- 完成总结会汇总创建, 编辑, 删除, 读取, 失败恢复和耗时统计, 主界面只保留简短结果。
- Built-in Tools 当前全部有真实 executor 或受控降级结果, 不再保留 `not_implemented` 工具。优先级语义如下:
  - P0 是 Agent 写代码闭环的基础能力, 包括项目树、文件读取、文本/glob 搜索、diff 预览、编辑写入、命令运行、Git 状态/diff 和基础诊断。P0 必须被普通开发 QA 覆盖并保持错误率为 0。
  - P1 是高频稳定性能力, 包括项目摘要、入口/符号/引用/相关文件、创建文件、补丁、格式化/恢复、包脚本、typecheck/lint/build、错误解析、项目记忆/指令、上下文预算, 以及 `webSearch` / `fetchDocs` 官方文档查询。`fetchDocs` 目前是维护在代码里的官方文档映射表, 已覆盖常见框架、语言和平台, 但还不是动态文档索引或可信源评分系统。
  - P2 是进阶或高风险能力, 包括语义搜索、诊断搜索、测试运行、依赖安装、分支/worktree/revert/push、浏览器预览/截图/控制台、直接 URL 抓取和项目指令变更等。它们已有执行路径和安全门禁, 但仍需要更多真实项目回归、外部副作用沙箱和产品 UI 打磨。

当前仍未完全产品化的重点:

- `searchSemantic` 仍是本地轻量 fallback, 不调用 embedding 模型, 不能等同于真正向量检索。
- `webSearch` / `fetchDocs` 已升为 P1, 但官方文档覆盖依赖维护映射表; 后续还需要文档源版本标记、失败 fallback、缓存和引用展示。
- Browser 类工具需要本地预览 URL 和 Electron browser provider; 普通 Built-in Tools QA 中没有预览 URL 时会跳过, Browser QA 才覆盖截图和控制台场景。
- 依赖安装、分支切换、worktree、revert、push、删除记忆和更新项目指令等高风险 P2 工具只在开发 QA 中验证确认/阻断链路, 不做真实远程或破坏性副作用。
- 自动验证闭环目前能推断常见命令, 但测试选择、失败分类和 after-edit hook 仍需要继续产品化, 避免空项目或新脚手架被不成熟测试样板阻断。

## 下一阶段

### 1. Runtime 状态机

目标是把 `runAgentAction` 剩余副作用包装继续拆成可组合状态机:

- `resolve`: 选择下一动作, 判断是否可运行。
- `gate`: 处理权限, 文件审查, 命令审批, commit 门禁。
- `execute`: 调度受控工具和真实副作用, 当前已完成第一层 handler 分派和队列预约包装。
- `recover`: 自动生成失败恢复计划或暂停等待必要人工输入, 当前已收拢自动恢复步骤选择, 发起前校验和恢复计划准备。
- `summarize`: 在队列结束时生成稳定结果摘要, 当前已收拢动作后的完成总结触发决策。

### 2. 权限策略升级

目标是从布尔式完全访问逐步升级到 opencode 风格的资源策略:

- `read`, `edit`, `command`, `git`, `web`, `external_directory` 分层。
- 每层支持 `allow`, `ask`, `deny`。
- 命令策略支持更明确的模式匹配和来源标记。
- 完全访问权限的产品语义是自动接管本地 Agent 队列动作: 依赖安装, 删除, 命令, 内置工具和 Git 动作不再额外要求批准; 外部目录, 扩展权限和生产发布仍必须可解释地停顿或拒绝。

### 3. Hooks 与验证闭环

目标是参考 Claude Code hooks:

- `beforeAction`: 执行动作前做目标路径和策略校验。
- `afterEdit`: 生成文件修改后自动触发格式化或相关检查建议。
- `afterCommand`: 根据命令结果自动判断是否进入恢复。
- `beforeSummary`: 汇总验证证据, 避免主界面输出泛化成功。

### 4. 子 Agent 与多会话

目标是先做产品可控的子 Agent, 不急于做并行泛滥:

- Plan Agent: 只读分析和计划。
- Build Agent: 编辑, 命令和验证。
- Review Agent: 只读审查 diff 和风险。
- Docs Agent: 文档和说明。

子 Agent 需要继承当前线程的项目路径, 权限策略, 模型配置和上下文预算, 并把执行证据回写到父线程。

### 5. 大文件拆分优先级

当前最大拆分目标:

- `src/renderer/src/App.tsx`: 继续迁出 Agent Runtime, 项目文件树控制, Git 源码管理控制。
- `src/renderer/src/components/ThreadWorkspace.tsx`: 拆出确认队列, 已处理摘要, 命令历史, Agent 详情视图。
- `src/renderer/src/components/SettingsPanel.tsx`: 拆出常规设置, 模型设置, Provider 设置, Agent Profile 设置, 用量设置和隐私设置。

## 验证要求

每个独立阶段至少运行:

```powershell
npm run typecheck
npm run lint
npm run build
```

如果只做文档更新, 可以说明未运行代码检查的原因。涉及 Runtime, UI 或 IPC 的修改必须运行完整检查。
