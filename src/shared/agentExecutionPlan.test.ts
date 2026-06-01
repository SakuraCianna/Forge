import { describe, expect, it } from "vitest";
import type { AgentPlanStep } from "./agentTypes.js";
import { createAgentActionsFromPlanSteps } from "./agentExecutionPlan.js";

function createPlanStep(overrides: Partial<AgentPlanStep>): AgentPlanStep {
  return {
    id: "step-1",
    title: "Step",
    description: "Step",
    kind: "edit",
    status: "pending",
    ...overrides
  };
}

describe("agent execution plan", () => {
  it("does not turn prose with embedded project paths into an edit action", () => {
    const [action] = createAgentActionsFromPlanSteps([
      createPlanStep({
        description: "比较关键信息",
        kind: "edit",
        target:
          "比较关键信息: - backend/routes/accidents.py 中的路由列表 - frontend/src/components/下的组件"
      })
    ]);

    expect(action.kind).toBe("manual");
    expect(action.target).toContain("backend/routes/accidents.py");
  });

  it("keeps exact file targets executable for edits", () => {
    const actions = createAgentActionsFromPlanSteps([
      createPlanStep({
        description: "创建项目说明书",
        kind: "edit",
        target: "项目说明书.md"
      }),
      createPlanStep({
        id: "step-2",
        description: "更新路由",
        kind: "edit",
        target: "backend/routes/accidents.py"
      })
    ]);

    expect(actions).toEqual([
      expect.objectContaining({
        kind: "edit-file",
        target: "项目说明书.md"
      }),
      expect.objectContaining({
        kind: "edit-file",
        target: "backend/routes/accidents.py"
      })
    ]);
  });
});
