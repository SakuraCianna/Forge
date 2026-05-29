import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  findNextPendingAgentAction,
  getRunnablePendingAgentActions,
  resolveAgentActionExecution
} from "./agentActionExecutor";

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

  it("returns the safe pending action run until a manual gate", () => {
    const completed = createAction({ id: "action-1", status: "completed", kind: "inspect-file" });
    const inspect = createAction({
      id: "action-2",
      status: "pending",
      kind: "inspect-file",
      target: "src/App.tsx"
    });
    const edit = createAction({
      id: "action-3",
      status: "pending",
      kind: "edit-file",
      target: "src/App.tsx"
    });
    const verify = createAction({
      id: "action-4",
      status: "pending",
      kind: "run-command",
      command: "npm test"
    });
    const commit = createAction({ id: "action-5", status: "pending", kind: "commit" });
    const afterCommit = createAction({
      id: "action-6",
      status: "pending",
      kind: "run-command",
      command: "npm run build"
    });

    expect(
      getRunnablePendingAgentActions([completed, inspect, edit, verify, commit, afterCommit]).map(
        (action) => action.id
      )
    ).toEqual(["action-2", "action-3", "action-4"]);
  });

  it("does not auto-run when the next pending action needs manual review", () => {
    expect(
      getRunnablePendingAgentActions([
        createAction({ id: "action-1", status: "completed", kind: "inspect-file" }),
        createAction({ id: "action-2", status: "pending", kind: "manual" }),
        createAction({
          id: "action-3",
          status: "pending",
          kind: "run-command",
          command: "npm test"
        })
      ])
    ).toEqual([]);
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
