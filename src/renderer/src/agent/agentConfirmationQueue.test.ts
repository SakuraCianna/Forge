import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  getAgentConfirmationItems,
  getAgentQueueControlState,
  getQueueBlockerAction,
  getQueueStats
} from "./agentConfirmationQueue";

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
      maxFailureRecoveryAttempts: 2
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
      maxFailureRecoveryAttempts: 2
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
});
