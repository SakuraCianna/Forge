import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { TaskThread } from "@/state/taskThreads";
import {
  classifyAutoFailureForRecovery,
  createAutoFailureRecoverySkipEvent,
  createAutoFailureRecoverySkipKey,
  createAutoFailureFixKey,
  findFailedAgentQueueBlocker,
  getAutoFailureRecoverySkipEventPrefix,
  selectAutoFailureRecoveryCandidate,
  selectAutoFailureRecoverySkipNotice
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
    expect(candidate?.decision.reason).toBe("recoverable");
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

  it("skips failures that require permissions, dependency installs, or user intervention", () => {
    const permissionDeniedThread = createThread({
      events: [
        {
          id: "thread-1-permission-denied-action-1-2026-06-02T00:00:00.000Z",
          kind: "error",
          message: "Agent profile Developer does not allow command actions",
          createdAt: "2026-06-02T00:00:00.000Z"
        }
      ]
    });
    const dependencyMissingThread = createThread({
      events: [
        createCommandResultEvent("Cannot find module 'left-pad'\nRequire stack:\n- test.js")
      ]
    });
    const cancelledCommandThread = createThread({
      events: [
        createCommandResultEvent("", {
          cancelled: true,
          exitCode: null
        })
      ]
    });

    for (const thread of [
      permissionDeniedThread,
      dependencyMissingThread,
      cancelledCommandThread
    ]) {
      expect(
        selectAutoFailureRecoveryCandidate({
          threads: [thread],
          currentProjectPath: "E:\\CodeHome\\Forge",
          cancelledThreadIds: new Set(),
          activeKeys: new Set(),
          attemptedKeys: new Set(),
          countsByThreadId: new Map(),
          getThreadFailureRecoveryLimit: () => 2
        })
      ).toBeNull();
    }

    expect(
      classifyAutoFailureForRecovery(
        dependencyMissingThread,
        dependencyMissingThread.agentActions?.[0] ?? createAction("action-1", "failed")
      )
    ).toEqual({
      recoverable: false,
      reason: "requires-dependency",
      detail: "Missing dependency or package: left-pad"
    });
  });

  it("selects a non-recoverable skip notice once per action and reason", () => {
    const thread = createThread({
      events: [
        createCommandResultEvent("Cannot find module 'left-pad'\nRequire stack:\n- test.js")
      ]
    });
    const notice = selectAutoFailureRecoverySkipNotice({
      threads: [thread],
      currentProjectPath: "E:\\CodeHome\\Forge",
      cancelledThreadIds: new Set()
    });

    expect(notice?.failedAction.id).toBe("action-1");
    expect(notice?.decision.reason).toBe("requires-dependency");
    expect(notice?.key).toBe(
      createAutoFailureRecoverySkipKey("thread-1", "action-1", "requires-dependency")
    );

    const alreadyNotifiedThread = createThread({
      events: [
        ...thread.events,
        createAutoFailureRecoverySkipEvent({
          threadId: "thread-1",
          action: createAction("action-1", "failed"),
          decision: {
            recoverable: false,
            reason: "requires-dependency",
            detail: "Missing dependency or package: left-pad"
          },
          language: "zh-CN",
          createdAt: "2026-06-02T00:01:00.000Z"
        })
      ]
    });

    expect(
      selectAutoFailureRecoverySkipNotice({
        threads: [alreadyNotifiedThread],
        currentProjectPath: "E:\\CodeHome\\Forge",
        cancelledThreadIds: new Set()
      })
    ).toBeNull();
  });

  it("creates readable skip notice events for the current language", () => {
    const event = createAutoFailureRecoverySkipEvent({
      threadId: "thread-1",
      action: createAction("action-1", "failed"),
      decision: {
        recoverable: false,
        reason: "requires-permission",
        detail: "Permission problem: access is denied"
      },
      language: "zh-CN",
      createdAt: "2026-06-02T00:01:00.000Z"
    });

    expect(event.id).toBe(
      createAutoFailureRecoverySkipKey("thread-1", "action-1", "requires-permission")
    );
    expect(getAutoFailureRecoverySkipEventPrefix("thread-1", "action-1")).toBe(
      "thread-1-agent-action-recovery-skip-action-1-"
    );
    expect(event.kind).toBe("plan");
    expect(event.message).toContain("自动恢复已暂停");
    expect(event.message).toContain("需要用户确认权限");
    expect(event.message).toContain("access is denied");
  });

  it("keeps local source import failures recoverable", () => {
    const thread = createThread({
      events: [
        createCommandResultEvent("Module not found: Error: Can't resolve './LocalWidget'")
      ]
    });

    const decision = classifyAutoFailureForRecovery(
      thread,
      thread.agentActions?.[0] ?? createAction("action-1", "failed")
    );

    expect(decision).toEqual({ recoverable: true, reason: "recoverable" });
    expect(
      selectAutoFailureRecoveryCandidate({
        threads: [thread],
        currentProjectPath: "E:\\CodeHome\\Forge",
        cancelledThreadIds: new Set(),
        activeKeys: new Set(),
        attemptedKeys: new Set(),
        countsByThreadId: new Map(),
        getThreadFailureRecoveryLimit: () => 2
      })?.failedAction.id
    ).toBe("action-1");
  });
});

function createCommandResultEvent(
  stderr: string,
  overrides: Partial<NonNullable<TaskThread["events"][number]["commandResult"]>> = {}
): TaskThread["events"][number] {
  return {
    id: "thread-1-command-finished-2026-06-02T00:00:00.000Z",
    kind: "error",
    message: stderr,
    createdAt: "2026-06-02T00:00:00.000Z",
    commandResult: {
      actionId: "action-1",
      command: "npm test",
      cwd: "E:\\CodeHome\\Forge",
      exitCode: 1,
      stdout: "",
      stderr,
      timedOut: false,
      ...overrides
    }
  };
}
