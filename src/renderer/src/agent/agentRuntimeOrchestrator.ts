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
} from "@/agent/agentActionExecutor";

type DeniedPermission = Extract<AgentActionPermissionResult, { ok: false }>;
type ManualGateExecution = Extract<AgentActionExecution, { kind: "manual-gate" }>;
type ExecutableAgentActionExecution = Exclude<AgentActionExecution, ManualGateExecution>;
type DeniedCommandRisk = { level: "deny"; reason: string };
type ApprovalCommandRisk = { level: "ask"; reason: string };

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

// 预检只判断当前动作是否应该进入执行分支, 不写线程状态, 不触发命令或文件 IO。
export function resolveAgentRuntimePreflightDecision({
  action,
  liveAction,
  agentProfile
}: {
  action: AgentAction;
  liveAction?: AgentAction | null;
  agentProfile?: AgentProfileContext;
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

  const execution = resolveAgentActionExecution(actionToRun);

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

  if (risk.level === "ask" && !policy.fullAccess && !approvedCommand) {
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
