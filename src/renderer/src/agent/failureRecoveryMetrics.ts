// 本文件说明: 封装失败恢复指标写入判断, 让恢复闭环可以脱离 App 组件单测
import type { AgentAction } from "../../../shared/agentExecutionPlan.js";
import type { AgentQualityObservation } from "../../../shared/agentQualityMetrics.js";

type FailureRecoveryObservation = Extract<
  AgentQualityObservation,
  { kind: "failure_recovery" }
>;

export type FailureRecoveryMetricThread = {
  events: Array<{
    agentActionRun?: {
      actionId: string;
      status: string;
      [key: string]: unknown;
    };
    failureRecoveryAttempt?: {
      actionId: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
};

export type FailureRecoveryMetricDecision =
  | {
      kind: "record";
      key: string;
      observation: FailureRecoveryObservation;
    }
  | {
      kind: "skip";
      key: string;
      reason: "already-recorded" | "missing-thread" | "no-failure-history";
    };

export function resolveFailureRecoveryMetricDecision({
  action,
  createdAt = new Date().toISOString(),
  recovered,
  recordedKeys,
  thread,
  threadId
}: {
  action: Pick<AgentAction, "id">;
  createdAt?: string;
  recovered: boolean;
  recordedKeys: ReadonlySet<string>;
  thread: FailureRecoveryMetricThread | null | undefined;
  threadId: string;
}): FailureRecoveryMetricDecision {
  const key = createFailureRecoveryMetricKey(threadId, action.id, recovered);

  if (recordedKeys.has(key)) {
    return {
      kind: "skip",
      key,
      reason: "already-recorded"
    };
  }

  if (!thread) {
    return {
      kind: "skip",
      key,
      reason: "missing-thread"
    };
  }

  if (!hasActionFailureHistory(thread, action.id)) {
    return {
      kind: "skip",
      key,
      reason: "no-failure-history"
    };
  }

  return {
    kind: "record",
    key,
    observation: {
      kind: "failure_recovery",
      createdAt,
      recovered
    }
  };
}

export function hasActionFailureHistory(
  thread: FailureRecoveryMetricThread,
  actionId: string
): boolean {
  return thread.events.some(
    (event) => event.agentActionRun?.actionId === actionId && event.agentActionRun.status === "failed"
  );
}

function createFailureRecoveryMetricKey(
  threadId: string,
  actionId: string,
  recovered: boolean
): string {
  return `${threadId}:${actionId}:${recovered ? "recovered" : "unrecovered"}`;
}
