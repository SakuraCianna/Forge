// 本文件说明: 直接验证 Agent Runtime 队列预约、取消和批处理停止条件
import test from "node:test";
import assert from "node:assert/strict";
import type { AgentAction } from "../src/shared/agentExecutionPlan.js";
import {
  runAgentRuntimeQueuedAction,
  runAgentRuntimeQueuedActionBatch,
  type AgentRuntimeQueueCoordinator
} from "../src/renderer/src/agent/agentRuntimeQueue.js";

test("queued single action releases its reservation when the runner throws", async () => {
  const action = createAction("action-1");
  const coordinator = createCoordinator();

  await assert.rejects(
    runAgentRuntimeQueuedAction({
      threadId: "thread-1",
      action,
      coordinator,
      runReservedAction: () => {
        throw new Error("runner failed");
      }
    }),
    /runner failed/u
  );

  assert.equal(coordinator.reserved.size, 0);
  assert.deepEqual(coordinator.events, ["reserve:thread-1:action-1", "release:thread-1:action-1"]);
});

test("queued single action returns running when the same action is already reserved", async () => {
  const action = createAction("action-1");
  const coordinator = createCoordinator(["thread-1:action-1"]);
  let called = false;

  const outcome = await runAgentRuntimeQueuedAction({
    threadId: "thread-1",
    action,
    coordinator,
    runReservedAction: () => {
      called = true;
      return "completed";
    }
  });

  assert.deepEqual(outcome, {
    status: "running",
    continueBatch: false
  });
  assert.equal(called, false);
});

test("queued single action stops before side effects when the thread is cancelled", async () => {
  const action = createAction("action-1");
  const coordinator = createCoordinator([], ["thread-1"]);
  let called = false;

  const outcome = await runAgentRuntimeQueuedAction({
    threadId: "thread-1",
    action,
    coordinator,
    runReservedAction: () => {
      called = true;
      return "completed";
    }
  });

  assert.deepEqual(outcome, {
    status: "pending",
    continueBatch: false
  });
  assert.equal(called, false);
  assert.equal(coordinator.reserved.size, 0);
});

test("queued batch stops after the first failed action and releases reservation", async () => {
  const actions = [createAction("action-1"), createAction("action-2")];
  const coordinator = createCoordinator();
  const called: string[] = [];

  await runAgentRuntimeQueuedActionBatch({
    threadId: "thread-1",
    actions,
    coordinator,
    runReservedAction: (action) => {
      called.push(action.id);
      return {
        status: "failed",
        continueBatch: false
      };
    }
  });

  assert.deepEqual(called, ["action-1"]);
  assert.equal(coordinator.reserved.size, 0);
  assert.deepEqual(coordinator.events, [
    "reserve:thread-1:action-1,action-2",
    "release:thread-1:action-1,action-2"
  ]);
});

function createAction(id: string): AgentAction {
  return {
    id,
    stepId: id.replace("action", "step"),
    kind: "run-command",
    label: `运行 ${id}`,
    status: "pending",
    command: "npm test"
  };
}

function createCoordinator(
  reservedKeys: string[] = [],
  cancelledThreadIds: string[] = []
): AgentRuntimeQueueCoordinator & {
  events: string[];
  reserved: Set<string>;
} {
  const reserved = new Set(reservedKeys);
  const cancelled = new Set(cancelledThreadIds);
  const events: string[] = [];

  return {
    events,
    reserved,
    hasReservedAgentAction: (threadId, actions) =>
      actions.some((action) => reserved.has(`${threadId}:${action.id}`)),
    isThreadCancelled: (threadId) => cancelled.has(threadId),
    reserveAgentActionBatch: (threadId, actions) => {
      const actionIds = actions.map((action) => action.id).join(",");
      const eventKey = `${threadId}:${actionIds}`;

      events.push(`reserve:${eventKey}`);

      for (const action of actions) {
        reserved.add(`${threadId}:${action.id}`);
      }

      return () => {
        events.push(`release:${eventKey}`);

        for (const action of actions) {
          reserved.delete(`${threadId}:${action.id}`);
        }
      };
    }
  };
}
