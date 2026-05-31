// 本文件说明: 判断 Agent 动作是否可执行并按队列推进动作
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import { defaultCommandSafetyRuleReason, type CommandSafetyRule } from "@/state/generalPreferences";

type AgentActionExecution =
  | { kind: "open-file"; relativePath: string }
  | { kind: "generate-file-change"; relativePath: string }
  | { kind: "run-command"; command: string }
  | { kind: "manual-gate"; reason: "review" | "commit" }
  | { kind: "complete" };

type AgentToolPermission = "read" | "edit" | "command" | "git";

export type AgentActionPermissionResult =
  | { ok: true }
  | { ok: false; tool: AgentToolPermission; message: string };

export type AgentCommandRisk =
  | { level: "allow" }
  | { level: "ask" | "deny"; reason: string };

export type AgentCommandSafetyPolicy = {
  fullAccess?: boolean;
  rules?: CommandSafetyRule[];
};

const dependencyChangeReason = "command may change dependencies or project state";
const gitMutationReason = "command may change Git history or remote state";
const destructiveCommandReason = "command can delete files or rewrite history";
const unknownCommandReason = "command is not in the safe allowlist";

// 根据动作类型决定执行方式, 不能自动执行的动作返回阻塞原因
export function resolveAgentActionExecution(action: AgentAction): AgentActionExecution {
  if (action.kind === "manual" || action.kind === "commit") {
    return { kind: "manual-gate", reason: action.kind === "commit" ? "commit" : "review" };
  }

  if (action.kind === "inspect-file" && action.target) {
    return { kind: "open-file", relativePath: action.target };
  }

  if (action.kind === "edit-file" && action.target) {
    return { kind: "generate-file-change", relativePath: action.target };
  }

  if (action.kind === "run-command" && action.command) {
    return { kind: "run-command", command: action.command };
  }

  return { kind: "complete" };
}

// 将 Agent 配置里的工具开关变成执行前硬边界, 避免只停留在提示词层
export function resolveAgentActionPermission(
  action: AgentAction,
  agentProfile?: AgentProfileContext
): AgentActionPermissionResult {
  const requiredTool = getRequiredToolForAction(action);

  if (!requiredTool || !agentProfile) {
    return { ok: true };
  }

  if (agentProfile.enabledTools.includes(requiredTool)) {
    return { ok: true };
  }

  return {
    ok: false,
    tool: requiredTool,
    message: `Agent profile ${agentProfile.name} does not allow ${requiredTool} actions`
  };
}

// 将命令分成自动允许, 需要确认和直接拒绝, 复合命令按最高风险处理
export function resolveAgentCommandRisk(
  command: string,
  policy: AgentCommandSafetyPolicy = {}
): AgentCommandRisk {
  const segments = splitShellCommandSegments(command);
  let strongestRisk: AgentCommandRisk = { level: "allow" };

  for (const segment of segments) {
    const risk = resolveSingleCommandRisk(segment, policy);

    if (risk.level === "deny") {
      return risk;
    }

    if (risk.level === "ask") {
      strongestRisk = risk;
    }
  }

  return strongestRisk;
}

// 找到队列里第一个还没完成的动作, 用于决定下一步提示
export function findNextPendingAgentAction(actions: AgentAction[]): AgentAction | null {
  return actions.find((action) => action.status === "pending") ?? null;
}

// 从队列开头收集可自动执行动作, 遇到人工步骤就停下
export function getRunnablePendingAgentActions(
  actions: AgentAction[],
  policy: AgentCommandSafetyPolicy = {}
): AgentAction[] {
  const runnableActions: AgentAction[] = [];
  let hasQueuedEditPreview = false;

  for (const action of actions) {
    if (action.status === "completed" || action.status === "skipped") {
      continue;
    }

    if (action.status !== "pending" || !isRunnableAgentAction(action, policy)) {
      break;
    }

    if (hasQueuedEditPreview && action.kind !== "edit-file") {
      break;
    }

    runnableActions.push(action);

    if (action.kind === "edit-file") {
      hasQueuedEditPreview = true;
    }
  }

  return runnableActions;
}

type AgentActionBatchResult = {
  completed: number;
  stoppedAt: AgentAction | null;
  finalStatus: AgentAction["status"];
  stopReason: "status" | "pause" | null;
};

export type AgentActionRunOutcome =
  | AgentAction["status"]
  | {
      status: AgentAction["status"];
      continueBatch?: boolean;
    };

// 顺序执行动作批次, 前一个失败时不继续冒进
export async function runAgentActionBatch(
  actions: AgentAction[],
  runAction: (action: AgentAction) => AgentActionRunOutcome | Promise<AgentActionRunOutcome>
): Promise<AgentActionBatchResult> {
  let completed = 0;
  let finalStatus: AgentAction["status"] = "completed";

  for (const action of actions) {
    const outcome = normalizeAgentActionRunOutcome(await runAction(action));
    const { status } = outcome;
    finalStatus = status;

    if (status !== "completed") {
      return {
        completed,
        stoppedAt: action,
        finalStatus,
        stopReason: "status"
      };
    }

    completed += 1;

    if (!outcome.continueBatch) {
      return {
        completed,
        stoppedAt: action,
        finalStatus,
        stopReason: "pause"
      };
    }
  }

  return {
    completed,
    stoppedAt: null,
    finalStatus,
    stopReason: null
  };
}

