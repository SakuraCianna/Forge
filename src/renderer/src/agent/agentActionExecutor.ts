// 本文件说明: 判断 Agent 动作是否可执行并按队列推进动作
import {
  isLikelyAgentProjectDirectoryPath,
  isLikelyAgentProjectFilePath,
  type AgentAction
} from "@shared/agentExecutionPlan";
import {
  canAutoExecuteBuiltInTool,
  getBuiltInToolDefinition
} from "@shared/builtInToolCatalog";
import { getRequiredAgentPermissionForBuiltInTool } from "@shared/builtInToolAgentPermissions";
import type { AgentProfileContext, AgentToolPermission } from "@shared/agentTypes";
import { defaultCommandSafetyRuleReason, type CommandSafetyRule } from "@/state/generalPreferences";

export type AgentActionExecution =
  | { kind: "open-file"; relativePath: string }
  | { kind: "list-directory"; relativePath: string }
  | { kind: "glob-project"; pattern: string }
  | { kind: "search-project"; query: string }
  | { kind: "web-search"; query: string }
  | { kind: "git-status" }
  | { kind: "generate-file-change"; relativePath: string }
  | { kind: "run-command"; command: string }
  | {
      kind: "built-in-tool";
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      kind: "invoke-extension";
      actionId: string;
      extensionId: string;
      input: Record<string, unknown>;
    }
  | { kind: "invalid-target"; reason: string }
  | { kind: "manual-gate"; reason: "review" | "commit" }
  | { kind: "complete" };

export type { AgentToolPermission } from "@shared/agentTypes";

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
const shellOutputRedirectionReason = "command may write files through shell redirection";

// 根据动作类型决定执行方式, 不能自动执行的动作返回阻塞原因
export function resolveAgentActionExecution(
  action: AgentAction,
  policy: AgentCommandSafetyPolicy = {}
): AgentActionExecution {
  if (action.kind === "manual" || action.kind === "commit") {
    return { kind: "manual-gate", reason: action.kind === "commit" ? "commit" : "review" };
  }

  if (action.kind === "inspect-file" && action.target) {
    if (!isLikelyAgentProjectFilePath(action.target)) {
      return { kind: "invalid-target", reason: `Invalid file target: ${action.target}` };
    }

    return { kind: "open-file", relativePath: action.target };
  }

  if (action.kind === "list-directory" && action.target) {
    if (!isLikelyAgentProjectDirectoryPath(action.target)) {
      return { kind: "invalid-target", reason: `Invalid directory target: ${action.target}` };
    }

    return { kind: "list-directory", relativePath: action.target };
  }

  if (action.kind === "glob-project" && action.target) {
    return { kind: "glob-project", pattern: action.target };
  }

  if (action.kind === "search-project" && action.target) {
    return { kind: "search-project", query: action.target };
  }

  if (action.kind === "web-search" && action.target) {
    return { kind: "web-search", query: action.target };
  }

  if (action.kind === "git-status") {
    return { kind: "git-status" };
  }

  if (action.kind === "edit-file" && action.target) {
    if (!isLikelyAgentProjectFilePath(action.target)) {
      return { kind: "invalid-target", reason: `Invalid edit target: ${action.target}` };
    }

    return { kind: "generate-file-change", relativePath: action.target };
  }

  if (action.kind === "run-command" && action.command) {
    return { kind: "run-command", command: action.command };
  }

  if (action.kind === "built-in-tool" && action.builtInToolName) {
    const definition = getBuiltInToolDefinition(action.builtInToolName);

    if (definition.requiresConfirmation && !policy.fullAccess) {
      return { kind: "manual-gate", reason: "review" };
    }

    return {
      kind: "built-in-tool",
      toolName: definition.name,
      input: action.builtInToolInput ?? {}
    };
  }

  if (action.kind === "invoke-extension" && action.extensionId && action.extensionActionId) {
    return {
      kind: "invoke-extension",
      actionId: action.extensionActionId,
      extensionId: action.extensionId,
      input: action.extensionInput ?? {}
    };
  }

  return { kind: "complete" };
}

// 将智能体配置里的工具开关变成执行前硬边界, 避免只停留在提示词层
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

// 新建文件计划常见顺序是先 inspect 再 edit; inspect 发现文件不存在时不应阻断后续创建
export function shouldTreatMissingInspectAsNewFile(
  action: AgentAction,
  actions: AgentAction[],
  taskPrompt = ""
): boolean {
  return Boolean(resolveMissingInspectFileFallback(action, actions, taskPrompt));
}

export type MissingInspectFileFallback = "continue-existing-edit" | "generate-file-change";

