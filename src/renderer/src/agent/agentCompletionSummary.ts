// 本文件说明: 汇总 Agent 结束时的文件读写统计、耗时和用户可读结果
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type { TaskThread } from "@/state/taskThreads";

export type AgentFileChangeStats = {
  readFiles: string[];
  createdFiles: string[];
  editedFiles: string[];
  deletedFiles: string[];
};

export function createAgentCompletionSummaryMessage(
  thread: TaskThread,
  language: Language,
  completedAt: string
): string {
  const actions = thread.agentActions ?? [];
  const completed = actions.filter((action) => action.status === "completed").length;
  const skipped = actions.filter((action) => action.status === "skipped").length;
  const stats = collectAgentFileChangeStats(thread, actions);
  const timing = collectAgentCompletionTimingStats(thread, completedAt);
  const fileParts = formatAgentFileChangeSummaryParts(stats, language);
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
    return `${concreteResult}：${fileParts.join("，")}${skippedPart}，${detailPart}。查看详情可展开“已处理”。`;
  }

  return `${concreteResult}: ${fileParts.join(", ")}${skippedPart}, ${detailPart}. View details in Processed.`;
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

function formatAgentFileChangeSummaryParts(stats: AgentFileChangeStats, language: Language): string[] {
  if (language === "zh-CN") {
    return [
      `创建了 ${stats.createdFiles.length} 个文件`,
      `编辑了 ${stats.editedFiles.length} 个文件`,
      `删除了 ${stats.deletedFiles.length} 个文件`,
      `读取了 ${stats.readFiles.length} 个文件`
    ];
  }

  return [
    `created ${stats.createdFiles.length} file${stats.createdFiles.length === 1 ? "" : "s"}`,
    `edited ${stats.editedFiles.length} file${stats.editedFiles.length === 1 ? "" : "s"}`,
    `deleted ${stats.deletedFiles.length} file${stats.deletedFiles.length === 1 ? "" : "s"}`,
    `read ${stats.readFiles.length} file${stats.readFiles.length === 1 ? "" : "s"}`
  ];
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
