import type { AgentAction } from "@shared/agentExecutionPlan";
import type { TaskThread } from "@/state/taskThreads";
import { countAutoFailureRecoveryAttempts } from "./failureRecoveryAttempts";

export type AutoFailureRecoveryCandidate = {
  thread: TaskThread;
  failedAction: AgentAction;
  key: string;
  attempt: number;
  limit: number;
};

export type SelectAutoFailureRecoveryCandidateInput = {
  threads: TaskThread[];
  currentProjectPath: string;
  cancelledThreadIds: ReadonlySet<string>;
  activeKeys: ReadonlySet<string>;
  attemptedKeys: ReadonlySet<string>;
  countsByThreadId: ReadonlyMap<string, number>;
  getThreadFailureRecoveryLimit: (threadId: string) => number;
};

export function selectAutoFailureRecoveryCandidate({
  threads,
  currentProjectPath,
  cancelledThreadIds,
  activeKeys,
  attemptedKeys,
  countsByThreadId,
  getThreadFailureRecoveryLimit
}: SelectAutoFailureRecoveryCandidateInput): AutoFailureRecoveryCandidate | null {
  for (const thread of threads) {
    if (!canThreadAutoRecover(thread, currentProjectPath, cancelledThreadIds)) {
      continue;
    }

    const failedAction = findFailedAgentQueueBlocker(thread.agentActions ?? []);

    if (!failedAction) {
      continue;
    }

    const key = createAutoFailureFixKey(thread.id, failedAction.id);
    const limit = Math.max(0, getThreadFailureRecoveryLimit(thread.id));
    const currentCount = Math.max(
      countsByThreadId.get(thread.id) ?? 0,
      countAutoFailureRecoveryAttempts(thread.events)
    );
    const actionAutoAttempted =
      countAutoFailureRecoveryAttempts(thread.events, failedAction.id) > 0;

    if (
      limit <= 0 ||
      currentCount >= limit ||
      activeKeys.has(key) ||
      attemptedKeys.has(key) ||
      actionAutoAttempted
    ) {
      continue;
    }

    return {
      thread,
      failedAction,
      key,
      attempt: currentCount + 1,
      limit
    };
  }

  return null;
}

export function findFailedAgentQueueBlocker(actions: AgentAction[]): AgentAction | null {
  for (const action of actions) {
    if (action.status === "completed" || action.status === "skipped") {
      continue;
    }

    return action.status === "failed" ? action : null;
  }

  return null;
}

export function createAutoFailureFixKey(threadId: string, actionId: string): string {
  return `${threadId}:${actionId}`;
}

function canThreadAutoRecover(
  thread: TaskThread,
  currentProjectPath: string,
  cancelledThreadIds: ReadonlySet<string>
): boolean {
  return (
    !thread.archived &&
    thread.projectPath === currentProjectPath &&
    thread.agentProfile?.failureRecoveryPolicy === "auto" &&
    !cancelledThreadIds.has(thread.id)
  );
}
