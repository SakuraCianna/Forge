import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { TaskThread } from "@/state/taskThreads";
import {
  appendAgentToolResultEvent,
  getRecentAgentToolResultMessages,
  maxRecentAgentToolResults,
  rememberAgentToolResultMessage,
  type AgentToolResultStore
} from "./agentToolResults";

describe("agent tool results", () => {
  it("keeps recent tool results bounded per thread", () => {
    const store: AgentToolResultStore = new Map();

    for (let index = 0; index < maxRecentAgentToolResults + 2; index += 1) {
      rememberAgentToolResultMessage(store, "thread-1", `result ${index + 1}`);
    }

    expect(getRecentAgentToolResultMessages(store, "thread-1")).toEqual([
      "result 3",
      "result 4",
      "result 5",
      "result 6",
      "result 7",
      "result 8",
      "result 9",
      "result 10"
    ]);
  });

  it("dedupes repeated results and moves the latest result to the end", () => {
    const store: AgentToolResultStore = new Map();

    rememberAgentToolResultMessage(store, "thread-1", "read src/App.tsx");
    rememberAgentToolResultMessage(store, "thread-1", "search Agent");
    rememberAgentToolResultMessage(store, "thread-1", "read src/App.tsx");

    expect(getRecentAgentToolResultMessages(store, "thread-1")).toEqual([
      "search Agent",
      "read src/App.tsx"
    ]);
  });

  it("returns snapshots so callers cannot mutate the store", () => {
    const store: AgentToolResultStore = new Map();
    rememberAgentToolResultMessage(store, "thread-1", "git status");

    const snapshot = getRecentAgentToolResultMessages(store, "thread-1");
    snapshot.push("mutated");

    expect(getRecentAgentToolResultMessages(store, "thread-1")).toEqual(["git status"]);
  });

  it("ignores blank messages", () => {
    const store: AgentToolResultStore = new Map();

    rememberAgentToolResultMessage(store, "thread-1", "   ");

    expect(getRecentAgentToolResultMessages(store, "thread-1")).toEqual([]);
  });

  it("appends a tool result event and marks the matching action completed", () => {
    const threads = [
      createThread({
        id: "thread-1",
        agentActions: [createAction({ id: "action-1", kind: "search-project" })]
      })
    ];

    const nextThreads = appendAgentToolResultEvent(threads, {
      threadId: "thread-1",
      action: threads[0].agentActions![0],
      toolKind: "search",
      message: "Searched for Agent",
      createdAt: "2026-06-02T00:00:00.000Z"
    });

    expect(nextThreads[0].agentActions?.[0].status).toBe("completed");
    expect(nextThreads[0].events).toEqual([
      {
        id: "thread-1-agent-search-action-1-2026-06-02T00:00:00.000Z",
        kind: "file",
        message: "Searched for Agent",
        createdAt: "2026-06-02T00:00:00.000Z"
      }
    ]);
  });

  it("keeps other threads and actions untouched when appending a tool result event", () => {
    const threads = [
      createThread({
        id: "thread-1",
        agentActions: [
          createAction({ id: "action-1", kind: "list-directory" }),
          createAction({ id: "action-2", kind: "edit-file" })
        ]
      }),
      createThread({
        id: "thread-2",
        agentActions: [createAction({ id: "action-3", kind: "git-status" })]
      })
    ];

    const nextThreads = appendAgentToolResultEvent(threads, {
      threadId: "thread-1",
      action: threads[0].agentActions![0],
      toolKind: "list-directory",
      message: "Listed src",
      createdAt: "2026-06-02T00:01:00.000Z"
    });

    expect(nextThreads[0].agentActions?.map((action) => action.status)).toEqual([
      "completed",
      "pending"
    ]);
    expect(nextThreads[1]).toBe(threads[1]);
  });
});

function createAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "action-1",
    stepId: "step-1",
    kind: "inspect-file",
    label: "Inspect file",
    status: "pending",
    ...overrides
  };
}

function createThread(overrides: Partial<TaskThread> = {}): TaskThread {
  return {
    id: "thread-1",
    title: "Thread",
    prompt: "Inspect the project",
    status: "running",
    modelId: "model-1",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2026-06-02T00:00:00.000Z",
    events: [],
    ...overrides
  };
}
