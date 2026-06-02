// Builds thread updates for Agent action lifecycle events.
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { Language } from "@shared/modelTypes";
import type { AgentActionRunOutcome } from "@/agent/agentActionExecutor";
import {
  createAgentCompletionSummaryMessage,
  getAgentCompletionWorkStartedAt
} from "@/agent/agentCompletionSummary";
import { formatAgentActionRunMessage } from "@/agent/agentRunMessages";
import {
  appendSourceUrlsToAgentSummary,
  extractSourceUrlsFromThreadEvents
} from "@/agent/agentSources";
import {
  createFailureRecoverySuggestionEventId,
  formatFailureRecoverySuggestion,
  getFailureRecoverySuggestionEventPrefix,
  shouldSuggestFailureRecovery
} from "@/agent/failureRecoveryPolicy";
import {
  appendThreadEvents,
  updateThreadAgentActionStatus,
  type AgentActionRunRecord,
  type TaskThread,
  type TaskThreadEvent
} from "@/state/taskThreads";

type AgentActionRunRecordInput = Omit<AgentActionRunRecord, "actionId" | "label">;

export function appendAgentActionRunRecord(
  threads: TaskThread[],
  {
    threadId,
    action,
    record,
    language,
    fallbackCreatedAt
  }: {
    threadId: string;
    action: AgentAction;
    record: AgentActionRunRecordInput;
    language: Language;
    fallbackCreatedAt?: string;
  }
): TaskThread[] {
  const createdAt = record.completedAt ?? record.startedAt ?? fallbackCreatedAt ?? new Date().toISOString();

  return appendThreadEvents(threads, threadId, [
    createAgentActionRunEvent({
      threadId,
      action,
      record,
      language,
      createdAt
    })
  ]);
}

export function createAgentActionRunEvent({
  threadId,
  action,
  record,
  language,
  createdAt
}: {
  threadId: string;
  action: AgentAction;
  record: AgentActionRunRecordInput;
  language: Language;
  createdAt: string;
}): TaskThreadEvent {
  return {
    id: `${threadId}-agent-action-run-${record.status}-${action.id}-${createdAt}`,
    kind: record.status === "failed" ? "error" : "plan",
    message: formatAgentActionRunMessage(language, action, record),
    createdAt,
    agentActionRun: {
      actionId: action.id,
      label: action.label,
      ...record
    }
  };
}

export function appendFailureRecoverySuggestion(
  threads: TaskThread[],
  {
    threadId,
    action,
    status,
    agentProfile,
    language,
    createdAt
  }: {
    threadId: string;
    action: AgentAction;
    status: AgentAction["status"];
    agentProfile: Pick<AgentProfileContext, "failureRecoveryPolicy">;
    language: Language;
    createdAt: string;
  }
): TaskThread[] {
  if (!shouldSuggestFailureRecovery(agentProfile, status)) {
    return threads;
  }

  const eventPrefix = getFailureRecoverySuggestionEventPrefix(threadId, action.id);
  const event: TaskThreadEvent = {
    id: createFailureRecoverySuggestionEventId(threadId, action.id, createdAt),
    kind: "plan",
    message: formatFailureRecoverySuggestion(language, action),
    createdAt
  };

  return threads.map((thread) => {
    if (
      thread.id !== threadId ||
      thread.events.some((threadEvent) => threadEvent.id.startsWith(eventPrefix))
    ) {
      return thread;
    }

    return {
      ...thread,
      events: [...thread.events, event]
    };
  });
}

export function appendAgentActionOutcomeRecord(
  threads: TaskThread[],
  {
    threadId,
    action,
    outcome,
    startedAt,
    agentProfile,
    language,
    completedAt = new Date().toISOString()
  }: {
    threadId: string;
    action: AgentAction;
    outcome: AgentActionRunOutcome;
    startedAt: string;
    agentProfile: Pick<AgentProfileContext, "failureRecoveryPolicy">;
    language: Language;
    completedAt?: string;
  }
): TaskThread[] {
  const status = typeof outcome === "string" ? outcome : outcome.status;
  const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
  const runStatus: AgentActionRunRecord["status"] =
    status === "completed" ? "completed" : status === "failed" ? "failed" : "waiting";
  const withRunRecord = appendAgentActionRunRecord(threads, {
    threadId,
    action,
    record: {
      status: runStatus,
      startedAt,
      completedAt,
      durationMs
    },
    language
  });

  return appendFailureRecoverySuggestion(withRunRecord, {
    threadId,
    action,
    status,
    agentProfile,
    language,
    createdAt: completedAt
  });
}

export function applyAgentActionDecisionStatus(
  threads: TaskThread[],
  {
    threadId,
    action,
    status,
    language,
    createdAt = new Date().toISOString()
  }: {
    threadId: string;
    action: AgentAction;
    status: Extract<AgentAction["status"], "completed" | "skipped">;
    language: Language;
    createdAt?: string;
  }
): TaskThread[] {
  const skipped = status === "skipped";

  return updateThreadAgentActionStatus(
    appendThreadEvents(threads, threadId, [
      {
        id: `${threadId}-agent-action-${status}-${action.id}-${createdAt}`,
        kind: "plan",
        message: formatAgentActionDecisionMessage(language, action.label, skipped),
        createdAt,
        agentActionRun: {
          actionId: action.id,
          label: action.label,
          status: skipped ? "skipped" : "confirmed",
          completedAt: createdAt
        }
      }
    ]),
    threadId,
    action.id,
    status
  );
}

export function appendAgentCompletionSummaryIfDone(
  threads: TaskThread[],
  {
    threadId,
    language,
    createdAt = new Date().toISOString()
  }: {
    threadId: string;
    language: Language;
    createdAt?: string;
  }
): TaskThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }

    const actions = thread.agentActions ?? [];

    if (
      actions.length === 0 ||
      thread.events.some((event) => event.id.startsWith(`${threadId}-agent-summary-`)) ||
      actions.some((action) => action.status !== "completed" && action.status !== "skipped")
    ) {
      return thread;
    }

    const baseMessage = createAgentCompletionSummaryMessage(thread, language, createdAt);
    const message = appendSourceUrlsToAgentSummary(
      baseMessage,
      extractSourceUrlsFromThreadEvents(thread.events),
      language
    );
    const workStartedAt = getAgentCompletionWorkStartedAt(thread);

    return {
      ...thread,
      status: "completed",
      events: [
        ...thread.events,
        {
          id: `${threadId}-agent-summary-${createdAt}`,
          kind: "result" as const,
          message,
          createdAt: workStartedAt,
          completedAt: createdAt
        }
      ]
    };
  });
}

function formatAgentActionDecisionMessage(
  language: Language,
  label: string,
  skipped: boolean
): string {
  if (language === "zh-CN") {
    return skipped ? `已跳过 Agent 动作: ${label}` : `已确认 Agent 动作: ${label}`;
  }

  return skipped ? `Skipped agent action: ${label}` : `Confirmed agent action: ${label}`;
}
