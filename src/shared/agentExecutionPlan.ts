import type { AgentPlanStep } from "./agentTypes.js";

export type AgentActionKind = "inspect-file" | "edit-file" | "run-command" | "commit" | "manual";

export type AgentActionStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type AgentAction = {
  id: string;
  stepId: string;
  kind: AgentActionKind;
  label: string;
  status: AgentActionStatus;
  target?: string;
  command?: string;
};

export function createAgentActionsFromPlanSteps(steps: AgentPlanStep[]): AgentAction[] {
  return steps.map((step, index) => {
    const normalizedTarget = normalizeActionTarget(step.target);
    const id = `action-${index + 1}`;

    if (step.kind === "inspect" && normalizedTarget && isLikelyFilePath(normalizedTarget)) {
      return {
        id,
        stepId: step.id,
        kind: "inspect-file",
        label: `Inspect ${normalizedTarget}`,
        status: "pending",
        target: normalizedTarget
      };
    }

    if (step.kind === "edit" && normalizedTarget && isLikelyFilePath(normalizedTarget)) {
      return {
        id,
        stepId: step.id,
        kind: "edit-file",
        label: `Edit ${normalizedTarget}`,
        status: "pending",
        target: normalizedTarget
      };
    }

    if (step.kind === "verify" && normalizedTarget) {
      return {
        id,
        stepId: step.id,
        kind: "run-command",
        label: `Run ${normalizedTarget}`,
        status: "pending",
        command: normalizedTarget
      };
    }

    if (step.kind === "commit") {
      return {
        id,
        stepId: step.id,
        kind: "commit",
        label: normalizedTarget ? `Commit ${normalizedTarget}` : "Commit changes",
        status: "pending",
        target: normalizedTarget
      };
    }

    return {
      id,
      stepId: step.id,
      kind: "manual",
      label: step.description.trim() || step.title.trim() || "Review this plan step",
      status: "pending",
      target: normalizedTarget
    };
  });
}

function normalizeActionTarget(target: string | undefined): string | undefined {
  const normalized = target?.trim().replace(/^`|`$/g, "");

  return normalized || undefined;
}

function isLikelyFilePath(target: string): boolean {
  if (/^[a-z]+(\s|$)/i.test(target)) {
    return false;
  }

  return (
    target.includes("/") ||
    target.includes("\\") ||
    /\.[a-z0-9]+$/i.test(target) ||
    target.startsWith(".")
  );
}
