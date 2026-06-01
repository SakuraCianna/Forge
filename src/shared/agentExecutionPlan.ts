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
  const drafts = steps.flatMap(createAgentActionDrafts);
  const hasExecutableAction = drafts.some((draft) => draft.kind !== "manual");
  const actionsToKeep = hasExecutableAction
    ? drafts.filter((draft) => draft.kind !== "manual" || Boolean(draft.target))
    : drafts;

  return actionsToKeep.map((draft, index) => ({
    id: `action-${index + 1}`,
    ...draft
  }));
}

// 模型有时会把多个文件塞进一个 target, 这里拆成独立动作, 避免 realpath 读取一个不存在的拼接路径
function createAgentActionDrafts(step: AgentPlanStep): AgentActionDraft[] {
  const normalizedTarget = normalizeActionTarget(step.target);
  const targets = shouldSplitStepTarget(step.kind)
    ? splitMultiFileTarget(normalizedTarget)
    : normalizedTarget
      ? [normalizedTarget]
      : [];

  if (targets.length <= 1) {
    return [createAgentActionDraft(step)];
  }

  return targets.map((target) => createAgentActionDraft({ ...step, target }));
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
      label: "查看 Git 状态",
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget && isLikelyGlobPattern(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "glob-project",
      label: `匹配文件 ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget && isLikelyAgentProjectDirectoryPath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "list-directory",
      label: `列出目录 ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget && isLikelyAgentProjectFilePath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "inspect-file",
      label: `读取 ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "inspect" && normalizedTarget) {
    return {
      stepId: step.id,
      kind: "search-project",
      label: `搜索 ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "edit" && normalizedTarget && isLikelyAgentProjectFilePath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "edit-file",
      label: `编辑 ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "verify" && normalizedTarget && isLikelyAgentProjectFilePath(normalizedTarget)) {
    return {
      stepId: step.id,
      kind: "edit-file",
      label: `编辑 ${normalizedTarget}`,
      status: "pending",
      target: normalizedTarget
    };
  }

  if (step.kind === "verify" && normalizedTarget) {
    return {
      stepId: step.id,
      kind: "run-command",
      label: `运行命令 ${normalizedTarget}`,
      status: "pending",
      command: normalizedTarget
    };
  }

  if (step.kind === "commit") {
    return {
      stepId: step.id,
      kind: "commit",
      label: normalizedTarget ? `提交 ${normalizedTarget}` : "提交变更",
      status: "pending",
      target: normalizedTarget
    };
  }

  return {
    stepId: step.id,
    kind: "manual",
    label: step.description.trim() || step.title.trim() || "查看这个计划步骤",
    status: "pending",
    target: normalizedTarget
  };
}

// 清理动作目标文本, 空字符串统一变成 undefined
function normalizeActionTarget(target: string | undefined): string | undefined {
  const normalized = target
    ?.trim()
    .replace(/^`|`$/g, "")
    .replace(/^["']|["']$/g, "")
    .replace(/[.,;:，。；：]+$/u, "");

  return normalized || undefined;
}

function shouldSplitStepTarget(kind: AgentPlanStep["kind"]): boolean {
  return kind === "inspect" || kind === "edit" || kind === "verify";
}

function splitMultiFileTarget(target: string | undefined): string[] {
  if (!target || !/[、，,；;\n]/u.test(target)) {
    return target ? [target] : [];
  }

  const segments = target
    .split(/[、，,；;\n]+/u)
    .map((segment) => normalizeActionTarget(segment))
    .filter((segment): segment is string => Boolean(segment));

  if (segments.length <= 1 || !segments.every(isLikelyAgentProjectFilePath)) {
    return [target];
  }

  const firstDirectory = getDirectoryPrefix(segments[0]);

  return segments.map((segment) =>
    firstDirectory && !segment.includes("/") && !segment.includes("\\")
      ? `${firstDirectory}/${segment}`
      : segment
  );
}

function getDirectoryPrefix(target: string): string | null {
  const normalizedTarget = target.replace(/\\/g, "/");
  const separatorIndex = normalizedTarget.lastIndexOf("/");

  return separatorIndex > 0 ? normalizedTarget.slice(0, separatorIndex) : null;
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
export function isLikelyAgentProjectDirectoryPath(target: string): boolean {
  const normalizedTarget = target.trim().replace(/\\/g, "/");
  const lastSegment = normalizedTarget.split("/").filter(Boolean).at(-1) ?? normalizedTarget;

  if (normalizedTarget !== "." && !isCleanProjectPathTarget(normalizedTarget)) {
    return false;
  }

  return (
    normalizedTarget === "." ||
    /\/$/u.test(normalizedTarget) ||
    (/[/\\]/u.test(target) && !/\.[a-z0-9]+$/iu.test(lastSegment)) ||
    /^(src|docs?|test|tests|packages|apps|components|lib|server|client)$/iu.test(normalizedTarget)
  );
}

// 用轻量规则判断目标是否像文件路径, 避免误把普通说明当文件
export function isLikelyAgentProjectFilePath(target: string): boolean {
  const normalizedTarget = target.trim().replace(/\\/g, "/");

  if (!isCleanProjectPathTarget(normalizedTarget)) {
    return false;
  }

  const lastSegment = normalizedTarget.split("/").filter(Boolean).at(-1) ?? normalizedTarget;

  return isLikelyFileName(lastSegment);
}

function isCleanProjectPathTarget(target: string): boolean {
  const normalizedTarget = target.trim().replace(/\\/g, "/").replace(/^\.\//u, "").replace(/\/+$/u, "");

  if (!normalizedTarget || /^[a-z]+(\s|$)/iu.test(normalizedTarget)) {
    return false;
  }

  if (/[\r\n<>:"|?*]/u.test(normalizedTarget) || /^(?:[a-z]:|\/)/iu.test(normalizedTarget)) {
    return false;
  }

  const segments = normalizedTarget.split("/");

  return segments.every((segment) => segment.trim() && segment !== "." && segment !== "..");
}

function isLikelyFileName(fileName: string): boolean {
  return /^\.[A-Za-z0-9_.-]+$/u.test(fileName) || /\.[A-Za-z0-9][A-Za-z0-9_.-]{0,15}$/u.test(fileName);
}
