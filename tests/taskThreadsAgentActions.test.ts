import test from "node:test";
import assert from "node:assert/strict";
import type { AgentAction } from "../src/shared/agentExecutionPlan.js";
import {
  attachThreadAgentActions,
  type TaskThread
} from "../src/renderer/src/state/taskThreads.js";

test("attaching a new agent action queue removes stale completion summaries", () => {
  const thread = createThread({
    status: "completed",
    agentActions: [
      createAction("action-1", "inspect-file", "completed")
    ],
    events: [
      {
        id: "thread-1-agent-summary-2026-06-07T01:00:00.000Z",
        kind: "result",
        message: "本次已完成。",
        createdAt: "2026-06-07T01:00:00.000Z",
        completedAt: "2026-06-07T01:00:00.000Z"
      }
    ]
  });
  const nextActions = [createAction("action-2", "run-command", "pending")];
  const [updated] = attachThreadAgentActions([thread], "thread-1", nextActions);

  assert.equal(updated?.status, "planned");
  assert.deepEqual(updated?.agentActions?.map((action) => action.id), ["action-2"]);
  assert.equal(
    updated?.events.some((event) => event.id.startsWith("thread-1-agent-summary-")),
    false
  );
});

function createThread(patch: Partial<TaskThread>): TaskThread {
  return {
    id: "thread-1",
    title: "Task",
    prompt: "写一个测试项目",
    status: "running",
    modelId: "model",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2026-06-07T00:00:00.000Z",
    events: [],
    ...patch
  };
}

function createAction(
  id: string,
  kind: AgentAction["kind"],
  status: AgentAction["status"]
): AgentAction {
  return {
    id,
    stepId: id.replace("action", "step"),
    kind,
    label: id,
    status,
    target: kind === "inspect-file" ? "src/App.tsx" : undefined,
    command: kind === "run-command" ? "npm test" : undefined
  };
}
