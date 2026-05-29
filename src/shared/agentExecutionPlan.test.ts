import { describe, expect, it } from "vitest";
import type { AgentPlanStep } from "./agentTypes.js";
import { createAgentActionsFromPlanSteps } from "./agentExecutionPlan.js";

describe("agentExecutionPlan", () => {
  it("turns structured plan steps into a coding-agent action queue", () => {
    const steps: AgentPlanStep[] = [
      {
        id: "step-1",
        title: "Inspect App",
        description: "Inspect src/renderer/src/App.tsx before editing.",
        kind: "inspect",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "step-2",
        title: "Edit App",
        description: "Modify src/renderer/src/App.tsx to wire the new flow.",
        kind: "edit",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "step-3",
        title: "Verify",
        description: "Run npm test.",
        kind: "verify",
        status: "pending",
        target: "npm test"
      }
    ];

    expect(createAgentActionsFromPlanSteps(steps)).toEqual([
      {
        id: "action-1",
        stepId: "step-1",
        kind: "inspect-file",
        label: "Inspect src/renderer/src/App.tsx",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "action-2",
        stepId: "step-2",
        kind: "edit-file",
        label: "Edit src/renderer/src/App.tsx",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "action-3",
        stepId: "step-3",
        kind: "run-command",
        label: "Run npm test",
        status: "pending",
        command: "npm test"
      }
    ]);
  });

  it("keeps vague plan steps as manual actions instead of inventing file edits", () => {
    const steps: AgentPlanStep[] = [
      {
        id: "step-1",
        title: "Think",
        description: "Clarify the architecture before changing code.",
        kind: "other",
        status: "pending"
      }
    ];

    expect(createAgentActionsFromPlanSteps(steps)).toEqual([
      {
        id: "action-1",
        stepId: "step-1",
        kind: "manual",
        label: "Clarify the architecture before changing code.",
        status: "pending"
      }
    ]);
  });
});
