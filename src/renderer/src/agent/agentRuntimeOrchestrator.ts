// 本文件说明: 把 Agent 单步运行前的纯决策从 App.tsx 抽离成可演进的 Runtime 状态机入口
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import {
  resolveAgentActionExecution,
  resolveAgentActionPermission,
  resolveAgentCommandRisk,
  type AgentActionExecution,
  type AgentActionPermissionResult,
  type AgentActionRunOutcome,
  type AgentCommandRisk,
  type AgentCommandSafetyPolicy
} from "./agentActionExecutor.js";
import {
  selectAutoFailureRecoveryCandidate,
  selectAutoFailureRecoverySkipNotice,
  type AutoFailureRecoveryCandidate,
  type AutoFailureRecoverySkipNotice,
  type SelectAutoFailureRecoveryCandidateInput
} from "./autoFailureRecovery.js";

type DeniedPermission = Extract<AgentActionPermissionResult, { ok: false }>;
type ManualGateExecution = Extract<AgentActionExecution, { kind: "manual-gate" }>;
type ExecutableAgentActionExecution = Exclude<AgentActionExecution, ManualGateExecution>;
type DeniedCommandRisk = { level: "deny"; reason: string };
type ApprovalCommandRisk = { level: "ask"; reason: string };

export type AgentRuntimeExecutionHandlers = {
  openFile: (relativePath: string) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  listDirectory: (relativePath: string) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  globProject: (pattern: string) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  searchProject: (query: string) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  webSearch: (query: string) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  inspectGitStatus: () => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  generateFileChange: (relativePath: string) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  runCommand: (command: string) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  executeBuiltInTool: (
    toolName: string,
    input: Record<string, unknown>
  ) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  invokeExtension: (
    extensionId: string,
    actionId: string,
    input: Record<string, unknown>
  ) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>;
  blockCommandDenied: (reason: string) => AgentActionRunOutcome;
  blockCommandApprovalRequired: (command: string, reason: string) => AgentActionRunOutcome;
  blockInvalidTarget: (reason: string) => AgentActionRunOutcome;
  completeAction: () => AgentActionRunOutcome;
};

export type AgentRuntimePreflightDecision =
  | {
      kind: "reuse-status";
      action: AgentAction;
      outcome: AgentActionRunOutcome;
    }
  | {
      kind: "permission-denied";
      action: AgentAction;
      permission: DeniedPermission;
    }
  | {
      kind: "manual-gate";
      action: AgentAction;
      execution: ManualGateExecution;
    }
  | {
      kind: "execute";
      action: AgentAction;
      execution: ExecutableAgentActionExecution;
    };

export type AgentRuntimeCommandDecision =
  | {
      kind: "run";
      risk: AgentCommandRisk;
    }
  | {
      kind: "deny";
      risk: DeniedCommandRisk;
    }
  | {
      kind: "approval-required";
      risk: ApprovalCommandRisk;
    };

export type AgentRuntimeAutoFailureRecoveryStep =
  | {
      kind: "start-recovery";
      candidate: AutoFailureRecoveryCandidate;
    }
  | {
      kind: "write-skip-notice";
      skipNotice: AutoFailureRecoverySkipNotice;
    }
  | {
      kind: "idle";
    };

export type AgentRuntimeManualGateStep =
  | {
      kind: "auto-commit";
    }
  | {
      kind: "auto-complete";
    }
  | {
      kind: "wait-for-review";
    };

export type AgentRuntimePostActionStep =
  | {
      kind: "append-completion-summary";
    }
  | {
      kind: "idle";
    };

// Full Access 语义统一为自动接管本地 Agent 队列门禁, 普通模式仍等待用户审查。
export function resolveAgentRuntimeManualGateStep({
  execution,
  fullAccess
}: {
  execution: ManualGateExecution;
  fullAccess: boolean;
}): AgentRuntimeManualGateStep {
  if (fullAccess) {
    return {
      kind: execution.reason === "commit" ? "auto-commit" : "auto-complete"
    };
  }

  return {
    kind: "wait-for-review"
  };
}

// 动作结束后的收尾也先过 Runtime 决策, 避免 UI 主文件直接判断何时追加完成总结。
export function resolveAgentRuntimePostActionStep({
  outcome
}: {
  outcome: AgentActionRunOutcome;
}): AgentRuntimePostActionStep {
  const status = typeof outcome === "string" ? outcome : outcome.status;

  if (status === "completed") {
    return {
      kind: "append-completion-summary"
    };
  }

  return {
    kind: "idle"
  };
}

// 自动恢复决策统一进入 Runtime: 先选择可恢复失败, 再只记录不可自动处理的暂停原因。
export function resolveAgentRuntimeAutoFailureRecoveryStep(
  input: SelectAutoFailureRecoveryCandidateInput
): AgentRuntimeAutoFailureRecoveryStep {
  const candidate = selectAutoFailureRecoveryCandidate(input);

  if (candidate) {
    return {
      kind: "start-recovery",
      candidate
    };
  }

  const skipNotice = selectAutoFailureRecoverySkipNotice(input);

  if (skipNotice) {
    return {
      kind: "write-skip-notice",
      skipNotice
    };
  }

  return {
    kind: "idle"
  };
}

