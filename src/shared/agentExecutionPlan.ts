// 本文件说明: 将模型计划步骤转成前端可执行动作队列
import type { AgentPlanStep } from "./agentTypes.js";

type AgentActionKind = "inspect-file" | "edit-file" | "run-command" | "commit" | "manual";

type AgentActionStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type AgentAction = {
  id: string;
  stepId: string;
  kind: AgentActionKind;
  label: string;
  status: AgentActionStatus;
  target?: string;
  command?: string;
};

type AgentActionDraft = Omit<AgentAction, "id">;

// 把模型步骤映射成带状态的动作队列, 执行器只消费这种稳定结构
export function createAgentActionsFromPlanSteps(steps: AgentPlanStep[]): AgentAction[] {
  const drafts = steps.map(createAgentActionDraft);
  const hasExecutableAction = drafts.some((draft) => draft.kind !== "manual");
  const actionsToKeep = hasExecutableAction
    ? drafts.filter((draft) => draft.kind !== "manual" || Boolean(draft.target))
    : drafts;

  return actionsToKeep.map((draft, index) => ({
    id: `action-${index + 1}`,
    ...draft
  }));
}

// 先把单个计划步骤转换成未编号动作, 过滤说明步后再统一编号
function createAgentActionDraft(step: AgentPlanStep): AgentActionDraft {
  const normalizedTarget = normalizeActionTarget(step.target);

  if (step.kind === "inspect" && normalizedTarget && isLikelyFilePath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "inspect-file",
      label: `Inspect ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "edit" && normalizedTarget && isLikelyFilePath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "edit-file",
      label: `Edit ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "verify" && normalizedTarget) {
    return {
      stepId: step.id,
      kind: "run-command",
      label: `Run ${normalizedTarget}`,
      status: "pending",
      command: normalizedTarget
    };
  }

  if (step.kind === "commit") {
    return {
      stepId: step.id,
      kind: "commit",
      label: normalizedTarget ? `Commit ${normalizedTarget}` : "Commit changes",
      status: "pending",
      target: normalizedTarget
    };
  }

  return {
    stepId: step.id,
    kind: "manual",
    label: step.description.trim() || step.title.trim() || "Review this plan step",
    status: "pending",
    target: normalizedTarget
  };
}

// 清理动作目标文本, 空字符串统一变成 undefined
function normalizeActionTarget(target: string | undefined): string | undefined {
  const normalized = target?.trim().replace(/^`|`$/g, "");

  return normalized || undefined;
}

// 用轻量规则判断目标是否像文件路径, 避免误把普通说明当文件
function isLikelyFilePath(target: string): boolean {
  if (/^[a-z]+(\s|$)/i.test(target)) {
    return false;
  }

  return (
    target.includes("/") ||
    target.includes("\\") ||
    /\.[a-z0-9]+$/i.test(target) ||
    target.startsWith(".")
  );
}
