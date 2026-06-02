import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { TaskThread } from "@/state/taskThreads";
import {
  createAutoFailureFixKey,
  findFailedAgentQueueBlocker,
  selectAutoFailureRecoveryCandidate
} from "./autoFailureRecovery";

const autoProfile: AgentProfileContext = {
  id: "developer",
  name: "Developer",
  description: "Builds code changes",
  instructions: "",
  permissionMode: "auto",
  enabledTools: [],
  contextBudget: 12000,
  planStepLimit: 8,
  autoRunBatchSize: 1,
  verificationPolicy: "suggest",
  failureRecoveryPolicy: "auto",
  maxFailureRecoveryAttempts: 2
};

function createAction(
  id: string,
  status: AgentAction["status"],
  overrides: Partial<AgentAction> = {}
): AgentAction {
  return {
    id,
    stepId: `step-${id}`,
    kind: "run-command",
    label: `Run ${id}`,
    status,
    command: "npm test",
    ...overrides
  };
}

function createThread(overrides: Partial<TaskThread> = {}): TaskThread {
  return {
    id: "thread-1",
    title: "Fix failing test",
    prompt: "Fix failing test",
    status: "blocked",
    modelId: "model-1",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2026-06-02T00:00:00.000Z",
    projectPath: "E:\\CodeHome\\Forge",
    agentProfile: autoProfile,
    agentActions: [createAction("action-1", "failed")],
    events: [],
    ...overrides
  };
}

describe("auto failure recovery", () => {
  it("finds only the failed action that blocks the queue", () => {
    expect(
      findFailedAgentQueueBlocker([
        createAction("action-1", "completed"),
        createAction("action-2", "failed"),
        createAction("action-3", "pending")
      ])?.id
    ).toBe("action-2");

    expect(
      findFailedAgentQueueBlocker([
        createAction("action-1", "pending"),
        createAction("action-2", "failed")
      ])
    ).toBeNull();
  });

  it("selects a same-project auto recovery candidate and carries attempt metadata", () => {
    const thread = createThread();
    const candidate = selectAutoFailureRecoveryCandidate({
      threads: [thread],
      currentProjectPath: "E:\\CodeHome\\Forge",
      cancelledThreadIds: new Set(),
      activeKeys: new Set(),
      attemptedKeys: new Set(),
      countsByThreadId: new Map([["thread-1", 1]]),
      getThreadFailureRecoveryLimit: () => 2
    });

    expect(candidate?.thread.id).toBe("thread-1");
    expect(candidate?.failedAction.id).toBe("action-1");
    expect(candidate?.key).toBe(createAutoFailureFixKey("thread-1", "action-1"));
    expect(candidate?.attempt).toBe(2);
    expect(candidate?.limit).toBe(2);
  });

  it("skips archived, cancelled, wrong-project, and non-auto threads", () => {
    const candidate = selectAutoFailureRecoveryCandidate({
      threads: [
        createThread({ id: "archived", archived: true }),
        createThread({ id: "cancelled" }),
        createThread({ id: "wrong-project", projectPath: "E:\\CodeHome\\Other" }),
        createThread({
          id: "manual",
          agentProfile: { ...autoProfile, failureRecoveryPolicy: "manual" }
        }),
        createThread({ id: "selected" })
      ],
      currentProjectPath: "E:\\CodeHome\\Forge",
      cancelledThreadIds: new Set(["cancelled"]),
      activeKeys: new Set(),
      attemptedKeys: new Set(),
      countsByThreadId: new Map(),
      getThreadFailureRecoveryLimit: () => 2
    });

    expect(candidate?.thread.id).toBe("selected");
  });

  it("respects zero limits and avoids duplicate recovery attempts", () => {
    const thread = createThread();
    const key = createAutoFailureFixKey("thread-1", "action-1");

    expect(
      selectAutoFailureRecoveryCandidate({
        threads: [thread],
        currentProjectPath: "E:\\CodeHome\\Forge",
        cancelledThreadIds: new Set(),
        activeKeys: new Set(),
        attemptedKeys: new Set(),
        countsByThreadId: new Map(),
        getThreadFailureRecoveryLimit: () => 0
      })
    ).toBeNull();

    expect(
      selectAutoFailureRecoveryCandidate({
        threads: [thread],
        currentProjectPath: "E:\\CodeHome\\Forge",
        cancelledThreadIds: new Set(),
        activeKeys: new Set([key]),
        attemptedKeys: new Set(),
        countsByThreadId: new Map(),
        getThreadFailureRecoveryLimit: () => 2
      })
    ).toBeNull();

    expect(
      selectAutoFailureRecoveryCandidate({
        threads: [
          createThread({
            events: [
              {
                id: "attempt-1",
                kind: "error",
                message: "auto recovery",
                createdAt: "2026-06-02T00:00:00.000Z",
                failureRecoveryAttempt: {
                  actionId: "action-1",
                  label: "Run action-1",
                  source: "auto",
                  attempt: 1,
                  limit: 2
                }
              }
            ]
          })
        ],
        currentProjectPath: "E:\\CodeHome\\Forge",
        cancelledThreadIds: new Set(),
        activeKeys: new Set(),
        attemptedKeys: new Set(),
        countsByThreadId: new Map(),
        getThreadFailureRecoveryLimit: () => 2
      })
    ).toBeNull();
  });
});
