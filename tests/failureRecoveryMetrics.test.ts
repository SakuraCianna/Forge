import test from "node:test";
import assert from "node:assert/strict";
import type { AgentAction } from "../src/shared/agentExecutionPlan.js";
import {
  type FailureRecoveryMetricThread,
  hasActionFailureHistory,
  resolveFailureRecoveryMetricDecision
} from "../src/renderer/src/agent/failureRecoveryMetrics.js";

const createdAt = "2026-06-06T04:00:00.000Z";
const action: AgentAction = {
  id: "action-1",
  stepId: "step-1",
  kind: "run-command",
  label: "运行验证命令",
  status: "failed",
  command: "npm test"
};
const secondAction: AgentAction = {
  ...action,
  id: "action-2",
  stepId: "step-2",
  command: "npm run build"
};

test("failure recovery metrics record recovered actions after a failure and recovery attempt", () => {
  const thread = createThreadWithFailureRecoveryAttempt();
  const recordedKeys = new Set<string>();

  assert.equal(hasActionFailureHistory(thread, action.id), true);
  assert.equal(
    thread.events.some((event) => event.failureRecoveryAttempt?.actionId === action.id),
    true
  );

  const decision = resolveFailureRecoveryMetricDecision({
    action,
    createdAt,
    recovered: true,
    recordedKeys,
    thread,
    threadId: thread.id
  });

  assert.equal(decision.kind, "record");
  assert.deepEqual(decision.kind === "record" ? decision.observation : null, {
    kind: "failure_recovery",
    createdAt,
    recovered: true
  });

  if (decision.kind === "record") {
    recordedKeys.add(decision.key);
  }

  assert.equal(
    resolveFailureRecoveryMetricDecision({
      action,
      createdAt,
      recovered: true,
      recordedKeys,
      thread,
      threadId: thread.id
    }).kind,
    "skip"
  );
});

test("failure recovery metrics record unrecovered actions when a failed action is skipped", () => {
  const thread = createThreadWithFailureRecoveryAttempt();
  const decision = resolveFailureRecoveryMetricDecision({
    action,
    createdAt,
    recovered: false,
    recordedKeys: new Set(),
    thread,
    threadId: thread.id
  });

  assert.equal(decision.kind, "record");
  assert.deepEqual(decision.kind === "record" ? decision.observation : null, {
    kind: "failure_recovery",
    createdAt,
    recovered: false
  });
});

test("failure recovery metrics record recovered and unrecovered actions in the same thread", () => {
  const thread = createThreadWithFailureRecoveryAttempts([action, secondAction]);
  const recordedKeys = new Set<string>();
  const recoveredDecision = resolveFailureRecoveryMetricDecision({
    action,
    createdAt,
    recovered: true,
    recordedKeys,
    thread,
    threadId: thread.id
  });

  assert.equal(recoveredDecision.kind, "record");

  if (recoveredDecision.kind === "record") {
    recordedKeys.add(recoveredDecision.key);
  }

  const unrecoveredDecision = resolveFailureRecoveryMetricDecision({
    action: secondAction,
    createdAt,
    recovered: false,
    recordedKeys,
    thread,
    threadId: thread.id
  });

  assert.equal(unrecoveredDecision.kind, "record");
  assert.deepEqual(
    [
      recoveredDecision.kind === "record" ? recoveredDecision.observation : null,
      unrecoveredDecision.kind === "record" ? unrecoveredDecision.observation : null
    ],
    [
      {
        kind: "failure_recovery",
        createdAt,
        recovered: true
      },
      {
        kind: "failure_recovery",
        createdAt,
        recovered: false
      }
    ]
  );
});

test("failure recovery metrics do not record recovery without failure history", () => {
  const thread = createBaseThread({
    agentActions: [{ ...action, status: "completed" }],
    events: [
      {
        id: "thread-1-recovery-attempt-action-1",
        kind: "plan",
        message: "准备恢复计划",
        createdAt,
        failureRecoveryAttempt: {
          actionId: action.id,
          label: action.label,
          source: "manual"
        }
      }
    ]
  });

  const decision = resolveFailureRecoveryMetricDecision({
    action,
    createdAt,
    recovered: true,
    recordedKeys: new Set(),
    thread,
    threadId: thread.id
  });

  assert.deepEqual(decision, {
    kind: "skip",
    key: "thread-1:action-1:recovered",
    reason: "no-failure-history"
  });
});

type TestThread = FailureRecoveryMetricThread & {
  id: string;
  agentActions: AgentAction[];
};

function createThreadWithFailureRecoveryAttempt(): TestThread {
  return createThreadWithFailureRecoveryAttempts([action]);
}

function createThreadWithFailureRecoveryAttempts(actions: AgentAction[]): TestThread {
  return createBaseThread({
    agentActions: actions,
    events: actions.flatMap((failedAction, index) => {
      const actionDescription =
        "command" in failedAction ? failedAction.command : failedAction.label;

      return [
        {
          id: `thread-1-agent-action-run-failed-${failedAction.id}`,
          kind: "error",
          message: `动作失败: ${actionDescription}`,
          createdAt,
          agentActionRun: {
            actionId: failedAction.id,
            label: failedAction.label,
            status: "failed",
            startedAt: createdAt,
            completedAt: createdAt,
            durationMs: 0
          }
        },
        {
          id: `thread-1-recovery-attempt-${failedAction.id}`,
          kind: "plan",
          message: `自动恢复: ${actionDescription}`,
          createdAt,
          failureRecoveryAttempt: {
            actionId: failedAction.id,
            label: failedAction.label,
            source: "auto",
            attempt: index + 1,
            limit: 2
          }
        }
      ];
    })
  });
}

function createBaseThread(
  patch: Pick<TestThread, "agentActions" | "events">
): TestThread {
  return {
    id: "thread-1",
    ...patch
  };
}
