// Builds thread updates for Agent action lifecycle events.
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { Language } from "@shared/modelTypes";
import type { AgentActionRunOutcome, AgentToolPermission } from "@/agent/agentActionExecutor";
import type { AgentRuntimePostActionStep } from "@/agent/agentRuntimeOrchestrator";
import {
  collectAgentFileChangeStats,
  createAgentCompletionSummaryMessage,
  getAgentCompletionWorkStartedAt,
  type AgentFileChangeStats
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
  type AutoFailureRecoverySkipRecord,
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

export function appendAgentManualGateWaitEvent(
  threads: TaskThread[],
  {
    threadId,
    action,
    language,
    createdAt = new Date().toISOString()
  }: {
    threadId: string;
    action: AgentAction;
    language: Language;
    createdAt?: string;
  }
): TaskThread[] {
  return appendThreadEvents(
    threads,
    threadId,
    [
      {
        id: `${threadId}-manual-gate-${action.id}-${createdAt}`,
        kind: "plan",
        message:
          language === "zh-CN"
            ? `等待人工审查: ${action.label}`
            : `Waiting for manual review: ${action.label}`,
        createdAt
      }
    ],
    "blocked"
  );
}

export function appendAgentPermissionDeniedEvent(
  threads: TaskThread[],
  {
    threadId,
    action,
    message,
    createdAt = new Date().toISOString()
  }: {
    threadId: string;
    action: AgentAction;
    message: string;
    createdAt?: string;
  }
): TaskThread[] {
  return appendThreadEvents(
    threads,
    threadId,
    [
      {
        id: `${threadId}-permission-denied-${action.id}-${createdAt}`,
        kind: "error",
        message,
        createdAt
      }
    ],
    "blocked"
  );
}

export function formatAgentPermissionDeniedNotice(
  language: Language,
  profileName: string,
  tool: AgentToolPermission
): string {
  if (language === "zh-CN") {
    const toolLabel = {
      read: "读取文件",
      edit: "编辑文件",
      command: "运行命令",
      git: "Git 操作",
      extension: "外部扩展",
      web: "网页搜索"
    }[tool];

    return `智能体配置 ${profileName} 未允许${toolLabel}`;
  }

  return `Agent profile ${profileName} does not allow ${tool} actions`;
}

export function formatAgentManualGateRequiredNotice(language: Language): string {
  return language === "zh-CN"
    ? "需要先完成审查门禁, Forge 不会自动越过人工确认"
    : "Manual review is required before Forge can continue.";
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

export function appendAgentBlockedSummaryIfNeeded(
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

    const paused = findLatestAutoFailureRecoveryPause(thread);

    if (!paused) {
      return thread;
    }

    const summaryPrefix = `${threadId}-agent-blocked-summary-${paused.actionId}-${paused.reason}-`;

    if (thread.events.some((event) => event.id.startsWith(summaryPrefix))) {
      return thread;
    }

    const baseMessage = createAgentBlockedSummaryMessage(thread, paused, language);
    const message = appendSourceUrlsToAgentSummary(
      baseMessage,
      extractSourceUrlsFromThreadEvents(thread.events),
      language
    );
    const workStartedAt = getAgentCompletionWorkStartedAt(thread);

    return {
      ...thread,
      status: "blocked",
      events: [
        ...thread.events,
        {
          id: `${summaryPrefix}${createdAt}`,
          kind: "result" as const,
          message,
          createdAt: workStartedAt,
          completedAt: createdAt
        }
      ]
    };
  });
}

export function applyAgentRuntimePostActionStep(
  threads: TaskThread[],
  {
    threadId,
    language,
    step
  }: {
    threadId: string;
    language: Language;
    step: AgentRuntimePostActionStep;
  }
): TaskThread[] {
  if (step.kind !== "append-completion-summary") {
    return threads;
  }

  return appendAgentCompletionSummaryIfDone(threads, {
    threadId,
    language
  });
}

