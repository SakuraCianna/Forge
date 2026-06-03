// 本文件说明: 汇总 Agent 结束时的文件读写统计、耗时和用户可读结果
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type { AutoFailureRecoverySkipRecord, TaskThread, TaskThreadEvent } from "@/state/taskThreads";

export type AgentFileChangeStats = {
  readFiles: string[];
  createdFiles: string[];
  editedFiles: string[];
  deletedFiles: string[];
};

export type AgentRecoverySummaryStats = {
  autoAttempts: number;
  manualAttempts: number;
  paused: AutoFailureRecoverySkipRecord[];
};

type AgentFileStatKind = "created" | "edited" | "deleted" | "read";

export function createAgentCompletionSummaryMessage(
  thread: TaskThread,
  language: Language,
  completedAt: string
): string {
  const actions = thread.agentActions ?? [];
  const completed = actions.filter((action) => action.status === "completed").length;
  const skipped = actions.filter((action) => action.status === "skipped").length;
  const stats = collectAgentFileChangeStats(thread, actions);
  const recoveryStats = collectAgentRecoverySummaryStats(thread);
  const timing = collectAgentCompletionTimingStats(thread, completedAt);
  const primaryFileStatKind = getPrimaryAgentFileStatKind(stats);
  const fileParts = formatAgentFileChangeSummaryParts(stats, language, primaryFileStatKind);
  const recoveryPart = formatAgentRecoverySummaryPart(recoveryStats, language);
  const summaryParts = recoveryPart ? [...fileParts, recoveryPart] : fileParts;
  const skippedPart =
    skipped > 0
      ? language === "zh-CN"
        ? `，跳过 ${skipped} 个步骤`
        : `, skipped ${skipped}`
      : "";
  const detailPart =
    language === "zh-CN"
      ? `思考 ${formatAgentSummaryDuration(timing.thinkingMs, language)}，等待 ${formatAgentSummaryDuration(
          timing.waitingMs,
          language
        )}，总用时 ${formatAgentSummaryDuration(timing.totalMs, language)}`
      : `thought ${formatAgentSummaryDuration(timing.thinkingMs, language)}, waited ${formatAgentSummaryDuration(
          timing.waitingMs,
          language
        )}, total ${formatAgentSummaryDuration(timing.totalMs, language)}`;
  const concreteResult = formatAgentConcreteResult(stats, completed, language);

  if (language === "zh-CN") {
    const summaryText = summaryParts.length > 0 ? `，${summaryParts.join("，")}` : "";

    return `${concreteResult}${summaryText}${skippedPart}，${detailPart}。查看详情可展开“已处理”。`;
  }

  const summaryText = summaryParts.length > 0 ? `, ${summaryParts.join(", ")}` : "";

  return `${concreteResult}${summaryText}${skippedPart}, ${detailPart}. View details in Processed.`;
}

export function collectAgentFileChangeStats(
  thread: TaskThread,
  actions: AgentAction[]
): AgentFileChangeStats {
  const readFiles = collectAgentActionTargets(actions, "inspect-file");
  const changeByPath = new Map<string, "create" | "edit" | "delete">();

  for (const action of actions) {
    if (action.kind === "edit-file" && action.status === "completed" && action.target) {
      changeByPath.set(action.target, "edit");
    }
  }

  for (const event of thread.events) {
    if (!event.fileChange?.relativePath) {
      continue;
    }

    changeByPath.set(event.fileChange.relativePath, event.fileChange.changeKind);
  }

  const createdFiles: string[] = [];
  const editedFiles: string[] = [];
  const deletedFiles: string[] = [];

  for (const [relativePath, changeKind] of changeByPath) {
    if (changeKind === "create") {
      createdFiles.push(relativePath);
    } else if (changeKind === "delete") {
      deletedFiles.push(relativePath);
    } else {
      editedFiles.push(relativePath);
    }
  }

  return {
    readFiles,
    createdFiles,
    editedFiles,
    deletedFiles
  };
}

