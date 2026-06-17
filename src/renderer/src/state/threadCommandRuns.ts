// 本文件说明: 选择任务线程中仍需取消的活跃命令运行
import type { TaskThread } from "./taskThreads.js";

export function getRunningThreadCommandRunIds(thread: TaskThread | null): string[] {
  if (!thread) {
    return [];
  }

  const finishedRunKeys = new Set(
    thread.events
      .flatMap((event) => (event.commandResult ? [event.commandResult] : []))
      .map((result) => getThreadCommandRunKey(result.command, result.runId))
  );
  const runningRunIds: string[] = [];

  for (const event of thread.events) {
    const commandRun = event.commandRun;

    if (!commandRun?.runId) {
      continue;
    }

    const runKey = getThreadCommandRunKey(commandRun.command, commandRun.runId);

    if (!finishedRunKeys.has(runKey)) {
      runningRunIds.push(commandRun.runId);
    }
  }

  return [...new Set(runningRunIds)];
}

function getThreadCommandRunKey(command: string, runId?: string): string {
  return runId ? `run:${runId}` : `command:${command}`;
}