// 执行分派只选择哪个副作用 handler 被调用, handler 本身仍由 App 注入, 方便后续单测 Runtime。
export async function runAgentRuntimeExecution({
  execution,
  commandPolicy,
  approvedCommand = false,
  handlers
}: {
  execution: ExecutableAgentActionExecution;
  commandPolicy: AgentCommandSafetyPolicy;
  approvedCommand?: boolean;
  handlers: AgentRuntimeExecutionHandlers;
}): Promise<AgentActionRunOutcome> {
  if (execution.kind === "open-file") {
    return handlers.openFile(execution.relativePath);
  }

  if (execution.kind === "list-directory") {
    return handlers.listDirectory(execution.relativePath);
  }

  if (execution.kind === "glob-project") {
    return handlers.globProject(execution.pattern);
  }

  if (execution.kind === "search-project") {
    return handlers.searchProject(execution.query);
  }

  if (execution.kind === "web-search") {
    return handlers.webSearch(execution.query);
  }

  if (execution.kind === "git-status") {
    return handlers.inspectGitStatus();
  }

  if (execution.kind === "generate-file-change") {
    return handlers.generateFileChange(execution.relativePath);
  }

  if (execution.kind === "run-command") {
    const commandDecision = resolveAgentRuntimeCommandDecision({
      command: execution.command,
      policy: commandPolicy,
      approvedCommand
    });

    if (commandDecision.kind === "deny") {
      return handlers.blockCommandDenied(commandDecision.risk.reason);
    }

    if (commandDecision.kind === "approval-required") {
      return handlers.blockCommandApprovalRequired(
        execution.command,
        commandDecision.risk.reason
      );
    }

    return handlers.runCommand(execution.command);
  }

  if (execution.kind === "invoke-extension") {
    return handlers.invokeExtension(execution.extensionId, execution.actionId, execution.input);
  }

  if (execution.kind === "built-in-tool") {
    return handlers.executeBuiltInTool(execution.toolName, execution.input);
  }

  if (execution.kind === "invalid-target") {
    return handlers.blockInvalidTarget(execution.reason);
  }

  return handlers.completeAction();
}

// 预检只判断当前动作是否应该进入执行分支, 不写线程状态, 不触发命令或文件 IO。
export function resolveAgentRuntimePreflightDecision({
  action,
  liveAction,
  agentProfile,
  fullAccess = false
}: {
  action: AgentAction;
  liveAction?: AgentAction | null;
  agentProfile?: AgentProfileContext;
  fullAccess?: boolean;
}): AgentRuntimePreflightDecision {
  const reusableLiveOutcome = liveAction ? getReusableActionOutcome(liveAction) : null;

  if (reusableLiveOutcome) {
    return {
      kind: "reuse-status",
      action: liveAction!,
      outcome: reusableLiveOutcome
    };
  }

  const actionToRun = liveAction ?? action;
  const reusableOutcome = getReusableActionOutcome(actionToRun);

  if (reusableOutcome) {
    return {
      kind: "reuse-status",
      action: actionToRun,
      outcome: reusableOutcome
    };
  }

  const permission = resolveAgentActionPermission(actionToRun, agentProfile);

  if (!permission.ok) {
    return {
      kind: "permission-denied",
      action: actionToRun,
      permission
    };
  }

  const execution = resolveAgentActionExecution(actionToRun, { fullAccess });

  if (execution.kind === "manual-gate") {
    return {
      kind: "manual-gate",
      action: actionToRun,
      execution
    };
  }

  return {
    kind: "execute",
    action: actionToRun,
    execution
  };
}

// 命令门禁单独成层, 后续可在这里接入 opencode 风格 allow/ask/deny 细粒度策略或 hooks。
export function resolveAgentRuntimeCommandDecision({
  command,
  policy,
  approvedCommand = false
}: {
  command: string;
  policy: AgentCommandSafetyPolicy;
  approvedCommand?: boolean;
}): AgentRuntimeCommandDecision {
  const risk = resolveAgentCommandRisk(command, policy);

  if (risk.level === "deny") {
    return {
      kind: "deny",
      risk: {
        level: "deny",
        reason: risk.reason
      }
    };
  }

  if (risk.level === "ask" && !approvedCommand) {
    return {
      kind: "approval-required",
      risk: {
        level: "ask",
        reason: risk.reason
      }
    };
  }

  return {
    kind: "run",
    risk
  };
}

function getReusableActionOutcome(action: AgentAction): AgentActionRunOutcome | null {
  if (action.status === "pending") {
    return null;
  }

  if (action.status === "completed" || action.status === "skipped") {
    return {
      status: "completed",
      continueBatch: true
    };
  }

  return {
    status: action.status,
    continueBatch: false
  };
}
