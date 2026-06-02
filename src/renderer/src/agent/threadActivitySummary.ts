// 本文件说明: 把线程运行状态心跳的纯逻辑从 ThreadWorkspace 拆出, 便于测试和复用
import type { Language } from "@shared/modelTypes";
import type {
  AutoFailureRecoverySkipRecord,
  CommandRunResult,
  FailureRecoveryAttemptRecord,
  TaskThreadEvent
} from "@/state/taskThreads";

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

type RecoveryActivity =
  | {
      kind: "attempt";
      attempt: FailureRecoveryAttemptRecord;
      createdAt: string;
    }
  | {
      kind: "paused";
      paused: AutoFailureRecoverySkipRecord;
      createdAt: string;
    };

type FailedCommandActivity = {
  result: CommandRunResult;
  createdAt: string;
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
          autoRecovery: "自动恢复",
          manualRecovery: "人工恢复",
          recoveryPaused: "恢复已暂停",
          timedOut: "已超时",
          exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`,
          recoveryAttempt: (attempt: FailureRecoveryAttemptRecord) =>
            attempt.attempt === undefined
              ? null
              : attempt.limit === undefined
                ? `第 ${attempt.attempt} 次`
                : `第 ${attempt.attempt} / ${attempt.limit} 次`,
          recoveryPauseReason: formatRecoveryPauseReasonZh
        }
      : {
          running: "Running command",
          actionRunning: "Working",
          failure: "Last failure",
          autoRecovery: "Auto recovery",
          manualRecovery: "Manual recovery",
          recoveryPaused: "Recovery paused",
          timedOut: "timed out",
          exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`,
          recoveryAttempt: (attempt: FailureRecoveryAttemptRecord) =>
            attempt.attempt === undefined
              ? null
              : attempt.limit === undefined
                ? `attempt ${attempt.attempt}`
                : `attempt ${attempt.attempt} / ${attempt.limit}`,
          recoveryPauseReason: formatRecoveryPauseReasonEn
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

  const recoveryActivity = findLatestRecoveryActivity(events);
  const failedResult = findLatestFailedCommandResult(events);
  const recoveryIsLatest =
    recoveryActivity &&
    (!failedResult ||
      Date.parse(recoveryActivity.createdAt) >= Date.parse(failedResult.createdAt));

  if (recoveryIsLatest && recoveryActivity.kind === "attempt") {
    const elapsed = formatRunningActivityElapsed(recoveryActivity.createdAt, nowMs, language);
    const attemptMeta = copy.recoveryAttempt(recoveryActivity.attempt);

    return {
      kind: "running",
      activityKind: "error",
      label:
        recoveryActivity.attempt.source === "auto"
          ? copy.autoRecovery
          : copy.manualRecovery,
      command: recoveryActivity.attempt.label,
      meta: joinMetaParts([attemptMeta, elapsed], language)
    };
  }

  if (recoveryIsLatest && recoveryActivity.kind === "paused") {
    return {
      kind: "failure",
      activityKind: "error",
      label: copy.recoveryPaused,
      command: recoveryActivity.paused.label,
      meta: copy.recoveryPauseReason(recoveryActivity.paused.reason)
    };
  }

  if (!failedResult) {
    return null;
  }

  return {
    kind: "failure",
    activityKind: "error",
    label: copy.failure,
    command: failedResult.result.command,
    meta: failedResult.result.timedOut ? copy.timedOut : copy.exit(failedResult.result.exitCode)
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

function findLatestRecoveryActivity(events: TaskThreadEvent[]): RecoveryActivity | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (!event) {
      continue;
    }

    const paused = event.autoFailureRecoverySkip ?? parseAutoFailureRecoverySkipEvent(event);

    if (paused) {
      return {
        kind: "paused",
        paused,
        createdAt: event.createdAt
      };
    }

    if (event.failureRecoveryAttempt) {
      return {
        kind: "attempt",
        attempt: event.failureRecoveryAttempt,
        createdAt: event.createdAt
      };
    }
  }

  return null;
}

function parseAutoFailureRecoverySkipEvent(
  event: TaskThreadEvent
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
    label: extractAutoFailureRecoverySkipLabel(event.message) ?? actionId,
    reason: reason as AutoFailureRecoverySkipRecord["reason"],
    detail: event.message.trim()
  };
}

function extractAutoFailureRecoverySkipLabel(message: string): string | null {
  const firstLine = message.trim().split(/\r?\n/u)[0]?.trim() ?? "";
  const match = firstLine.match(/^(?:自动恢复已暂停|Automatic recovery paused):\s*(.+)$/u);

  return match?.[1]?.trim() || null;
}

function joinMetaParts(parts: Array<string | null>, language: Language): string | null {
  const values = parts.filter((part): part is string => Boolean(part));

  if (values.length === 0) {
    return null;
  }

  return values.join(language === "zh-CN" ? " · " : " · ");
}

function formatRecoveryPauseReasonZh(reason: AutoFailureRecoverySkipRecord["reason"]): string {
  return {
    "requires-permission": "需要权限确认",
    "requires-dependency": "需要依赖配置",
    "user-cancelled": "用户取消命令"
  }[reason];
}

function formatRecoveryPauseReasonEn(reason: AutoFailureRecoverySkipRecord["reason"]): string {
  return {
    "requires-permission": "permission required",
    "requires-dependency": "dependency setup required",
    "user-cancelled": "cancelled by user"
  }[reason];
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

function findLatestFailedCommandResult(events: TaskThreadEvent[]): FailedCommandActivity | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const result = event?.commandResult;

    if (result && !result.cancelled && (result.timedOut || result.exitCode !== 0)) {
      return {
        result,
        createdAt: event.createdAt
      };
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
