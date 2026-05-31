// 本文件说明: 覆盖 Agent 动作队列的可执行判断和批量推进
import { describe, expect, it, vi } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import {
  findNextPendingAgentAction,
  getRunnablePendingAgentActions,
  resolveAgentCommandRisk,
  resolveAgentActionPermission,
  resolveAgentActionExecution,
  runAgentActionBatch,
  shouldTreatMissingInspectAsNewFile
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

  it("collects consecutive file edits into one preview batch before verification", () => {
    const firstEdit = createAction({
      id: "action-1",
      status: "pending",
      kind: "edit-file",
      target: "src/App.tsx"
    });
    const secondEdit = createAction({
      id: "action-2",
      status: "pending",
      kind: "edit-file",
      target: "src/state.ts"
    });
    const verify = createAction({
      id: "action-3",
      status: "pending",
      kind: "run-command",
      command: "npm test"
    });

    expect(getRunnablePendingAgentActions([firstEdit, secondEdit, verify]).map((action) => action.id)).toEqual([
      "action-1",
      "action-2"
    ]);
  });

  it("stops safe batches before commands that require approval", () => {
    const inspect = createAction({
      id: "action-1",
      status: "pending",
      kind: "inspect-file",
      target: "src/App.tsx"
    });
    const install = createAction({
      id: "action-2",
      status: "pending",
      kind: "run-command",
      command: "npm install"
    });
    const test = createAction({
      id: "action-3",
      status: "pending",
      kind: "run-command",
      command: "npm test"
    });

    expect(getRunnablePendingAgentActions([inspect, install, test]).map((action) => action.id)).toEqual([
      "action-1"
    ]);
  });

  it("lets full access continue through approval-gated but non-destructive commands", () => {
    const inspect = createAction({
      id: "action-1",
      status: "completed",
      kind: "inspect-file",
      target: "src/App.tsx"
    });
    const install = createAction({
      id: "action-2",
      status: "pending",
      kind: "run-command",
      command: "npm install"
    });
    const test = createAction({
      id: "action-3",
      status: "pending",
      kind: "run-command",
      command: "npm test"
    });

    expect(
      getRunnablePendingAgentActions([inspect, install, test], { fullAccess: true }).map(
        (action) => action.id
      )
    ).toEqual(["action-2", "action-3"]);
    expect(
      getRunnablePendingAgentActions(
        [
          inspect,
          createAction({
            id: "action-4",
            status: "pending",
            kind: "run-command",
            command: "Remove-Item -Recurse src"
          })
        ],
        { fullAccess: true }
      )
    ).toEqual([]);
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

  it("allows a missing inspect step to hand off to a later create-file edit", () => {
    const inspectNewFile = createAction({
      id: "action-1",
      kind: "inspect-file",
      target: "项目说明书.md"
    });
    const createNewFile = createAction({
      id: "action-2",
      kind: "edit-file",
      target: "项目说明书.md"
    });

    expect(
      shouldTreatMissingInspectAsNewFile(inspectNewFile, [inspectNewFile, createNewFile])
    ).toBe(true);
    expect(
      shouldTreatMissingInspectAsNewFile(inspectNewFile, [
        inspectNewFile,
        createAction({
          id: "action-3",
          kind: "edit-file",
          target: "README.md"
        })
      ])
    ).toBe(false);
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

  it("denies file edits when the active agent profile lacks the edit tool", () => {
    const result = resolveAgentActionPermission(
      createAction({ kind: "edit-file", target: "src/App.tsx" }),
      createProfile({ enabledTools: ["read", "command"] })
    );

    expect(result).toEqual({
      ok: false,
      tool: "edit",
      message: "Agent profile Review does not allow edit actions"
    });
  });

  it("allows command actions only when the active agent profile exposes command access", () => {
    expect(
      resolveAgentActionPermission(
        createAction({ kind: "run-command", command: "npm test" }),
        createProfile({ enabledTools: ["read", "edit"] })
      )
    ).toEqual({
      ok: false,
      tool: "command",
      message: "Agent profile Review does not allow command actions"
    });

    expect(
      resolveAgentActionPermission(
        createAction({ kind: "run-command", command: "npm test" }),
        createProfile({ enabledTools: ["command"] })
      )
    ).toEqual({ ok: true });
  });

  it("allows common local inspection and verification commands", () => {
    expect(resolveAgentCommandRisk("git status --short")).toEqual({ level: "allow" });
    expect(resolveAgentCommandRisk("npm test -- --reporter=dot")).toEqual({ level: "allow" });
    expect(resolveAgentCommandRisk("npm run typecheck")).toEqual({ level: "allow" });
  });

  it("allows read-only PowerShell pipeline helper commands", () => {
    expect(resolveAgentCommandRisk("Get-ChildItem -Recurse src | Select-Object -First 20")).toEqual({
      level: "allow"
    });
    expect(resolveAgentCommandRisk("Get-ChildItem src | Where-Object Name -Like *.ts | Sort-Object Name")).toEqual({
      level: "allow"
    });
  });

  it("requires approval for PowerShell pipeline helpers with script blocks", () => {
    expect(resolveAgentCommandRisk("rg TODO src | Where-Object { $_ -match 'TODO' }")).toEqual({
      level: "ask",
      reason: "command is not in the safe allowlist"
    });
  });

  it("uses configured command rules for non-destructive commands", () => {
    expect(
      resolveAgentCommandRisk("npm run e2e -- --ui", {
        rules: [
          {
            id: "local-e2e",
            pattern: "npm run e2e *",
            level: "allow",
            reason: "local e2e is approved"
          }
        ]
      })
    ).toEqual({ level: "allow" });

    expect(
      resolveAgentCommandRisk("npm run publish-preview", {
        rules: [
          {
            id: "preview-publish",
            pattern: "npm run publish-*",
            level: "ask",
            reason: "publishes preview"
          }
        ]
      })
    ).toEqual({
      level: "ask",
      reason: "publishes preview"
    });
  });

  it("requires approval for mutating package and Git commands", () => {
    expect(resolveAgentCommandRisk("npm install")).toEqual({
      level: "ask",
      reason: "command may change dependencies or project state"
    });
    expect(resolveAgentCommandRisk("git commit -m test")).toEqual({
      level: "ask",
      reason: "command may change Git history or remote state"
    });
  });

  it("denies destructive commands and compound commands containing denied segments", () => {
    expect(resolveAgentCommandRisk("git status; Remove-Item -Recurse src")).toEqual({
      level: "deny",
      reason: "command can delete files or rewrite history"
    });
    expect(resolveAgentCommandRisk("git reset --hard HEAD")).toEqual({
      level: "deny",
      reason: "command can delete files or rewrite history"
    });
  });

  it("keeps destructive built-in denies stronger than configured allow rules", () => {
    expect(
      resolveAgentCommandRisk("Remove-Item -Recurse src", {
        rules: [
          {
            id: "allow-all",
            pattern: "*",
            level: "allow",
            reason: "trusted local command"
          }
        ]
      })
    ).toEqual({
      level: "deny",
      reason: "command can delete files or rewrite history"
    });
  });

  it("applies configured command rules to safe batch gating", () => {
    const inspect = createAction({
      id: "action-1",
      status: "completed",
      kind: "inspect-file",
      target: "src/App.tsx"
    });
    const e2e = createAction({
      id: "action-2",
      status: "pending",
      kind: "run-command",
      command: "npm run e2e -- --ui"
    });
    const build = createAction({
      id: "action-3",
      status: "pending",
      kind: "run-command",
      command: "npm run build"
    });

    expect(getRunnablePendingAgentActions([inspect, e2e, build]).map((action) => action.id)).toEqual([]);
    expect(
      getRunnablePendingAgentActions([inspect, e2e, build], {
        rules: [
          {
            id: "local-e2e",
            pattern: "npm run e2e *",
            level: "allow",
            reason: "local e2e is approved"
          }
        ]
      }).map((action) => action.id)
    ).toEqual(["action-2", "action-3"]);
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

// 构造测试 Agent 配置并允许覆盖工具权限
function createProfile(overrides: Partial<AgentProfileContext> = {}): AgentProfileContext {
  return {
    id: "review",
    name: "Review",
    description: "Read-only review",
    instructions: "Review only",
    permissionMode: "auto",
    enabledTools: ["read"],
    contextBudget: 12000,
    ...overrides
  };
}
