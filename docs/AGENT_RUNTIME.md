# Forge Agent Runtime 产品化路线

本文档记录 Forge Agent Runtime 从 UI 内联逻辑走向产品级运行内核的路线。这里不把规划写成已完成能力。

## 外部产品参考

- Codex: 借鉴审批模式, Full Auto, 隔离运行环境, 可验证终端日志和测试输出证据。
- opencode: 借鉴 `allow / ask / deny` 权限抽象, Build / Plan Agent, 子 Agent 和多会话协作。
- Claude Code: 借鉴 plan mode, accept edits, hooks, subagents, 项目级 settings 和权限模式。

参考资料:

- https://help.openai.com/en/articles/11096431
- https://openai.com/index/introducing-codex/
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/permissions/
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/configuration

## 当前已落地

- 模型计划会先经过 `agentPlanQuality.ts` 做轻量预检, 空项目脚手架任务会把不存在文件的读取步骤改成创建步骤。
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
- `App.tsx` 仍负责真实副作用: 文件读取, 文件修改生成, 命令执行, Git 操作, 线程事件和 UI 状态。
- 完成总结会汇总创建, 编辑, 删除, 读取, 失败恢复和耗时统计, 主界面只保留简短结果。

## 下一阶段

### 1. Runtime 状态机

目标是把 `runAgentAction` 剩余副作用包装继续拆成可组合状态机:

- `resolve`: 选择下一动作, 判断是否可运行。
- `gate`: 处理权限, 文件审查, 命令审批, commit 门禁。
- `execute`: 调度受控工具和真实副作用, 当前已完成第一层 handler 分派。
- `recover`: 自动生成失败恢复计划或暂停等待必要人工输入, 当前已收拢自动恢复步骤选择。
- `summarize`: 在队列结束时生成稳定结果摘要。

### 2. 权限策略升级

目标是从布尔式完全访问逐步升级到 opencode 风格的资源策略:

- `read`, `edit`, `command`, `git`, `web`, `external_directory` 分层。
- 每层支持 `allow`, `ask`, `deny`。
- 命令策略支持更明确的模式匹配和来源标记。
- 完全访问权限仍保留安全边界: 依赖安装, 删除, 外部目录, 生产发布等操作必须可解释地停顿或拒绝。

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
