// 本文件说明: 根据失败动作和命令输出生成后续修复提示
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { CommandRunResult, TaskThread, TaskThreadEvent } from "@/state/taskThreads";

// 把失败动作整理成用户可读的修复请求
export function createFailureFixTaskPrompt(
  thread: TaskThread,
  action: AgentAction,
  commandResult: CommandRunResult | null = null
): string {
  const failureDetails = [
    `Failed action: ${action.label}`,
    `Action kind: ${action.kind}`,
    action.command ? `Failed command: ${action.command}` : null,
    action.target ? `Target: ${action.target}` : null,
    commandResult ? formatCommandResult(commandResult) : null
  ].filter((line): line is string => Boolean(line));

  return [
    `Original task: ${thread.prompt}`,
    "",
    ...failureDetails,
    "",
    "Generate a recovery execution plan for this failure.",
    "First identify the likely cause using the command output when present, then inspect the smallest useful files, propose focused edits, and finish with verification commands.",
    "Keep the plan safe: do not skip tests, do not hide the failure, and stop before any manual review or commit step."
  ].join("\n");
}

// 根据动作目标在命令结果里找到最相关的失败记录
export function findLatestCommandResultForAction(
  events: TaskThreadEvent[],
  action: AgentAction
): CommandRunResult | null {
  if (!action.command) {
    return null;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const result = events[index]?.commandResult;

    if (result?.command === action.command) {
      return result;
    }
  }

  return null;
}

// 把命令, cwd 和退出码整理成修复提示上下文
function formatCommandResult(result: CommandRunResult): string {
  return [
    `Command result: exitCode=${result.exitCode}, timedOut=${result.timedOut}`,
    `Command cwd: ${result.cwd}`,
    result.stdout.trim() ? `stdout:\n${formatCommandOutput(result.stdout)}` : null,
    result.stderr.trim() ? `stderr:\n${formatCommandOutput(result.stderr)}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

// 优先使用 stderr, 没有错误输出时回退 stdout
function formatCommandOutput(value: string): string {
  const trimmed = value.trim();
  const maxLength = 1600;

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}\n... output truncated`;
}
