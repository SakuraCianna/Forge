import type { CommandRunResult, TaskThreadEvent } from "@/state/taskThreads";

export type CommandResult = CommandRunResult;

type CreateCommandStartedEventOptions = {
  threadId: string;
  command: string;
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
  now = () => new Date().toISOString()
}: CreateCommandStartedEventOptions): TaskThreadEvent {
  const createdAt = now();

  return {
    id: `${threadId}-command-started-${createdAt}`,
    kind: "command",
    message: `开始执行命令: ${command}`,
    commandRun: {
      command,
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
    `命令执行完成, exitCode=${result.exitCode}`,
    result.timedOut ? "命令超时并已终止" : "",
    result.stdout.trim() ? `stdout:\n${truncateLog(result.stdout.trim())}` : "",
    result.stderr.trim() ? `stderr:\n${truncateLog(result.stderr.trim())}` : ""
  ].filter(Boolean);

  return {
    id: `${threadId}-command-finished-${createdAt}`,
    kind: result.exitCode === 0 && !result.timedOut ? "result" : "error",
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