export function collectAgentRecoverySummaryStats(thread: TaskThread): AgentRecoverySummaryStats {
  const actionLabelsById = new Map(
    (thread.agentActions ?? []).map((action) => [action.id, action.label])
  );
  const countedAttempts = new Set<string>();
  const pausedByActionAndReason = new Map<string, AutoFailureRecoverySkipRecord>();
  let autoAttempts = 0;
  let manualAttempts = 0;

  for (const event of thread.events) {
    const attempt = event.failureRecoveryAttempt;

    if (attempt) {
      const attemptKey = [
        attempt.source,
        attempt.actionId,
        attempt.attempt ?? event.id,
        attempt.limit ?? ""
      ].join(":");

      if (!countedAttempts.has(attemptKey)) {
        countedAttempts.add(attemptKey);

        if (attempt.source === "auto") {
          autoAttempts += 1;
        } else {
          manualAttempts += 1;
        }
      }
    }

    const paused = event.autoFailureRecoverySkip ?? parseAutoFailureRecoverySkipEvent(event, actionLabelsById);

    if (paused) {
      pausedByActionAndReason.set(`${paused.actionId}:${paused.reason}`, paused);
    }
  }

  return {
    autoAttempts,
    manualAttempts,
    paused: [...pausedByActionAndReason.values()]
  };
}

export function getAgentCompletionWorkStartedAt(thread: TaskThread): string {
  for (const event of thread.events) {
    if ((event.kind === "plan" || event.kind === "result") && Number.isFinite(Date.parse(event.createdAt))) {
      return event.createdAt;
    }
  }

  return thread.createdAt;
}

function collectAgentActionTargets(actions: AgentAction[], kind: AgentAction["kind"]): string[] {
  return mergeUniqueStrings(
    actions
      .filter((action) => action.kind === kind && action.status === "completed")
      .map((action) => action.target ?? action.command ?? "")
      .filter(Boolean)
  );
}

function formatAgentFileChangeSummaryParts(
  stats: AgentFileChangeStats,
  language: Language,
  omitKind: AgentFileStatKind | null
): string[] {
  if (language === "zh-CN") {
    return [
      stats.createdFiles.length > 0 && omitKind !== "created"
        ? `创建了 ${stats.createdFiles.length} 个文件`
        : null,
      stats.editedFiles.length > 0 && omitKind !== "edited"
        ? `编辑了 ${stats.editedFiles.length} 个文件`
        : null,
      stats.deletedFiles.length > 0 && omitKind !== "deleted"
        ? `删除了 ${stats.deletedFiles.length} 个文件`
        : null,
      stats.readFiles.length > 0 && omitKind !== "read"
        ? `读取了 ${stats.readFiles.length} 个文件`
        : null
    ].filter((part): part is string => Boolean(part));
  }

  return [
    stats.createdFiles.length > 0 && omitKind !== "created"
      ? `created ${stats.createdFiles.length} file${stats.createdFiles.length === 1 ? "" : "s"}`
      : null,
    stats.editedFiles.length > 0 && omitKind !== "edited"
      ? `edited ${stats.editedFiles.length} file${stats.editedFiles.length === 1 ? "" : "s"}`
      : null,
    stats.deletedFiles.length > 0 && omitKind !== "deleted"
      ? `deleted ${stats.deletedFiles.length} file${stats.deletedFiles.length === 1 ? "" : "s"}`
      : null,
    stats.readFiles.length > 0 && omitKind !== "read"
      ? `read ${stats.readFiles.length} file${stats.readFiles.length === 1 ? "" : "s"}`
      : null
  ].filter((part): part is string => Boolean(part));
}

function getPrimaryAgentFileStatKind(stats: AgentFileChangeStats): AgentFileStatKind | null {
  if (stats.createdFiles.length > 0) {
    return "created";
  }

  if (stats.editedFiles.length > 0) {
    return "edited";
  }

  if (stats.deletedFiles.length > 0) {
    return "deleted";
  }

  if (stats.readFiles.length > 0) {
    return "read";
  }

  return null;
}

function parseAutoFailureRecoverySkipEvent(
  event: TaskThreadEvent,
  actionLabelsById: ReadonlyMap<string, string>
): AutoFailureRecoverySkipRecord | null {
  const match = event.id.match(
    /^.+-agent-action-recovery-skip-(.+)-(requires-permission|requires-dependency|user-cancelled)$/u
  );

  if (!match) {
    return null;
  }

  const [, actionId, reason] = match;

  return {
    actionId,
    label: actionLabelsById.get(actionId) ?? actionId,
    reason: reason as AutoFailureRecoverySkipRecord["reason"],
    detail: event.message.trim()
  };
}

