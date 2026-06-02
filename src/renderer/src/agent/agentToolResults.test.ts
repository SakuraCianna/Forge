import { describe, expect, it } from "vitest";
import {
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
});
