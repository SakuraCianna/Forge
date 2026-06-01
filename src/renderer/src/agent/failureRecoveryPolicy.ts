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
    return `失败恢复提示: ${action.label} 已失败。Forge 会自动准备恢复步骤, 需要权限或依赖处理时会停下等待确认。`;
  }

  return `Recovery notice: ${action.label} failed. Forge will prepare recovery steps automatically and stop for permission or dependency approval.`;
}