// 把空执行结果归一成成功, 让简单动作无需手写返回值
function normalizeAgentActionRunOutcome(outcome: AgentActionRunOutcome): {
  status: AgentAction["status"];
  continueBatch: boolean;
} {
  if (typeof outcome === "string") {
    return {
      status: outcome,
      continueBatch: true
    };
  }

  return {
    status: outcome.status,
    continueBatch: outcome.continueBatch ?? true
  };
}

// 判断动作是否适合自动执行, manual 和 commit 必须留给用户确认
export function isRunnableAgentAction(
  action: AgentAction,
  policy: AgentCommandSafetyPolicy = {}
): boolean {
  if ((action.kind === "inspect-file" || action.kind === "edit-file") && action.target) {
    return true;
  }

  if (action.kind === "run-command" && action.command) {
    const risk = resolveAgentCommandRisk(action.command, policy);

    return risk.level === "allow" || (policy.fullAccess === true && risk.level === "ask");
  }

  return false;
}

// 将队列动作映射到 Agent 配置中的工具名
function getRequiredToolForAction(action: AgentAction): AgentToolPermission | null {
  if (action.kind === "inspect-file") {
    return "read";
  }

  if (action.kind === "edit-file") {
    return "edit";
  }

  if (action.kind === "run-command") {
    return "command";
  }

  if (action.kind === "commit") {
    return "git";
  }

  return null;
}

// 轻量拆分命令链, 先覆盖常见 PowerShell 和 POSIX 连接符
function splitShellCommandSegments(command: string): string[] {
  return command
    .split(/(?:&&|\|\||;|\|)/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

// 判断单条命令风险, 默认未知命令走人工确认而不是直接执行
function resolveSingleCommandRisk(
  command: string,
  policy: AgentCommandSafetyPolicy
): AgentCommandRisk {
  const normalized = command.trim().replace(/\s+/g, " ").toLowerCase();

  if (!normalized) {
    return { level: "allow" };
  }

  if (isDestructiveCommand(normalized)) {
    return { level: "deny", reason: destructiveCommandReason };
  }

  const configuredRisk = resolveConfiguredCommandRisk(normalized, policy.rules);

  if (configuredRisk?.level === "deny" || configuredRisk?.level === "ask") {
    return configuredRisk;
  }

  if (isDependencyChangingCommand(normalized)) {
    return configuredRisk ?? { level: "ask", reason: dependencyChangeReason };
  }

  if (isGitMutatingCommand(normalized)) {
    return configuredRisk ?? { level: "ask", reason: gitMutationReason };
  }

  if (configuredRisk?.level === "allow" || isAllowedCommand(normalized)) {
    return { level: "allow" };
  }

  return { level: "ask", reason: unknownCommandReason };
}

// 匹配自定义命令规则, deny 和 ask 始终强于 allow
function resolveConfiguredCommandRisk(
  command: string,
  rules: CommandSafetyRule[] | undefined
): AgentCommandRisk | null {
  let strongestRisk: AgentCommandRisk | null = null;

  for (const rule of rules ?? []) {
    if (!doesCommandRuleMatch(command, rule)) {
      continue;
    }

    if (rule.level === "deny") {
      return {
        level: "deny",
        reason: rule.reason.trim() || defaultCommandSafetyRuleReason
      };
    }

    if (rule.level === "ask") {
      strongestRisk = {
        level: "ask",
        reason: rule.reason.trim() || defaultCommandSafetyRuleReason
      };
      continue;
    }

    if (!strongestRisk) {
      strongestRisk = { level: "allow" };
    }
  }

  return strongestRisk;
}

// 判断单条规则模式是否命中命令, 星号作为简单通配符
function doesCommandRuleMatch(command: string, rule: CommandSafetyRule): boolean {
  const pattern = normalizeCommandPattern(rule.pattern);

  if (!pattern) {
    return false;
  }

  if (!pattern.includes("*")) {
    return command === pattern;
  }

  return new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`, "u").test(command);
}

// 归一化命令规则模式, 让大小写和连续空白不影响匹配
function normalizeCommandPattern(pattern: string): string {
  return pattern.trim().replace(/\s+/g, " ").toLowerCase();
}

// 转义正则元字符, 只保留星号通配语义
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// 识别会删除文件或重写历史的命令
function isDestructiveCommand(command: string): boolean {
  return (
    /\b(remove-item|rm|del|erase|rmdir|rd)\b/u.test(command) ||
    /^git\s+(?:reset\s+--hard|clean\b|push\b.*\s--force(?:-with-lease)?\b)/u.test(command)
  );
}

// 识别会改变依赖或项目状态的包管理命令
function isDependencyChangingCommand(command: string): boolean {
  return /^(npm|pnpm|yarn|bun)\s+(?:i|install|add|remove|uninstall|update|upgrade)\b/u.test(command);
}

// 识别需要用户明确确认的 Git 写操作
function isGitMutatingCommand(command: string): boolean {
  return /^git\s+(?:add|commit|push|pull|merge|rebase|checkout|switch|restore|tag|stash)\b/u.test(command);
}

// 允许常见本地只读和验证命令自动运行
function isAllowedCommand(command: string): boolean {
  return (
    /^git\s+(?:status|diff|log|show|branch)(?:\s|$)/u.test(command) ||
    /^npm\s+(?:test|t|run\s+(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^pnpm\s+(?:test|run\s+(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^yarn\s+(?:test|run\s+(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^bun\s+(?:test|run\s+(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^(npx\s+)?(?:vitest|tsc|eslint)(?:\s|$)/u.test(command) ||
    /^(rg|git\s+grep|get-childitem|dir|ls)(?:\s|$)/u.test(command)
  );
}