function createAgentBlockedSummaryMessage(
  thread: TaskThread,
  paused: AutoFailureRecoverySkipRecord,
  language: Language
): string {
  const actions = thread.agentActions ?? [];
  const completed = actions.filter((action) => action.status === "completed").length;
  const skipped = actions.filter((action) => action.status === "skipped").length;
  const pending = actions.filter(
    (action) =>
      action.status !== "completed" &&
      action.status !== "skipped" &&
      action.id !== paused.actionId
  ).length;
  const stats = collectAgentFileChangeStats(thread, actions);
  const fileProgress = formatBlockedFileProgress(stats, language);
  const reason = formatBlockedRecoveryPauseReason(paused.reason, language);
  const detail = compactBlockedSummaryDetail(paused.detail);
  const nextStep = formatBlockedSummaryNextStep(paused.reason, language);

  if (language === "zh-CN") {
    const skippedText = skipped > 0 ? `，跳过 ${skipped} 个步骤` : "";
    const pendingText = pending > 0 ? `，还有 ${pending} 个步骤未继续` : "";
    const fileText = fileProgress ? `，${fileProgress}` : "";

    return [
      `这次执行已暂停在「${paused.label}」。已完成 ${completed} 个步骤${skippedText}${pendingText}${fileText}。`,
      `暂停原因是${reason}: ${detail}`,
      nextStep
    ].join("\n");
  }

  const skippedText = skipped > 0 ? `, skipped ${skipped}` : "";
  const pendingText = pending > 0 ? `, ${pending} step${pending === 1 ? "" : "s"} not continued` : "";
  const fileText = fileProgress ? `, ${fileProgress}` : "";

  return [
    `This run paused at "${paused.label}". Completed ${completed} step${
      completed === 1 ? "" : "s"
    }${skippedText}${pendingText}${fileText}.`,
    `Pause reason: ${reason}: ${detail}`,
    nextStep
  ].join("\n");
}

function findLatestAutoFailureRecoveryPause(
  thread: TaskThread
): AutoFailureRecoverySkipRecord | null {
  for (let index = thread.events.length - 1; index >= 0; index -= 1) {
    const paused = thread.events[index].autoFailureRecoverySkip;

    if (paused) {
      return paused;
    }
  }

  return null;
}

function formatBlockedFileProgress(
  stats: AgentFileChangeStats,
  language: Language
): string | null {
  const parts =
    language === "zh-CN"
      ? [
          stats.createdFiles.length > 0 ? `创建 ${stats.createdFiles.length} 个文件` : null,
          stats.editedFiles.length > 0 ? `编辑 ${stats.editedFiles.length} 个文件` : null,
          stats.deletedFiles.length > 0 ? `删除 ${stats.deletedFiles.length} 个文件` : null,
          stats.readFiles.length > 0 ? `读取 ${stats.readFiles.length} 个文件` : null
        ]
      : [
          stats.createdFiles.length > 0
            ? `created ${stats.createdFiles.length} file${stats.createdFiles.length === 1 ? "" : "s"}`
            : null,
          stats.editedFiles.length > 0
            ? `edited ${stats.editedFiles.length} file${stats.editedFiles.length === 1 ? "" : "s"}`
            : null,
          stats.deletedFiles.length > 0
            ? `deleted ${stats.deletedFiles.length} file${stats.deletedFiles.length === 1 ? "" : "s"}`
            : null,
          stats.readFiles.length > 0
            ? `read ${stats.readFiles.length} file${stats.readFiles.length === 1 ? "" : "s"}`
            : null
        ];
  const visibleParts = parts.filter((part): part is string => Boolean(part));

  return visibleParts.length > 0 ? visibleParts.join(language === "zh-CN" ? "，" : ", ") : null;
}

function formatBlockedRecoveryPauseReason(
  reason: AutoFailureRecoverySkipRecord["reason"],
  language: Language
): string {
  if (language === "zh-CN") {
    return {
      "requires-permission": "需要权限确认",
      "requires-dependency": "需要依赖配置",
      "user-cancelled": "用户取消命令"
    }[reason];
  }

  return {
    "requires-permission": "permission required",
    "requires-dependency": "dependency setup required",
    "user-cancelled": "cancelled by user"
  }[reason];
}

function formatBlockedSummaryNextStep(
  reason: AutoFailureRecoverySkipRecord["reason"],
  language: Language
): string {
  if (language === "zh-CN") {
    if (reason === "requires-dependency") {
      return "请先安装或配置缺失依赖，然后继续该线程或重新运行失败步骤。";
    }

    if (reason === "requires-permission") {
      return "请先确认权限或调整 Agent 权限配置，然后继续该线程。";
    }

    return "如果仍需要执行这个步骤，请继续该线程并重新批准相关动作。";
  }

  if (reason === "requires-dependency") {
    return "Install or configure the missing dependency, then continue the thread or rerun the failed step.";
  }

  if (reason === "requires-permission") {
    return "Confirm the permission or adjust the Agent permission profile, then continue the thread.";
  }

  return "Continue the thread and approve the related action again if this step is still needed.";
}

function compactBlockedSummaryDetail(detail: string): string {
  const normalized = detail.replace(/\s+/gu, " ").trim();

  if (normalized.length <= 220) {
    return normalized || "No additional detail.";
  }

  return `${normalized.slice(0, 217)}...`;
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
