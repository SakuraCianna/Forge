// 本文件说明: 提供线程选择, 对话压缩和提交动作相关的纯函数
import type { AgentImageAttachment } from "@shared/agentTypes";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { ForgeModel } from "@shared/modelTypes";
import type { TaskThread } from "./taskThreads.js";
import {
  formatThreadContextCompactionForPrompt,
  getEventsAfterThreadContextCompaction
} from "./threadContextCompaction.js";

export type ThreadConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export function selectThreadById(
  threads: TaskThread[],
  threadId: string | null | undefined
): TaskThread | null {
  return threadId ? (threads.find((thread) => thread.id === threadId) ?? null) : null;
}

export function selectVisibleWorkspaceThreads(
  threads: TaskThread[],
  workspaceProjectPath: string | null
): TaskThread[] {
  return threads.filter(
    (thread) =>
      !thread.archived &&
      (workspaceProjectPath ? thread.projectPath === workspaceProjectPath : !thread.projectPath)
  );
}

// 把当前线程历史压成模型对话, 用户和输出事件按顺序保留
export function createThreadConversation(thread: TaskThread): ThreadConversationTurn[] {
  const turns: ThreadConversationTurn[] = [{ role: "user", content: thread.prompt }];
  const compactedContext = formatThreadContextCompactionForPrompt(thread);

  if (compactedContext) {
    turns.push({ role: "assistant", content: compactedContext });
  }

  for (const event of getEventsAfterThreadContextCompaction(thread)) {
    if (event.kind === "user") {
      turns.push({ role: "user", content: event.message });
    } else if (event.kind === "result") {
      turns.push({ role: "assistant", content: event.message });
    }
  }

  return turns;
}

export function resolveVisionAttachments(
  model: ForgeModel | null,
  attachments: AgentImageAttachment[] | undefined
): AgentImageAttachment[] | undefined {
  if (model?.capabilities.vision !== true || !attachments?.length) {
    return undefined;
  }

  return attachments;
}

// 找到当前线程中等待用户处理的提交门禁动作
export function findPendingAgentCommitAction(thread: TaskThread | null): AgentAction | null {
  return thread?.agentActions?.find((action) => action.kind === "commit" && action.status === "pending") ?? null;
}

// 判断被暂停线程是否还有可继续推进的 Agent 动作
export function hasContinuableAgentActions(thread: TaskThread | null): boolean {
  return Boolean(thread?.agentActions?.some((action) => action.status === "pending"));
}

// 从提交动作目标里提取可直接使用的 Git 提交信息
export function formatAgentCommitMessageSuggestion(action: AgentAction | null): string | null {
  const target = action?.target?.trim();

  if (!target) {
    return null;
  }

  return parseGitCommitMessage(target) ?? target;
}

// 支持模型输出 git commit -m "..." 或 --message ... 时提取真实 message
export function parseGitCommitMessage(value: string): string | null {
  const normalized = value.trim();
  const quoted = normalized.match(/(?:^|\s)(?:-m|--message)\s+(["'])(.*?)\1/u)?.[2]?.trim();

  if (quoted) {
    return quoted;
  }

  const unquoted = normalized.match(/(?:^|\s)(?:-m|--message)\s+(.+)$/u)?.[1]?.trim();

  return unquoted || null;
}
