import type { AgentAction } from "@shared/agentExecutionPlan";

export type AgentActionExecution =
  | { kind: "open-file"; relativePath: string }
  | { kind: "generate-file-change"; relativePath: string }
  | { kind: "run-command"; command: string }
  | { kind: "manual-gate"; reason: "review" | "commit" }
  | { kind: "complete" };

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

export function findNextPendingAgentAction(actions: AgentAction[]): AgentAction | null {
  return actions.find((action) => action.status === "pending") ?? null;
}

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
  }

  return runnableActions;
}

export type AgentActionBatchResult = {
  completed: number;
  stoppedAt: AgentAction | null;
  finalStatus: AgentAction["status"];
};

export async function runAgentActionBatch(
  actions: AgentAction[],
  runAction: (action: AgentAction) => AgentAction["status"] | Promise<AgentAction["status"]>
): Promise<AgentActionBatchResult> {
  let completed = 0;
  let finalStatus: AgentAction["status"] = "completed";

  for (const action of actions) {
    const status = await runAction(action);
    finalStatus = status;

    if (status !== "completed") {
      return {
        completed,
        stoppedAt: action,
        finalStatus
      };
    }

    completed += 1;
  }

  return {
    completed,
    stoppedAt: null,
    finalStatus
  };
}

export function isRunnableAgentAction(action: AgentAction): boolean {
  if ((action.kind === "inspect-file" || action.kind === "edit-file") && action.target) {
    return true;
  }

  if (action.kind === "run-command" && action.command) {
    return true;
  }

  return false;
}
