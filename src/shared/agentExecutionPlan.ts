// 本文件说明: 将模型计划步骤转成前端可执行动作队列
import type { AgentPlanStep } from "./agentTypes.js";

type AgentActionKind =
  | "inspect-file"
  | "list-directory"
  | "glob-project"
  | "search-project"
  | "git-status"
  | "edit-file"
  | "run-command"
  | "commit"
  | "manual";

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

  if (
    (step.kind === "inspect" || step.kind === "verify") &&
    normalizedTarget &&
    isGitStatusTarget(normalizedTarget)
  ) {
    return {
      stepId: step.id,
      kind: "git-status",
      label: "Check Git status",
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget && isLikelyGlobPattern(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "glob-project",
      label: `Find ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget && isLikelyDirectoryPath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "list-directory",
      label: `List ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget && isLikelyFilePath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "inspect-file",
      label: `Inspect ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget) {
    return {
      stepId: step.id,
      kind: "search-project",
      label: `Search ${normalizedTarget}`,
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

// 判断目标是否像 glob 模式, 让文件匹配走专用工具而不是读一个不存在的路径
function isLikelyGlobPattern(target: string): boolean {
  return /[*?[\]]/u.test(target);
}

// 常见 Git 只读检查走受控 Git IPC, 不通过 shell 执行命令
function isGitStatusTarget(target: string): boolean {
  return /^git\s+(?:status|diff)(?:\s|$)/iu.test(target.trim().replace(/\s+/g, " "));
}

// 目录目标走 LS 类工具, 避免把文件夹当成文本文件读取
function isLikelyDirectoryPath(target: string): boolean {
  const normalizedTarget = target.trim().replace(/\\/g, "/");
  const lastSegment = normalizedTarget.split("/").filter(Boolean).at(-1) ?? normalizedTarget;

  return (
    normalizedTarget === "." ||
    /\/$/u.test(normalizedTarget) ||
    (/[/\\]/u.test(target) && !/\.[a-z0-9]+$/iu.test(lastSegment)) ||
    /^(src|docs?|test|tests|packages|apps|components|lib|server|client)$/iu.test(normalizedTarget)
  );
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