function formatAgentRecoverySummaryPart(
  stats: AgentRecoverySummaryStats,
  language: Language
): string | null {
  const parts: string[] = [];

  if (stats.autoAttempts > 0) {
    parts.push(
      language === "zh-CN"
        ? `自动恢复 ${stats.autoAttempts} 次`
        : `auto recovery ${stats.autoAttempts} ${stats.autoAttempts === 1 ? "time" : "times"}`
    );
  }

  if (stats.manualAttempts > 0) {
    parts.push(
      language === "zh-CN"
        ? `人工恢复 ${stats.manualAttempts} 次`
        : `manual recovery ${stats.manualAttempts} ${stats.manualAttempts === 1 ? "time" : "times"}`
    );
  }

  if (stats.paused.length > 0) {
    const reasons = formatRecoveryPauseReasonList(stats.paused, language);

    parts.push(
      language === "zh-CN"
        ? `恢复暂停 ${stats.paused.length} 次${reasons ? `（${reasons}）` : ""}`
        : `recovery paused ${stats.paused.length} ${
            stats.paused.length === 1 ? "time" : "times"
          }${reasons ? ` (${reasons})` : ""}`
    );
  }

  return parts.length > 0 ? parts.join(language === "zh-CN" ? "，" : ", ") : null;
}

function formatRecoveryPauseReasonList(
  paused: AutoFailureRecoverySkipRecord[],
  language: Language
): string {
  const labels = mergeUniqueStrings(
    paused.map((item) => formatRecoveryPauseReason(item.reason, language))
  );

  if (labels.length <= 2) {
    return labels.join(language === "zh-CN" ? "、" : ", ");
  }

  if (language === "zh-CN") {
    return `${labels.slice(0, 2).join("、")} 等 ${labels.length} 类原因`;
  }

  return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`;
}

function formatRecoveryPauseReason(
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

function collectAgentCompletionTimingStats(
  thread: TaskThread,
  completedAt: string
): { thinkingMs: number; waitingMs: number; totalMs: number } {
  const thinkingMs = thread.events.reduce((total, event) => {
    if ((event.kind !== "plan" && event.kind !== "result") || !event.completedAt) {
      return total;
    }

    return total + durationBetweenIso(event.createdAt, event.completedAt);
  }, 0);
  const waitingMs = thread.events.reduce((total, event) => {
    if (event.agentActionRun?.status !== "waiting") {
      return total;
    }

    return total + (event.agentActionRun.durationMs ?? 0);
  }, 0);
  const totalMs = durationBetweenIso(getAgentCompletionWorkStartedAt(thread), completedAt);

  return { thinkingMs, waitingMs, totalMs };
}

function formatAgentConcreteResult(
  stats: AgentFileChangeStats,
  completed: number,
  language: Language
): string {
  const changedFiles = [
    ...stats.createdFiles,
    ...stats.editedFiles,
    ...stats.deletedFiles
  ];

  if (language === "zh-CN") {
    if (stats.createdFiles.length > 0) {
      return `本次已完成，创建了 ${formatCompactFileList(stats.createdFiles, language)}`;
    }

    if (stats.editedFiles.length > 0) {
      return `本次已完成，更新了 ${formatCompactFileList(stats.editedFiles, language)}`;
    }

    if (stats.deletedFiles.length > 0) {
      return `本次已完成，删除了 ${formatCompactFileList(stats.deletedFiles, language)}`;
    }

    if (stats.readFiles.length > 0) {
      return `本次已完成，查看了 ${formatCompactFileList(stats.readFiles, language)}`;
    }

    return `本次已完成 ${completed} 个步骤`;
  }

  if (stats.createdFiles.length > 0) {
    return `Completed, created ${formatCompactFileList(stats.createdFiles, language)}`;
  }

  if (stats.editedFiles.length > 0) {
    return `Completed, updated ${formatCompactFileList(stats.editedFiles, language)}`;
  }

  if (stats.deletedFiles.length > 0) {
    return `Completed, deleted ${formatCompactFileList(stats.deletedFiles, language)}`;
  }

  if (stats.readFiles.length > 0) {
    return `Completed, inspected ${formatCompactFileList(stats.readFiles, language)}`;
  }

  if (changedFiles.length > 0) {
    return `Completed file changes for ${formatCompactFileList(changedFiles, language)}`;
  }

  return `Completed ${completed} step${completed === 1 ? "" : "s"}`;
}

function formatCompactFileList(files: string[], language: Language): string {
  if (files.length <= 3) {
    return files.join(language === "zh-CN" ? "、" : ", ");
  }

  if (language === "zh-CN") {
    return `${files.slice(0, 3).join("、")} 等 ${files.length} 个文件`;
  }

  return `${files.slice(0, 3).join(", ")} and ${files.length - 3} more`;
}

function durationBetweenIso(start: string, end: string): number {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return 0;
  }

  return endTime - startTime;
}

function formatAgentSummaryDuration(durationMs: number, language: Language): string {
  if (durationMs < 1000) {
    return language === "zh-CN" ? "0 秒" : "0s";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (language === "zh-CN") {
    return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
  }

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
