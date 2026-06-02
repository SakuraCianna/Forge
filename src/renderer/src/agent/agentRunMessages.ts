// 本文件说明: 格式化 Agent 动作执行记录和失败修复计划文案
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type { AgentActionRunRecord, FailureRecoveryAttemptRecord } from "@/state/taskThreads";

// 把动作执行记录转成用户可读消息, 同时保留结构化 agentActionRun 字段供 UI 使用
export function formatAgentActionRunMessage(
  language: Language,
  action: AgentAction,
  record: Omit<AgentActionRunRecord, "actionId" | "label">
): string {
  const duration = typeof record.durationMs === "number" ? ` (${formatDurationMs(record.durationMs)})` : "";

  if (language === "zh-CN") {
    if (record.status === "started") {
      return `开始执行 Agent 动作: ${action.label}`;
    }

    if (record.status === "completed") {
      return `已完成 Agent 动作: ${action.label}${duration}`;
    }

    if (record.status === "failed") {
      return `Agent 动作执行失败: ${action.label}${duration}`;
    }

    if (record.status === "waiting") {
      return `Agent 动作等待继续: ${action.label}${duration}`;
    }

    if (record.status === "skipped") {
      return `已跳过 Agent 动作: ${action.label}`;
    }

    return `已确认 Agent 动作: ${action.label}`;
  }

  if (record.status === "started") {
    return `Started agent action: ${action.label}`;
  }

  if (record.status === "completed") {
    return `Completed agent action: ${action.label}${duration}`;
  }

  if (record.status === "failed") {
    return `Failed agent action: ${action.label}${duration}`;
  }

  if (record.status === "waiting") {
    return `Agent action waiting: ${action.label}${duration}`;
  }

  if (record.status === "skipped") {
    return `Skipped agent action: ${action.label}`;
  }

  return `Confirmed agent action: ${action.label}`;
}

export function formatFailureFixPlanStartMessage(
  language: Language,
  action: AgentAction,
  attempt: FailureRecoveryAttemptRecord
): string {
  if (language === "zh-CN") {
    if (attempt.source === "auto") {
      const limit = attempt.limit === undefined ? "" : ` / ${attempt.limit}`;
      const count = attempt.attempt === undefined ? "" : ` ${attempt.attempt}${limit}`;

      return `正在自动生成失败修复计划${count}: ${action.label}`;
    }

    return `正在根据失败动作生成修复计划: ${action.label}`;
  }

  if (attempt.source === "auto") {
    const limit = attempt.limit === undefined ? "" : ` / ${attempt.limit}`;
    const count = attempt.attempt === undefined ? "" : ` ${attempt.attempt}${limit}`;

    return `Auto-generating failure fix plan${count}: ${action.label}`;
  }

  return `Generating a fix plan for failed action: ${action.label}`;
}

// 用短格式显示动作耗时, 保持详情面板和时间线易扫读
export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
}