// 缺失的 inspect 目标有两种安全兜底: 后面已有 edit 就继续队列; 用户明确要写/创建该文件时直接生成
export function resolveMissingInspectFileFallback(
  action: AgentAction,
  actions: AgentAction[],
  taskPrompt = ""
): MissingInspectFileFallback | null {
  const target = normalizeComparableActionTarget(action.target);

  if (action.kind !== "inspect-file" || !target) {
    return null;
  }

  const actionIndex = actions.findIndex((candidate) => candidate.id === action.id);

  if (actionIndex < 0) {
    return null;
  }

  const hasLaterEdit = actions.slice(actionIndex + 1).some((candidate) => {
    const candidateTarget = normalizeComparableActionTarget(candidate.target);

    return (
      candidate.kind === "edit-file" &&
      candidate.status === "pending" &&
      Boolean(candidateTarget) &&
      candidateTarget === target
    );
  });

  if (hasLaterEdit) {
    return "continue-existing-edit";
  }

  if (hasCreateFileIntent(taskPrompt, action.target) || hasProjectScaffoldFileIntent(taskPrompt, action.target)) {
    return "generate-file-change";
  }

  return null;
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

// 归一化动作目标, 让 Windows 反斜杠和大小写差异不影响同文件判断
function normalizeComparableActionTarget(target: string | undefined): string | null {
  const normalized = target?.trim().replace(/\\/g, "/").toLocaleLowerCase();

  return normalized || null;
}

function hasCreateFileIntent(taskPrompt: string, target: string | undefined): boolean {
  if (!taskPrompt || !target || !/\.[a-z0-9]+$/iu.test(target.trim())) {
    return false;
  }

  const normalizedPrompt = taskPrompt.replace(/\\/g, "/").toLocaleLowerCase();
  const normalizedTarget = target.replace(/\\/g, "/").toLocaleLowerCase();
  const fileName = normalizedTarget.split("/").filter(Boolean).at(-1) ?? normalizedTarget;
  const mentionsTarget =
    normalizedPrompt.includes(normalizedTarget) || normalizedPrompt.includes(fileName);

  if (!mentionsTarget) {
    return false;
  }

  return /写|撰写|创建|新建|生成|新增|帮我做|帮我写|create|write|generate|draft|make|add/iu.test(
    normalizedPrompt
  );
}

// 空项目脚手架创建时, 用户通常不会逐个点名 pom.xml/package.json 等骨架文件
function hasProjectScaffoldFileIntent(taskPrompt: string, target: string | undefined): boolean {
  if (!taskPrompt || !target) {
    return false;
  }

  const normalizedPrompt = taskPrompt.toLocaleLowerCase();
  const normalizedTarget = target.replace(/\\/g, "/").toLocaleLowerCase();

  if (
    !/(项目|工程|系统|应用|前后端|前端|后端|project|app|application|system)/iu.test(
      normalizedPrompt
    ) ||
    !/(创建|新建|生成|搭建|做一个|实现|create|generate|scaffold|build|make)/iu.test(
      normalizedPrompt
    )
  ) {
    return false;
  }

  return isCommonScaffoldFileTarget(normalizedTarget);
}

function isCommonScaffoldFileTarget(target: string): boolean {
  return (
    /(^|\/)(pom\.xml|build\.gradle|settings\.gradle|package\.json|vite\.config\.[jt]s|tsconfig\.json)$/iu.test(
      target
    ) ||
    /(^|\/)src\/main\/(?:java|kotlin|resources)\//iu.test(target) ||
    /(^|\/)(src|frontend|client|app)\/(?:main|app|index|router|views|components)\./iu.test(target) ||
    /(^|\/)(frontend|client|web)\/(?:index\.html|package\.json|vite\.config\.[jt]s|src\/(?:main\.[jt]s|App\.vue|App\.[jt]sx?|components\/[^/]+\.(?:vue|[jt]sx?)))$/iu.test(
      target
    ) ||
    /(^|\/)(backend|server|api)\/(?:pom\.xml|build\.gradle|src\/main\/(?:java|kotlin|resources)\/)/iu.test(
      target
    )
  );
}

// 判断动作是否适合自动执行, manual 和 commit 必须留给用户确认
export function isRunnableAgentAction(
  action: AgentAction,
  policy: AgentCommandSafetyPolicy = {}
): boolean {
  if (action.kind === "manual" || action.kind === "commit") {
    return Boolean(policy.fullAccess);
  }

  if (
    (action.kind === "inspect-file" ||
      action.kind === "list-directory" ||
      action.kind === "glob-project" ||
      action.kind === "search-project" ||
      action.kind === "web-search" ||
      action.kind === "git-status" ||
      action.kind === "edit-file") &&
    (action.kind === "git-status" ||
      (action.kind === "list-directory"
        ? Boolean(action.target && isLikelyAgentProjectDirectoryPath(action.target))
        : Boolean(
            action.target &&
              (action.kind === "inspect-file" || action.kind === "edit-file"
                ? isLikelyAgentProjectFilePath(action.target)
                : true)
          )))
  ) {
    return true;
  }

  if (action.kind === "run-command" && action.command) {
    const risk = resolveAgentCommandRisk(action.command, policy);

    return risk.level === "allow";
  }

  if (action.kind === "built-in-tool" && action.builtInToolName) {
    const definition = getBuiltInToolDefinition(action.builtInToolName);

    return canAutoExecuteBuiltInTool(definition, {
      fullAccess: policy.fullAccess
    });
  }

  if (action.kind === "invoke-extension" && action.extensionConfirmation) {
    return false;
  }

  if (action.kind === "invoke-extension" && action.extensionId && action.extensionActionId) {
    return true;
  }

  return false;
}

// 将队列动作映射到智能体配置中的工具名
function getRequiredToolForAction(action: AgentAction): AgentToolPermission | null {
  if (action.kind === "web-search") {
    return "web";
  }

  if (
    action.kind === "inspect-file" ||
    action.kind === "list-directory" ||
    action.kind === "glob-project" ||
    action.kind === "search-project"
  ) {
    return "read";
  }

  if (action.kind === "edit-file") {
    return "edit";
  }

  if (action.kind === "run-command") {
    return "command";
  }

  if (action.kind === "git-status" || action.kind === "commit") {
    return "git";
  }

  if (action.kind === "invoke-extension") {
    return "extension";
  }

  if (action.kind === "built-in-tool" && action.builtInToolName) {
    return getRequiredAgentPermissionForBuiltInTool(action.builtInToolName);
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

  if (policy.fullAccess) {
    return { level: "allow" };
  }

  if (isDestructiveCommand(normalized)) {
    return { level: "deny", reason: destructiveCommandReason };
  }

  const configuredRisk = resolveConfiguredCommandRisk(normalized, policy.rules);

  if (configuredRisk?.level === "deny" || configuredRisk?.level === "ask") {
    return configuredRisk;
  }

  if (hasShellOutputRedirection(normalized)) {
    return configuredRisk ?? { level: "ask", reason: shellOutputRedirectionReason };
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
  return /^(npm|pnpm|yarn|bun)\s+(?:(?:--prefix|--dir|--cwd|-c)(?:=|\s+)\S+\s+)*(?:i|install|ci|add|remove|uninstall|update|upgrade)\b/u.test(
    command
  );
}

// 识别会把命令输出写入文件的 shell 重定向, 让 Agent 停下来等用户确认
function hasShellOutputRedirection(command: string): boolean {
  return /(?:^|\s)(?:\d?>>?|\*>>?|>>?)\s*\S/u.test(command);
}

// 识别需要用户明确确认的 Git 写操作
function isGitMutatingCommand(command: string): boolean {
  return /^git\s+(?:add|commit|push|pull|merge|rebase|checkout|switch|restore|tag|stash)\b/u.test(command);
}

// 允许常见本地只读和验证命令自动运行
function isAllowedCommand(command: string): boolean {
  return (
    /^git\s+(?:status|diff|log|show|branch)(?:\s|$)/u.test(command) ||
    /^npm\s+(?:(?:--prefix|-c)(?:=|\s+)\S+\s+)*(?:test|t|run\s+(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^pnpm\s+(?:(?:--dir|--cwd|-c)(?:=|\s+)\S+\s+)*(?:test|run\s+(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^yarn\s+(?:(?:--cwd|-c)(?:=|\s+)\S+\s+)*(?:test|run\s+(?:test|lint|typecheck|build)|(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^bun\s+(?:(?:--cwd|-c)(?:=|\s+)\S+\s+)*(?:test|run\s+(?:test|lint|typecheck|build))(?:\s|$)/u.test(command) ||
    /^cargo\s+test(?:\s+--manifest-path\s+\S+)?(?:\s|$)/u.test(command) ||
    /^go\s+(?:-c\s+\S+\s+)?test\s+\.\/\.\.\.(?:\s|$)/u.test(command) ||
    /^(npx\s+)?(?:vitest|tsc|eslint)(?:\s|$)/u.test(command) ||
    /^(rg|git\s+grep|get-childitem|dir|ls)(?:\s|$)/u.test(command) ||
    isAllowedPowerShellPipelineHelperCommand(command)
  );
}

// 只允许无脚本块的 PowerShell 管道整理命令, 避免自动执行任意脚本块
function isAllowedPowerShellPipelineHelperCommand(command: string): boolean {
  return (
    !/[{}]/u.test(command) &&
    /^(select-object|where-object|sort-object|measure-object|format-table|format-list|out-string)(?:\s|$)/u.test(
      command
    )
  );
}
