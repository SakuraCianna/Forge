// 本文件说明: 渲染 Agent 命令事件转换
import type { CommandRunResult, TaskThreadEvent } from "@/state/taskThreads";

export type CommandResult = CommandRunResult;

type CreateCommandStartedEventOptions = {
  threadId: string;
  command: string;
  runId?: string;
  now?: () => string;
};

type CreateCommandFinishedEventOptions = {
  threadId: string;
  result: CommandResult;
  now?: () => string;
};

const maxLogLength = 1600;

export function createCommandStartedEvent({
  threadId,
  command,
  runId,
  now = () => new Date().toISOString()
}: CreateCommandStartedEventOptions): TaskThreadEvent {
  const createdAt = now();

  return {
    id: `${threadId}-command-started-${createdAt}`,
    kind: "command",
    message: `开始执行命令: ${command}`,
    commandRun: {
      command,
      runId,
      status: "running"
    },
    createdAt
  };
}

export function createCommandFinishedEvent({
  threadId,
  result,
  now = () => new Date().toISOString()
}: CreateCommandFinishedEventOptions): TaskThreadEvent {
  const createdAt = now();
  const sections = [
    result.cancelled ? "命令已取消" : "",
    `命令执行完成, exitCode=${result.exitCode}`,
    result.timedOut ? "命令超时并已终止" : "",
    result.stdout.trim() ? `stdout:\n${truncateLog(result.stdout.trim())}` : "",
    result.stderr.trim() ? `stderr:\n${truncateLog(result.stderr.trim())}` : ""
  ].filter(Boolean);

  return {
    id: `${threadId}-command-finished-${createdAt}`,
    kind: result.exitCode === 0 && !result.timedOut && !result.cancelled ? "result" : "error",
    message: sections.join("\n"),
    commandResult: result,
    createdAt
  };
}

function truncateLog(value: string): string {
  if (value.length <= maxLogLength) {
    return value;
  }

  return `${value.slice(0, maxLogLength)}\n... output truncated`;
}
