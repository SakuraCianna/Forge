// 本文件说明: 覆盖 Agent 动作队列的可执行判断和批量推进
import { describe, expect, it, vi } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  findNextPendingAgentAction,
  getRunnablePendingAgentActions,
  resolveAgentActionExecution,
  runAgentActionBatch
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

  it("keeps manual and commit actions behind an explicit review gate", () => {
    expect(resolveAgentActionExecution(createAction({ kind: "manual" }))).toEqual({
      kind: "manual-gate",
      reason: "review"
    });
    expect(resolveAgentActionExecution(createAction({ kind: "commit" }))).toEqual({
      kind: "manual-gate",
      reason: "commit"
    });
  });

  it("completes incomplete runnable actions without inventing work", () => {
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

  it("returns the safe pending action run until an edit preview or manual gate", () => {
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
    ).toEqual(["action-2", "action-3"]);
  });

  it("continues through verification commands when no edit preview is in the current batch", () => {
    const inspect = createAction({
      id: "action-1",
      status: "completed",
      kind: "inspect-file",
      target: "src/App.tsx"
    });
    const test = createAction({
      id: "action-2",
      status: "pending",
      kind: "run-command",
      command: "npm test"
    });
    const build = createAction({
      id: "action-3",
      status: "pending",
      kind: "run-command",
      command: "npm run build"
    });
    const commit = createAction({ id: "action-4", status: "pending", kind: "commit" });

    expect(getRunnablePendingAgentActions([inspect, test, build, commit]).map((action) => action.id)).toEqual([
      "action-2",
      "action-3"
    ]);
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

  it("runs safe action batches in order and stops after the first non-completed action", async () => {
    const first = createAction({ id: "action-1", kind: "inspect-file", target: "src/App.tsx" });
    const second = createAction({ id: "action-2", kind: "run-command", command: "npm test" });
    const third = createAction({ id: "action-3", kind: "run-command", command: "npm run build" });
    const runAction = vi
      .fn<(action: AgentAction) => Promise<AgentAction["status"]>>()
      .mockResolvedValueOnce("completed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("completed");

    const result = await runAgentActionBatch([first, second, third], runAction);

    expect(result).toEqual({
      completed: 1,
      stoppedAt: second,
      finalStatus: "failed",
      stopReason: "status"
    });
    expect(runAction).toHaveBeenCalledTimes(2);
    expect(runAction).toHaveBeenNthCalledWith(1, first);
    expect(runAction).toHaveBeenNthCalledWith(2, second);
  });

  it("stops after a completed action when it requests a batch pause", async () => {
    const edit = createAction({ id: "action-1", kind: "edit-file", target: "src/App.tsx" });
    const verify = createAction({ id: "action-2", kind: "run-command", command: "npm test" });
    const runAction = vi
      .fn<
        (action: AgentAction) => Promise<{
          status: AgentAction["status"];
          continueBatch: boolean;
        }>
      >()
      .mockResolvedValueOnce({ status: "completed", continueBatch: false })
      .mockResolvedValueOnce({ status: "completed", continueBatch: true });

    const result = await runAgentActionBatch([edit, verify], runAction);

    expect(result).toEqual({
      completed: 1,
      stoppedAt: edit,
      finalStatus: "completed",
      stopReason: "pause"
    });
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("runs every action in a safe batch when each action completes", async () => {
    const first = createAction({ id: "action-1", kind: "inspect-file", target: "src/App.tsx" });
    const second = createAction({ id: "action-2", kind: "run-command", command: "npm test" });
    const runAction =
      vi.fn<(action: AgentAction) => Promise<AgentAction["status"]>>().mockResolvedValue("completed");

    const result = await runAgentActionBatch([first, second], runAction);

    expect(result).toEqual({
      completed: 2,
      stoppedAt: null,
      finalStatus: "completed",
      stopReason: null
    });
    expect(runAction).toHaveBeenCalledTimes(2);
  });
});

// 构造测试动作并允许按用例覆盖关键字段
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
