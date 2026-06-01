// 本文件说明: 把线程运行状态心跳的纯逻辑从 ThreadWorkspace 拆出, 便于测试和复用
import type { Language } from "@shared/modelTypes";
import type { CommandRunResult, TaskThreadEvent } from "@/state/taskThreads";

export type CompactProcessedGroupKind =
  | "web"
  | "command"
  | "edit"
  | "search"
  | "file"
  | "error"
  | "plan"
  | "other";

export type ThreadActivitySummary = {
  kind: "running" | "failure";
  activityKind: CompactProcessedGroupKind;
  label: string;
  command: string;
  meta: string | null;
};

type RunningActivity = {
  text: string;
  startedAt: string;
};

export function getThreadActivitySummary(
  events: TaskThreadEvent[],
  language: Language,
  nowMs: number
): ThreadActivitySummary | null {
  const copy =
    language === "zh-CN"
      ? {
          running: "运行中",
          actionRunning: "正在处理",
          failure: "最近失败",
          timedOut: "已超时",
          exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`
        }
      : {
          running: "Running command",
          actionRunning: "Working",
          failure: "Last failure",
          timedOut: "timed out",
          exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`
        };
  const runningCommand = findLatestUnfinishedCommandRun(events);

  if (runningCommand) {
    const elapsedStartedAt = getActivityElapsedStartedAt(events, runningCommand.startedAt);

    return {
      kind: "running",
      activityKind: "command",
      label: copy.running,
      command: runningCommand.text,
      meta: formatRunningActivityElapsed(elapsedStartedAt, nowMs, language)
    };
  }

  const runningAction = findLatestUnfinishedAgentActionRun(events);

  if (runningAction) {
    const elapsedStartedAt = getActivityElapsedStartedAt(events, runningAction.startedAt);

    return {
      kind: "running",
      activityKind: inferActivityKindFromText(runningAction.text),
      label: copy.actionRunning,
      command: runningAction.text,
      meta: formatRunningActivityElapsed(elapsedStartedAt, nowMs, language)
    };
  }

  const failedResult = findLatestFailedCommandResult(events);

  if (!failedResult) {
    return null;
  }

  return {
    kind: "failure",
    activityKind: "error",
    label: copy.failure,
    command: failedResult.command,
    meta: failedResult.timedOut ? copy.timedOut : copy.exit(failedResult.exitCode)
  };
}

export function inferActivityKindFromText(value: string): CompactProcessedGroupKind {
  if (
    /^(?:编辑|修改|写入|创建|edit\b|write\b|modify\b|create\b)/iu.test(value) ||
    isEditTranscript(value)
  ) {
    return "edit";
  }

  if (/^(?:读取|查看|列出|inspect\b|read\b|list\b)/iu.test(value) || isFileReadTranscript(value)) {
    return "file";
  }

  if (/^(?:搜索|匹配|search\b|find\b|grep\b|glob\b)/iu.test(value) || isProjectSearchTranscript(value)) {
    return "search";
  }

  if (/^(?:运行|run\b)/iu.test(value)) {
    return "command";
  }

  return "plan";
}

function findLatestUnfinishedCommandRun(events: TaskThreadEvent[]): RunningActivity | null {
  const finishedRuns = new Set<string>();

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event?.commandResult) {
      finishedRuns.add(getCommandRunKey(event.commandResult.command, event.commandResult.runId));
      continue;
    }

    if (
      event?.commandRun &&
      !finishedRuns.has(getCommandRunKey(event.commandRun.command, event.commandRun.runId))
    ) {
      return {
        text: event.commandRun.command,
        startedAt: event.createdAt
      };
    }
  }

  return null;
}

function findLatestUnfinishedAgentActionRun(events: TaskThreadEvent[]): RunningActivity | null {
  const settledActionIds = new Set<string>();

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const actionRun = event?.agentActionRun;

    if (!actionRun) {
      continue;
    }

    if (actionRun.status !== "started") {
      settledActionIds.add(actionRun.actionId);
      continue;
    }

    if (!settledActionIds.has(actionRun.actionId)) {
      return {
        text: actionRun.label,
        startedAt: actionRun.startedAt ?? event.createdAt
      };
    }
  }

  return null;
}

function getActivityElapsedStartedAt(events: TaskThreadEvent[], fallbackStartedAt: string): string {
  for (const event of events) {
    if ((event.kind === "plan" || event.kind === "result") && Number.isFinite(Date.parse(event.createdAt))) {
      return event.createdAt;
    }
  }

  return fallbackStartedAt;
}

function formatRunningActivityElapsed(
  startedAt: string,
  nowMs: number,
  language: Language
): string | null {
  const startedMs = Date.parse(startedAt);

  if (!Number.isFinite(startedMs)) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (language === "zh-CN") {
    return minutes > 0 ? `已用 ${minutes} 分 ${seconds} 秒` : `已用 ${seconds} 秒`;
  }

  return minutes > 0 ? `${minutes}m ${seconds}s elapsed` : `${seconds}s elapsed`;
}

function findLatestFailedCommandResult(events: TaskThreadEvent[]): CommandRunResult | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const result = events[index]?.commandResult;

    if (result && !result.cancelled && (result.timedOut || result.exitCode !== 0)) {
      return result;
    }
  }

  return null;
}

function getCommandRunKey(command: string, runId?: string): string {
  return runId ? `id:${runId}` : `cmd:${command}`;
}

function isEditTranscript(value: string): boolean {
  return /文件修改|文件写入|文件创建|生成文件|已应用文件|正在编辑|已编辑|Edit |Write |Create |generate file change|file change|patch|diff/iu.test(
    value
  );
}

function isProjectSearchTranscript(value: string): boolean {
  return /搜索项目|文本搜索|匹配文件|列出目录|search project|text search|glob|list directory/iu.test(
    value
  );
}

function isFileReadTranscript(value: string): boolean {
  return /读取|查看文件|文件内容|Read |Inspect |file content|opened file/iu.test(value);
}
