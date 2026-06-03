// 本文件说明: 准备失败恢复计划所需的线程事件和模型提示词, 避免 App.tsx 内联恢复上下文拼装
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type {
  CommandRunResult,
  FailureRecoveryAttemptRecord,
  TaskThread,
  TaskThreadEvent
} from "@/state/taskThreads";
import { appendThreadEvents } from "@/state/taskThreads";
import {
  createFailureFixTaskPrompt,
  findLatestCommandResultForAction
} from "@/agent/failureFixPrompt";
import { formatFailureFixPlanStartMessage } from "@/agent/agentRunMessages";

export type FailureFixPlanOptions = Pick<
  FailureRecoveryAttemptRecord,
  "source" | "attempt" | "limit"
>;

export type PreparedFailureFixPlan = {
  taskPrompt: string;
  startEvent: TaskThreadEvent;
  recoveryAttempt: FailureRecoveryAttemptRecord;
};

export function prepareAgentFailureFixPlan({
  thread,
  action,
  language,
  commandResultOverride = null,
  options = { source: "manual" },
  createdAt = new Date().toISOString()
}: {
  thread: TaskThread;
  action: AgentAction;
  language: Language;
  commandResultOverride?: CommandRunResult | null;
  options?: FailureFixPlanOptions;
  createdAt?: string;
}): PreparedFailureFixPlan {
  const recoveryAttempt: FailureRecoveryAttemptRecord = {
    actionId: action.id,
    label: action.label,
    source: options.source,
    ...(options.attempt === undefined ? {} : { attempt: options.attempt }),
    ...(options.limit === undefined ? {} : { limit: options.limit })
  };
  const commandResult =
    commandResultOverride ?? findLatestCommandResultForAction(thread.events, action);
  const startEvent: TaskThreadEvent = {
    id: `${thread.id}-failure-fix-${action.id}-${createdAt}`,
    kind: "plan",
    message: formatFailureFixPlanStartMessage(language, action, recoveryAttempt),
    createdAt,
    failureRecoveryAttempt: recoveryAttempt
  };

  return {
    taskPrompt: createFailureFixTaskPrompt(thread, action, commandResult),
    startEvent,
    recoveryAttempt
  };
}

export function appendAgentFailureFixPlanStartEvent(
  threads: TaskThread[],
  {
    threadId,
    startEvent
  }: {
    threadId: string;
    startEvent: TaskThreadEvent;
  }
): TaskThread[] {
  return appendThreadEvents(threads, threadId, [startEvent], "running");
}
