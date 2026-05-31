// 本文件说明: 根据失败动作和命令输出生成后续修复提示
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { CommandRunResult, TaskThread, TaskThreadEvent } from "@/state/taskThreads";

// 把失败动作整理成用户可读的修复请求
export function createFailureFixTaskPrompt(
  thread: TaskThread,
  action: AgentAction,
  commandResult: CommandRunResult | null = null
): string {
  const actionQueueContext = formatActionQueueContext(thread.agentActions ?? [], action.id);
  const controlledToolContext = formatControlledToolResultContext(thread.events);
  const recentExecutionContext = formatRecentExecutionContext(thread.events);
  const failureDetails = [
    `Failed action: ${action.label}`,
    `Action kind: ${action.kind}`,
    action.command ? `Failed command: ${action.command}` : null,
    action.target ? `Target: ${action.target}` : null,
    commandResult ? formatCommandResult(commandResult) : null
  ].filter((line): line is string => Boolean(line));

  return [
    `Original task: ${thread.prompt}`,
    `Current thread status: ${thread.status}`,
    "",
    ...failureDetails,
    actionQueueContext ? `Action queue:\n${actionQueueContext}` : null,
    controlledToolContext ? `Prior controlled tool results:\n${controlledToolContext}` : null,
    recentExecutionContext ? `Recent execution context:\n${recentExecutionContext}` : null,
    "",
    "Generate a recovery execution plan for this failure.",
    "First identify the likely cause using the command output when present, then inspect the smallest useful files, propose focused edits, and finish with verification commands.",
    'Return a JSON object with a "steps" array when possible. Each step must include "kind", "description", and optional "target".',
    'Allowed step kinds are "inspect", "edit", "verify", "commit", and "other".',
    "Reuse completed work. Do not repeat already completed inspect or edit actions unless the failure output specifically points back to them.",
    "Keep the plan safe: do not skip tests, do not hide the failure, and stop before any manual review or commit step."
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

// 提取最近的受控读取工具结果, 让失败恢复计划能复用真实项目上下文
function formatControlledToolResultContext(events: TaskThreadEvent[]): string | null {
  const toolResults = events
    .filter((event) => event.kind === "file" && isControlledToolResultMessage(event.message))
    .map((event) => event.message.trim())
    .filter(Boolean)
    .filter((message, index, current) => current.indexOf(message) === index)
    .slice(-6)
    .map((message) => truncateBlock(message));

  return toolResults.length > 0 ? toolResults.map((message) => `- ${message}`).join("\n") : null;
}

// 只把受控读类工具结果放进恢复上下文, 避免混入文件应用和普通日志
function isControlledToolResultMessage(message: string): boolean {
  return /^(文件读取完成|File read complete|目录列表完成|Directory list complete|文件匹配完成|File glob complete|项目搜索完成|Project search complete|Git 状态完成|Git status complete):/u.test(
    message.trim()
  );
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
  const summary = [
    `exitCode=${result.exitCode}`,
    `timedOut=${result.timedOut}`,
    `cancelled=${Boolean(result.cancelled)}`,
    result.runId ? `runId=${result.runId}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(", ");

  return [
    `Command result: ${summary}`,
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

  const omittedMarker = "\n... output truncated, middle omitted ...\n";
  const headLength = 640;
  const tailLength = maxLength - omittedMarker.length - headLength;

  return `${trimmed.slice(0, headLength)}${omittedMarker}${trimmed.slice(-tailLength)}`;
}

// 把动作队列压缩成修复计划上下文, 帮助模型避开已经完成的重复步骤
function formatActionQueueContext(actions: AgentAction[], failedActionId: string): string | null {
  if (actions.length === 0) {
    return null;
  }

  const maxActions = 10;
  const failedIndex = Math.max(0, actions.findIndex((candidate) => candidate.id === failedActionId));
  const startIndex = Math.max(0, Math.min(failedIndex - 3, actions.length - maxActions));
  const visibleActions = actions.slice(startIndex, startIndex + maxActions);
  const lines = visibleActions.map((candidate) => formatActionQueueLine(candidate, failedActionId));

  if (startIndex > 0) {
    lines.unshift(`- ... ${startIndex} earlier actions omitted`);
  }

  const omittedAfter = actions.length - startIndex - visibleActions.length;

  if (omittedAfter > 0) {
    lines.push(`- ... ${omittedAfter} later actions omitted`);
  }

  return lines.join("\n");
}

// 把单个动作整理成一行队列快照, 保留目标和命令方便模型续接
function formatActionQueueLine(action: AgentAction, failedActionId: string): string {
  const currentFailure = action.id === failedActionId ? ", current failure" : "";
  const details = [
    `kind=${action.kind}`,
    action.target ? `target=${truncateInline(action.target)}` : null,
    action.command ? `command=${truncateInline(action.command)}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(", ");

  return `- [${action.status}${currentFailure}] ${truncateInline(action.label)}${
    details ? ` (${details})` : ""
  }`;
}

// 汇总最近的执行事件, 让失败修复能看到停住前真正发生了什么
function formatRecentExecutionContext(events: TaskThreadEvent[]): string | null {
  const lines = events
    .slice(-10)
    .map(formatRecentExecutionEvent)
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n");
}

// 把时间线事件转成短日志, 命令结果优先带退出码和关键输出
function formatRecentExecutionEvent(event: TaskThreadEvent): string | null {
  if (event.commandResult) {
    const result = event.commandResult;
    const output = result.stderr.trim() || result.stdout.trim();

    return [
      `- command result at ${event.createdAt}: ${truncateInline(result.command)} exitCode=${result.exitCode}, timedOut=${result.timedOut}, cancelled=${Boolean(result.cancelled)}`,
      output ? `  output: ${formatRecentCommandOutputSnippet(output)}` : null
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }

  if (event.commandRun) {
    return `- command running at ${event.createdAt}: ${truncateInline(event.commandRun.command)}`;
  }

  if (event.kind === "error" || event.kind === "file" || event.kind === "plan") {
    return `- ${event.kind} at ${event.createdAt}: ${truncateInline(event.message, 260)}`;
  }

  return null;
}

// 压缩单行上下文, 避免长路径或错误输出把修复提示词撑得过大
function truncateInline(value: string, maxLength = 140): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

// 压缩多行工具输出, 保留足够首部内容给修复计划判断下一步
function truncateBlock(value: string, maxLength = 1400): string {
  const normalized = value
    .split(/\r?\n/u)
    .slice(0, 24)
    .join("\n")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

// 最近命令摘要保留首尾, 让修复计划能看到日志末尾的真实错误
function formatRecentCommandOutputSnippet(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const maxLength = 360;

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const omittedMarker = " ... output truncated, middle omitted ... ";
  const headLength = 140;
  const tailLength = maxLength - omittedMarker.length - headLength;

  return `${normalized.slice(0, headLength)}${omittedMarker}${normalized.slice(-tailLength)}`;
}
