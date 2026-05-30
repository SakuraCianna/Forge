// 本文件说明: 判断 Agent 动作是否可执行并按队列推进动作
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";

type AgentActionExecution =
  | { kind: "open-file"; relativePath: string }
  | { kind: "generate-file-change"; relativePath: string }
  | { kind: "run-command"; command: string }
  | { kind: "manual-gate"; reason: "review" | "commit" }
  | { kind: "complete" };

type AgentToolPermission = "read" | "edit" | "command" | "git";

export type AgentActionPermissionResult =
  | { ok: true }
  | { ok: false; tool: AgentToolPermission; message: string };

// 根据动作类型决定执行方式, 不能自动执行的动作返回阻塞原因
export function resolveAgentActionExecution(action: AgentAction): AgentActionExecution {
  if (action.kind === "manual" || action.kind === "commit") {
    return { kind: "manual-gate", reason: action.kind === "commit" ? "commit" : "review" };
  }

  if (action.kind === "inspect-file" && action.target) {
    return { kind: "open-file", relativePath: action.target };
  }

  if (action.kind === "edit-file" && action.target) {
    return { kind: "generate-file-change", relativePath: action.target };
  }

  if (action.kind === "run-command" && action.command) {
    return { kind: "run-command", command: action.command };
  }

  return { kind: "complete" };
}

// 将 Agent 配置里的工具开关变成执行前硬边界, 避免只停留在提示词层
export function resolveAgentActionPermission(
  action: AgentAction,
  agentProfile?: AgentProfileContext
): AgentActionPermissionResult {
  const requiredTool = getRequiredToolForAction(action);

  if (!requiredTool || !agentProfile) {
    return { ok: true };
  }

  if (agentProfile.enabledTools.includes(requiredTool)) {
    return { ok: true };
  }

  return {
    ok: false,
    tool: requiredTool,
    message: `Agent profile ${agentProfile.name} does not allow ${requiredTool} actions`
  };
}

// 找到队列里第一个还没完成的动作, 用于决定下一步提示
export function findNextPendingAgentAction(actions: AgentAction[]): AgentAction | null {
  return actions.find((action) => action.status === "pending") ?? null;
}

// 从队列开头收集可自动执行动作, 遇到人工步骤就停下
export function getRunnablePendingAgentActions(actions: AgentAction[]): AgentAction[] {
  const runnableActions: AgentAction[] = [];

  for (const action of actions) {
    if (action.status === "completed" || action.status === "skipped") {
      continue;
    }

    if (action.status !== "pending" || !isRunnableAgentAction(action)) {
      break;
    }

    runnableActions.push(action);

    if (action.kind === "edit-file") {
      break;
    }
  }

  return runnableActions;
}

type AgentActionBatchResult = {
  completed: number;
  stoppedAt: AgentAction | null;
  finalStatus: AgentAction["status"];
  stopReason: "status" | "pause" | null;
};

export type AgentActionRunOutcome =
  | AgentAction["status"]
  | {
      status: AgentAction["status"];
      continueBatch?: boolean;
    };

// 顺序执行动作批次, 前一个失败时不继续冒进
export async function runAgentActionBatch(
  actions: AgentAction[],
  runAction: (action: AgentAction) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>
): Promise<AgentActionBatchResult> {
  let completed = 0;
  let finalStatus: AgentAction["status"] = "completed";

  for (const action of actions) {
    const outcome = normalizeAgentActionRunOutcome(await runAction(action));
    const { status } = outcome;
    finalStatus = status;

    if (status !== "completed") {
      return {
        completed,
        stoppedAt: action,
        finalStatus,
        stopReason: "status"
      };
    }

    completed += 1;

    if (!outcome.continueBatch) {
      return {
        completed,
        stoppedAt: action,
        finalStatus,
        stopReason: "pause"
      };
    }
  }

  return {
    completed,
    stoppedAt: null,
    finalStatus,
    stopReason: null
  };
}

// 把空执行结果归一成成功, 让简单动作无需手写返回值
function normalizeAgentActionRunOutcome(outcome: AgentActionRunOutcome): {
  status: AgentAction["status"];
  continueBatch: boolean;
} {
  if (typeof outcome === "string") {
    return {
      status: outcome,
      continueBatch: true
    };
  }

  return {
    status: outcome.status,
    continueBatch: outcome.continueBatch ?? true
  };
}

// 判断动作是否适合自动执行, manual 和 commit 必须留给用户确认
export function isRunnableAgentAction(action: AgentAction): boolean {
  if ((action.kind === "inspect-file" || action.kind === "edit-file") && action.target) {
    return true;
  }

  if (action.kind === "run-command" && action.command) {
    return true;
  }

  return false;
}

// 将队列动作映射到 Agent 配置中的工具名
function getRequiredToolForAction(action: AgentAction): AgentToolPermission | null {
  if (action.kind === "inspect-file") {
    return "read";
  }

  if (action.kind === "edit-file") {
    return "edit";
  }

  if (action.kind === "run-command") {
    return "command";
  }

  if (action.kind === "commit") {
    return "git";
  }

  return null;
}
