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
