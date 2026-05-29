import type { AgentAction } from "@shared/agentExecutionPlan";

export type AgentActionExecution =
  | { kind: "open-file"; relativePath: string }
  | { kind: "generate-file-change"; relativePath: string }
  | { kind: "run-command"; command: string }
  | { kind: "complete" };

export function resolveAgentActionExecution(action: AgentAction): AgentActionExecution {
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

function isRunnableAgentAction(action: AgentAction): boolean {
  if ((action.kind === "inspect-file" || action.kind === "edit-file") && action.target) {
    return true;
  }

  if (action.kind === "run-command" && action.command) {
    return true;
  }

  return false;
}
