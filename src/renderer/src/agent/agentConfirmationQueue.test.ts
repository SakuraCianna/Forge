import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  getBlockingFileChangePreviews,
  getAgentConfirmationItems,
  getAgentQueueControlState,
  getQueueBlockerAction,
  getQueueStats
} from "./agentConfirmationQueue";
import { countAutoFailureRecoveryAttempts } from "./failureRecoveryAttempts";

const inspectAction: AgentAction = {
  id: "action-1",
  stepId: "step-1",
  kind: "inspect-file",
  label: "Inspect src/App.tsx",
  status: "pending",
  target: "src/App.tsx"
};

const manualAction: AgentAction = {
  id: "action-2",
  stepId: "step-2",
  kind: "manual",
  label: "Review generated diff",
  status: "pending"
};

const failedAction: AgentAction = {
  id: "action-3",
  stepId: "step-3",
  kind: "run-command",
  label: "Run npm test",
  status: "failed",
  command: "npm test"
};

const commitAction: AgentAction = {
  id: "action-5",
  stepId: "step-5",
  kind: "commit",
  label: "Commit changes",
  status: "pending",
  target: "git commit -m update"
};

describe("agent confirmation queue", () => {
  it("summarizes queue state without duplicating UI logic", () => {
    const state = getAgentQueueControlState({
      actions: [inspectAction, manualAction],
      commandSafetyPolicy: {},
      agentPaused: false,
      hasPendingFileChanges: false
    });

    expect(state.queueBlocked).toBe(false);
    expect(state.nextRunnableAction?.id).toBe(inspectAction.id);
    expect(state.nextGateAction?.id).toBe(manualAction.id);
    expect(state.activeGateAction?.id).toBe(manualAction.id);
  });

  it("treats failed actions as active recovery blockers", () => {
    const state = getAgentQueueControlState({
      actions: [failedAction, manualAction],
      commandSafetyPolicy: {},
      agentPaused: false,
      hasPendingFileChanges: false
    });

    expect(state.queueBlocked).toBe(true);
    expect(state.queueBlockerAction?.id).toBe(failedAction.id);
    expect(state.runnablePendingActions).toEqual([]);
  });

  it("builds confirmation items for pending changes and failed actions", () => {
    const items = getAgentConfirmationItems({
      actions: [failedAction],
      changePreviews: [{ relativePath: "src/App.tsx" }],
      commandSafetyPolicy: {},
      fullAccess: false,
      activeGateAction: null,
      projectPath: "E:\\CodeHome\\Forge",
      queueBlockerAction: failedAction,
      failureRecoveryPolicy: "suggest",
      maxFailureRecoveryAttempts: 2,
      events: [
        {
          failureRecoveryAttempt: {
            actionId: failedAction.id,
            label: failedAction.label,
            source: "auto",
            attempt: 1,
            limit: 2
          }
        }
      ]
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "pending-changes",
      active: true,
      pendingChangeCount: 1,
      previewPath: "src/App.tsx"
    });
    expect(items[1]).toMatchObject({
      kind: "failed-action",
      active: false,
      command: "npm test",
      cwd: "E:\\CodeHome\\Forge",
      failureRecoveryPolicy: "suggest",
      maxFailureRecoveryAttempts: 2,
      autoFailureRecoveryAttemptsUsed: 1,
      autoFailureRecoveryExhausted: false
    });
  });

  it("does not block full access queues on pending file changes", () => {
    const fullAccessState = getAgentQueueControlState({
      actions: [inspectAction],
      commandSafetyPolicy: { fullAccess: true },
      agentPaused: false,
      hasPendingFileChanges: true
    });
    const fullAccessItems = getAgentConfirmationItems({
      actions: [inspectAction],
      changePreviews: [{ relativePath: "src/App.tsx" }],
      commandSafetyPolicy: { fullAccess: true },
      fullAccess: true,
      activeGateAction: fullAccessState.activeGateAction,
      projectPath: "E:\\CodeHome\\Forge",
      queueBlockerAction: fullAccessState.queueBlockerAction
    });

    expect(fullAccessState.queueBlocked).toBe(false);
    expect(fullAccessState.runnablePendingActions.map((action) => action.id)).toEqual([
      inspectAction.id
    ]);
    expect(fullAccessItems).toHaveLength(0);
  });

  it("keeps previews from non-full-access sources blocking automatic queues", () => {
    const previews = [
      { relativePath: "src/full.ts", source: { threadId: "full-access-thread" } },
      { relativePath: "src/manual.ts", source: { threadId: "manual-thread" } },
      { relativePath: "src/unknown.ts" }
    ];

    expect(
      getBlockingFileChangePreviews(previews, {
        isFullAccessThread: (threadId) => threadId === "full-access-thread"
      }).map((preview) => preview.relativePath)
    ).toEqual(["src/manual.ts", "src/unknown.ts"]);
  });

  it("marks failed auto recovery as exhausted when its limit is reached", () => {
    const items = getAgentConfirmationItems({
      actions: [failedAction],
      changePreviews: [],
      commandSafetyPolicy: {},
      fullAccess: false,
      activeGateAction: failedAction,
      projectPath: "E:\\CodeHome\\Forge",
      queueBlockerAction: failedAction,
      failureRecoveryPolicy: "auto",
      maxFailureRecoveryAttempts: 1,
      events: [
        {
          failureRecoveryAttempt: {
            actionId: failedAction.id,
            label: failedAction.label,
            source: "auto",
            attempt: 1,
            limit: 1
          }
        }
      ]
    });

    expect(items[0]).toMatchObject({
      kind: "failed-action",
      active: true,
      failureRecoveryPolicy: "auto",
      maxFailureRecoveryAttempts: 1,
      autoFailureRecoveryAttemptsUsed: 1,
      autoFailureRecoveryExhausted: true
    });
  });

  it("requires confirmation for unknown commands unless full access is active", () => {
    const commandAction: AgentAction = {
      id: "action-4",
      stepId: "step-4",
      kind: "run-command",
      label: "Run custom tool",
      status: "pending",
      command: "custom-tool --write"
    };

    const restrictedItems = getAgentConfirmationItems({
      actions: [commandAction],
      changePreviews: [],
      commandSafetyPolicy: {},
      fullAccess: false,
      activeGateAction: commandAction,
      projectPath: "E:\\CodeHome\\Forge",
      queueBlockerAction: commandAction
    });
    const fullAccessItems = getAgentConfirmationItems({
      actions: [commandAction],
      changePreviews: [],
      commandSafetyPolicy: {},
      fullAccess: true,
      activeGateAction: null,
      projectPath: "E:\\CodeHome\\Forge",
      queueBlockerAction: null
    });

    expect(restrictedItems[0]).toMatchObject({
      kind: "command-approval",
      active: true,
      command: "custom-tool --write"
    });
    expect(restrictedItems[0]?.riskReason).toBeTruthy();
    expect(fullAccessItems).toHaveLength(0);
  });

  it("does not expose manual or commit gates when full access is active", () => {
    const restrictedItems = getAgentConfirmationItems({
      actions: [manualAction, commitAction],
      changePreviews: [],
      commandSafetyPolicy: {},
      fullAccess: false,
      activeGateAction: manualAction,
      projectPath: "E:\\CodeHome\\Forge",
      queueBlockerAction: null
    });
    const fullAccessState = getAgentQueueControlState({
      actions: [manualAction, commitAction],
      commandSafetyPolicy: { fullAccess: true },
      agentPaused: false,
      hasPendingFileChanges: false
    });
    const fullAccessItems = getAgentConfirmationItems({
      actions: [manualAction, commitAction],
      changePreviews: [],
      commandSafetyPolicy: { fullAccess: true },
      fullAccess: true,
      activeGateAction: fullAccessState.activeGateAction,
      projectPath: "E:\\CodeHome\\Forge",
      queueBlockerAction: fullAccessState.queueBlockerAction
    });

    expect(restrictedItems.map((item) => item.kind)).toEqual(["manual-gate", "commit-gate"]);
    expect(fullAccessState.activeGateAction).toBeNull();
    expect(fullAccessState.runnablePendingActions.map((action) => action.id)).toEqual([
      manualAction.id,
      commitAction.id
    ]);
    expect(fullAccessItems).toHaveLength(0);
  });

  it("counts queue progress and identifies blockers", () => {
    expect(getQueueStats([{ ...inspectAction, status: "completed" }, failedAction])).toEqual({
      completed: 1,
      failed: 1,
      total: 2
    });
    expect(getQueueBlockerAction([{ ...inspectAction, status: "completed" }, failedAction])?.id).toBe(
      failedAction.id
    );
  });

  it("counts only automatic recovery attempts for the matching action", () => {
    expect(
      countAutoFailureRecoveryAttempts(
        [
          { failureRecoveryAttempt: { actionId: failedAction.id, label: "manual", source: "manual" } },
          { failureRecoveryAttempt: { actionId: failedAction.id, label: "auto", source: "auto" } },
          { failureRecoveryAttempt: { actionId: "other", label: "auto", source: "auto" } }
        ],
        failedAction.id
      )
    ).toBe(1);
    expect(
      countAutoFailureRecoveryAttempts([
        { failureRecoveryAttempt: { actionId: failedAction.id, label: "auto", source: "auto" } },
        { failureRecoveryAttempt: { actionId: "other", label: "auto", source: "auto" } }
      ])
    ).toBe(2);
  });
});
