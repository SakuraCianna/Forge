import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  getRunnablePendingAgentActions,
  isRunnableAgentAction,
  resolveAgentActionExecution
} from "./agentActionExecutor";

function createAction(overrides: Partial<AgentAction>): AgentAction {
  return {
    id: "action-1",
    stepId: "step-1",
    kind: "edit-file",
    label: "Edit src/App.tsx",
    status: "pending",
    target: "src/App.tsx",
    ...overrides
  };
}

describe("agent action executor", () => {
  it("rejects legacy edit actions whose target is prose instead of a project file path", () => {
    const action = createAction({
      label: "Edit 比较关键信息",
      target: "比较关键信息: - backend/routes/accidents.py 中的路由列表 - frontend/src/components/下的组件"
    });

    expect(resolveAgentActionExecution(action)).toEqual({
      kind: "invalid-target",
      reason:
        "Invalid edit target: 比较关键信息: - backend/routes/accidents.py 中的路由列表 - frontend/src/components/下的组件"
    });
    expect(isRunnableAgentAction(action)).toBe(false);
  });

  it("keeps exact project file and directory targets runnable", () => {
    expect(resolveAgentActionExecution(createAction({ target: "backend/routes/accidents.py" }))).toEqual({
      kind: "generate-file-change",
      relativePath: "backend/routes/accidents.py"
    });
    expect(
      resolveAgentActionExecution(
        createAction({
          kind: "list-directory",
          label: "List frontend/src/components",
          target: "frontend/src/components"
        })
      )
    ).toEqual({
      kind: "list-directory",
      relativePath: "frontend/src/components"
    });
  });

  it("treats manual and commit gates as runnable only in full access mode", () => {
    const manualAction = createAction({
      kind: "manual",
      label: "Review generated files",
      target: undefined
    });
    const commitAction = createAction({
      id: "action-2",
      kind: "commit",
      label: "Commit changes",
      target: "git commit -m update"
    });

    expect(isRunnableAgentAction(manualAction)).toBe(false);
    expect(isRunnableAgentAction(commitAction)).toBe(false);
    expect(isRunnableAgentAction(manualAction, { fullAccess: true })).toBe(true);
    expect(isRunnableAgentAction(commitAction, { fullAccess: true })).toBe(true);
    expect(
      getRunnablePendingAgentActions([manualAction, commitAction], { fullAccess: true }).map(
        (action) => action.id
      )
    ).toEqual(["action-1", "action-2"]);
  });
});
