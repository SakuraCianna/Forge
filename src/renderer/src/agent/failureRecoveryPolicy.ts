// 本文件说明: 封装 Agent 失败恢复策略的判断和时间线文案
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { Language } from "@shared/modelTypes";

export function shouldSuggestFailureRecovery(
  agentProfile: Pick<AgentProfileContext, "failureRecoveryPolicy">,
  status: AgentAction["status"]
): boolean {
  return status === "failed" && agentProfile.failureRecoveryPolicy === "suggest";
}

export function getFailureRecoverySuggestionEventPrefix(
  threadId: string,
  actionId: string
): string {
  return `${threadId}-agent-action-recovery-suggestion-${actionId}-`;
}

export function createFailureRecoverySuggestionEventId(
  threadId: string,
  actionId: string,
  createdAt: string
): string {
  return `${getFailureRecoverySuggestionEventPrefix(threadId, actionId)}${createdAt}`;
}

export function formatFailureRecoverySuggestion(
  language: Language,
  action: Pick<AgentAction, "label">
): string {
  if (language === "zh-CN") {
    return `失败恢复建议: ${action.label} 已失败。可以生成修复计划, 或重试、跳过该动作。`;
  }

  return `Recovery suggested: ${action.label} failed. Generate a fix plan, retry it, or skip the action.`;
}
