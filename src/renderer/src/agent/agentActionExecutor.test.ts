import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import { findNextPendingAgentAction, resolveAgentActionExecution } from "./agentActionExecutor";

describe("agentActionExecutor", () => {
  it("opens files for inspect actions", () => {
    expect(
      resolveAgentActionExecution(createAction({ kind: "inspect-file", target: "src/App.tsx" }))
    ).toEqual({
      kind: "open-file",
      relativePath: "src/App.tsx"
    });
  });

  it("generates AI change previews for edit actions", () => {
    expect(
      resolveAgentActionExecution(createAction({ kind: "edit-file", target: "src/App.tsx" }))
    ).toEqual({
      kind: "generate-file-change",
      relativePath: "src/App.tsx"
    });
  });

  it("runs shell commands for command actions", () => {
    expect(
      resolveAgentActionExecution(createAction({ kind: "run-command", command: "npm test" }))
    ).toEqual({
      kind: "run-command",
      command: "npm test"
    });
  });

  it("completes manual or incomplete actions without inventing work", () => {
    expect(resolveAgentActionExecution(createAction({ kind: "manual" }))).toEqual({
      kind: "complete"
    });
    expect(resolveAgentActionExecution(createAction({ kind: "edit-file" }))).toEqual({
      kind: "complete"
    });
  });

  it("finds the next pending action in queue order", () => {
    const first = createAction({ id: "action-1", status: "completed" });
    const second = createAction({ id: "action-2", status: "pending" });
    const third = createAction({ id: "action-3", status: "pending" });

    expect(findNextPendingAgentAction([first, second, third])).toBe(second);
    expect(findNextPendingAgentAction([first])).toBeNull();
  });
});

function createAction(overrides: Partial<AgentAction>): AgentAction {
  return {
    id: "action-1",
    stepId: "step-1",
    kind: "manual",
    label: "Review",
    status: "pending",
    ...overrides
  };
}
