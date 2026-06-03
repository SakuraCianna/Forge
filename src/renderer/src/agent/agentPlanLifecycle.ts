// 本文件说明: 收拢计划生成完成后的事件和状态决策, 避免 App 内联拼装 planner 文案。
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type { TaskThread, TaskThreadEvent } from "@/state/taskThreads";
import { appendSourceUrlsToAgentSummary, extractSourceUrlsFromText } from "@/agent/agentSources";

type CreateAgentPlanReadyEventsInput = {
  threadId: string;
  planCreatedAt: string;
  planText: string;
  agentActions: AgentAction[];
  runnableActionCount: number;
  autoRunSafeActions: boolean;
  qualityNotices: string[];
  language: Language;
};

type AgentPlanReadyState = {
  events: TaskThreadEvent[];
  status: TaskThread["status"];
};

// 计划完成后只做状态和审计事件归档, 不直接启动副作用; 真正执行仍由队列模块决定。
export function createAgentPlanReadyEvents({
  threadId,
  planCreatedAt,
  planText,
  agentActions,
  runnableActionCount,
  autoRunSafeActions,
  qualityNotices,
  language
}: CreateAgentPlanReadyEventsInput): AgentPlanReadyState {
  const planMessage = formatPlanReadyMessage({
    runnableActionCount,
    actionCount: agentActions.length,
    autoRunSafeActions,
    language
  });
  const events: TaskThreadEvent[] = [
    {
      id: `${threadId}-plan-ready-${planCreatedAt}`,
      kind: "plan",
      message: planMessage,
      createdAt: planCreatedAt
    },
    ...qualityNotices.map((message, index) => ({
      id: `${threadId}-plan-quality-${index + 1}-${planCreatedAt}`,
      kind: "plan" as const,
      message,
      createdAt: planCreatedAt
    }))
  ];

  if (agentActions.length === 0) {
    events.push({
      id: `${threadId}-plan-empty-summary-${planCreatedAt}`,
      kind: "result",
      message: appendSourceUrlsToAgentSummary(
        language === "zh-CN"
          ? "已完成分析, 但没有生成可执行步骤。具体模型输出已折叠在“已处理”里。"
          : "Analysis finished, but no executable steps were generated. Model output is folded into Processed.",
        extractSourceUrlsFromText(planText),
        language
      ),
      createdAt: planCreatedAt,
      completedAt: planCreatedAt
    });
  }

  return {
    events,
    status: resolvePlanReadyStatus({
      runnableActionCount,
      actionCount: agentActions.length
    })
  };
}

function resolvePlanReadyStatus({
  runnableActionCount,
  actionCount
}: {
  runnableActionCount: number;
  actionCount: number;
}): TaskThread["status"] {
  if (runnableActionCount > 0) {
    return "planned";
  }

  return actionCount > 0 ? "blocked" : "completed";
}

function formatPlanReadyMessage({
  runnableActionCount,
  actionCount,
  autoRunSafeActions,
  language
}: {
  runnableActionCount: number;
  actionCount: number;
  autoRunSafeActions: boolean;
  language: Language;
}): string {
  if (runnableActionCount > 0) {
    if (autoRunSafeActions) {
      return language === "zh-CN"
        ? "已生成执行计划, Forge 正在准备自动执行安全步骤。"
        : "Execution plan created. Forge will auto-run safe steps.";
    }

    return language === "zh-CN"
      ? "已生成执行计划, 等你确认继续运行安全步骤。"
      : "Execution plan created. Continue when you want Forge to run safe steps.";
  }

  if (actionCount > 0) {
    return language === "zh-CN"
      ? "已生成执行计划, 但下一步需要你先确认。"
      : "Execution plan created, but the next step needs your review.";
  }

  return language === "zh-CN"
    ? "已生成执行计划, 但没有可执行步骤。"
    : "Execution plan created, but no executable steps were found.";
}
