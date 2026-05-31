// 本文件说明: 为 Agent 文件修改请求补充动作级上下文, 提升多文件执行准确度
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { TaskThread } from "@/state/taskThreads";

// 生成文件修改任务提示, 让模型知道当前动作在整个执行队列里的位置
export function createFileChangeTaskPrompt(
  thread: TaskThread,
  relativePath: string,
  action?: AgentAction | null
): string {
  const actionQueueContext = formatActionQueueContext(thread.agentActions ?? [], action?.id ?? null);
  const currentActionContext = action ? formatCurrentActionContext(action) : null;

  return [
    `Original task:\n${thread.prompt}`,
    `Target file:\n${relativePath}`,
    currentActionContext ? `Current edit action:\n${currentActionContext}` : null,
    actionQueueContext ? `Action queue:\n${actionQueueContext}` : null,
    "File change instructions:",
    "Rewrite only the target file shown above.",
    "Satisfy the current edit action first, then preserve the original task intent.",
    "If the target file is empty, create the complete file content from scratch.",
    "Do not invent changes for other files. Mention required follow-up files only through the execution plan, not inside this file."
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

// 整理当前动作的关键字段, 避免只靠原始用户请求导致多文件步骤混淆
function formatCurrentActionContext(action: AgentAction): string {
  return [
    `Label: ${action.label}`,
    `Kind: ${action.kind}`,
    `Status: ${action.status}`,
    action.target ? `Target: ${action.target}` : null,
    action.command ? `Command: ${action.command}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

// 把动作队列压缩成短上下文, 让模型复用已完成步骤并聚焦当前文件
function formatActionQueueContext(actions: AgentAction[], currentActionId: string | null): string | null {
  if (actions.length === 0) {
    return null;
  }

  const maxActions = 12;
  const currentIndex =
    currentActionId === null ? 0 : Math.max(0, actions.findIndex((candidate) => candidate.id === currentActionId));
  const startIndex = Math.max(0, Math.min(currentIndex - 4, actions.length - maxActions));
  const visibleActions = actions.slice(startIndex, startIndex + maxActions);
  const lines = visibleActions.map((candidate) => formatActionQueueLine(candidate, currentActionId));

  if (startIndex > 0) {
    lines.unshift(`- ... ${startIndex} earlier actions omitted`);
  }

  const omittedAfter = actions.length - startIndex - visibleActions.length;

  if (omittedAfter > 0) {
    lines.push(`- ... ${omittedAfter} later actions omitted`);
  }

  return lines.join("\n");
}

// 把单个动作压成可读行, 保留目标和命令但限制长度
function formatActionQueueLine(action: AgentAction, currentActionId: string | null): string {
  const currentMarker = action.id === currentActionId ? ", current" : "";
  const details = [
    `kind=${action.kind}`,
    action.target ? `target=${truncateInline(action.target)}` : null,
    action.command ? `command=${truncateInline(action.command)}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(", ");

  return `- [${action.status}${currentMarker}] ${truncateInline(action.label)}${
    details ? ` (${details})` : ""
  }`;
}

// 压缩单行提示词内容, 防止长路径和长命令撑大上下文
function truncateInline(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}
