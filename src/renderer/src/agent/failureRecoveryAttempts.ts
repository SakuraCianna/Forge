// 本文件说明: 从线程事件里统计失败恢复尝试, 让自动恢复进度可持久化展示
import type { FailureRecoveryAttemptRecord } from "@/state/taskThreads";

export type FailureRecoveryAttemptEvent = {
  createdAt?: string;
  failureRecoveryAttempt?: Pick<
    FailureRecoveryAttemptRecord,
    "actionId" | "label" | "source" | "attempt" | "limit"
  >;
};

export type FailureRecoveryAttemptView = FailureRecoveryAttemptRecord & {
  createdAt: string | null;
};

export function getFailureRecoveryAttemptsForAction(
  events: FailureRecoveryAttemptEvent[],
  actionId: string
): FailureRecoveryAttemptView[] {
  return events.flatMap((event) => {
    if (event.failureRecoveryAttempt?.actionId !== actionId) {
      return [];
    }

    return [
      {
        ...event.failureRecoveryAttempt,
        createdAt: event.createdAt ?? null
      }
    ];
  });
}

export function countAutoFailureRecoveryAttempts(
  events: FailureRecoveryAttemptEvent[],
  actionId?: string
): number {
  return events.filter(
    (event) =>
      event.failureRecoveryAttempt?.source === "auto" &&
      (actionId === undefined || event.failureRecoveryAttempt.actionId === actionId)
  ).length;
}
