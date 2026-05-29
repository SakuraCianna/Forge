import type { AgentAction } from "@shared/agentExecutionPlan";
import type { CommandRunResult, TaskThread, TaskThreadEvent } from "@/state/taskThreads";

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

function formatCommandOutput(value: string): string {
  const trimmed = value.trim();
  const maxLength = 1600;

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}\n... output truncated`;
}
