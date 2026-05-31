// 本文件说明: 持久化通用偏好和命令安全规则
const generalPreferencesStorageKey = "forge.generalPreferences";

type WorkMode = "code" | "daily";
type DefaultOpenTarget = "recent-project" | "blank";
type AgentRuntime = "windows-native" | "wsl";
type TerminalShell = "powershell" | "cmd" | "git-bash";
type ComposerSubmitShortcut = "enter" | "ctrl-enter";
export type CommandSafetyRuleLevel = "allow" | "ask" | "deny";

export const minCommandTimeoutSeconds = 15;
export const maxCommandTimeoutSeconds = 1800;

export type CommandSafetyRule = {
  id: string;
  pattern: string;
  level: CommandSafetyRuleLevel;
  reason: string;
};

export const defaultCommandSafetyRuleReason = "matched configured command policy";
export const agentApprovedCommandRuleReason = "approved from agent confirmation queue";

export type GeneralPreferences = {
  workMode: WorkMode;
  defaultOpenTarget: DefaultOpenTarget;
  agentRuntime: AgentRuntime;
  terminalShell: TerminalShell;
  composerSubmitShortcut: ComposerSubmitShortcut;
  commandTimeoutSeconds: number;
  autoRunSafeActions: boolean;
  autoReview: boolean;
  defaultPermission: boolean;
  showProcessedSummary: boolean;
  expandProcessedSummary: boolean;
  backgroundImageDataUrl: string | null;
  backgroundOpacity: number;
  commandSafetyRules: CommandSafetyRule[];
  fullAccess: boolean;
  readOnly: boolean;
  telemetry: boolean;
};

// 创建通用偏好的默认值, 首次启动和坏数据回退都使用这里
export function createDefaultGeneralPreferences(): GeneralPreferences {
  return {
    workMode: "code",
    defaultOpenTarget: "recent-project",
    agentRuntime: "windows-native",
    terminalShell: "powershell",
    composerSubmitShortcut: "enter",
    commandTimeoutSeconds: 120,
    autoRunSafeActions: true,
    autoReview: true,
    defaultPermission: true,
    showProcessedSummary: true,
    expandProcessedSummary: false,
    backgroundImageDataUrl: null,
    backgroundOpacity: 0.18,
    commandSafetyRules: [],
    fullAccess: false,
    readOnly: false,
    telemetry: false
  };
}

// 用局部补丁更新偏好, 同时收敛权限和命令规则字段
export function updateGeneralPreferences(
  preferences: GeneralPreferences,
  patch: Partial<GeneralPreferences>
): GeneralPreferences {
  return normalizePermissionPreferences({
    ...preferences,
    ...patch
  });
}

// 从一次命令审批创建精确 allow 规则, 避免把宽泛模式误加入自动执行白名单
export function createExactCommandAllowRule(
  command: string,
  deps: { createId?: () => string } = {}
): CommandSafetyRule | null {
  const pattern = normalizeCommandPattern(command);

  if (!pattern || pattern.length > 160) {
    return null;
  }

  return {
    id: deps.createId?.() ?? createCommandSafetyRuleId("agent-allow"),
    pattern,
    level: "allow",
    reason: agentApprovedCommandRuleReason
  };
}

// 追加命令安全规则时去重, 让重复批准同一精确命令不会刷出多条配置
export function appendCommandSafetyRule(
  preferences: GeneralPreferences,
  rule: CommandSafetyRule
): GeneralPreferences {
  const normalizedRule = normalizeCommandSafetyRule(rule, preferences.commandSafetyRules.length);

  if (!normalizedRule) {
    return preferences;
  }

  const existingRule = preferences.commandSafetyRules.find(
    (candidate) =>
      candidate.pattern === normalizedRule.pattern && candidate.level === normalizedRule.level
  );

  if (existingRule) {
    return preferences;
  }

  return updateGeneralPreferences(preferences, {
    commandSafetyRules: [...preferences.commandSafetyRules, normalizedRule]
  });
}

// 从 localStorage 读取偏好并做结构校验
export function loadGeneralPreferences(storage: Storage): GeneralPreferences {
  const rawValue = storage.getItem(generalPreferencesStorageKey);

  if (!rawValue) {
    return createDefaultGeneralPreferences();
  }

  try {
    const value = JSON.parse(rawValue) as unknown;
    return isPersistedGeneralPreferences(value)
      ? normalizePermissionPreferences({ ...createDefaultGeneralPreferences(), ...value })
      : createDefaultGeneralPreferences();
  } catch {
    return createDefaultGeneralPreferences();
  }
}

// 兼容旧版权限字段, 并保持命令安全规则可用
function normalizePermissionPreferences(preferences: GeneralPreferences): GeneralPreferences {
  const fullAccess = Boolean(preferences.fullAccess);

  return {
    ...preferences,
    composerSubmitShortcut: normalizeComposerSubmitShortcut(preferences.composerSubmitShortcut),
    commandTimeoutSeconds: clampCommandTimeoutSeconds(preferences.commandTimeoutSeconds),
    defaultPermission: true,
    autoReview: true,
    fullAccess,
    readOnly: !fullAccess && Boolean(preferences.readOnly),
    commandSafetyRules: normalizeCommandSafetyRules(preferences.commandSafetyRules)
  };
}

// 保存通用偏好, 刷新后保持用户选择
export function saveGeneralPreferences(storage: Storage, preferences: GeneralPreferences): void {
  storage.setItem(generalPreferencesStorageKey, JSON.stringify(normalizePermissionPreferences(preferences)));
}

// 校验持久化偏好对象, 坏数据不会进入运行状态
function isPersistedGeneralPreferences(value: unknown): value is Partial<GeneralPreferences> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (!("workMode" in value) || value.workMode === "code" || value.workMode === "daily") &&
    (!("defaultOpenTarget" in value) ||
      value.defaultOpenTarget === "recent-project" ||
      value.defaultOpenTarget === "blank") &&
    (!("agentRuntime" in value) ||
      value.agentRuntime === "windows-native" ||
      value.agentRuntime === "wsl") &&
    (!("terminalShell" in value) ||
      value.terminalShell === "powershell" ||
      value.terminalShell === "cmd" ||
      value.terminalShell === "git-bash") &&
    (!("composerSubmitShortcut" in value) ||
      value.composerSubmitShortcut === "enter" ||
      value.composerSubmitShortcut === "ctrl-enter") &&
    (!("commandTimeoutSeconds" in value) ||
      (typeof value.commandTimeoutSeconds === "number" &&
        Number.isFinite(value.commandTimeoutSeconds))) &&
    (!("autoRunSafeActions" in value) || typeof value.autoRunSafeActions === "boolean") &&
    (!("autoReview" in value) || typeof value.autoReview === "boolean") &&
    (!("defaultPermission" in value) || typeof value.defaultPermission === "boolean") &&
    (!("showProcessedSummary" in value) || typeof value.showProcessedSummary === "boolean") &&
    (!("expandProcessedSummary" in value) || typeof value.expandProcessedSummary === "boolean") &&
    (!("backgroundImageDataUrl" in value) ||
      value.backgroundImageDataUrl === null ||
      (typeof value.backgroundImageDataUrl === "string" &&
        value.backgroundImageDataUrl.startsWith("data:image/"))) &&
    (!("backgroundOpacity" in value) ||
      (typeof value.backgroundOpacity === "number" &&
        Number.isFinite(value.backgroundOpacity) &&
        value.backgroundOpacity >= 0 &&
        value.backgroundOpacity <= 0.6)) &&
    (!("commandSafetyRules" in value) || Array.isArray(value.commandSafetyRules)) &&
    (!("fullAccess" in value) || typeof value.fullAccess === "boolean") &&
    (!("readOnly" in value) || typeof value.readOnly === "boolean") &&
    (!("telemetry" in value) || typeof value.telemetry === "boolean")
  );
}

// 将命令超时限制在可用范围, 避免设置异常导致命令立刻失败或长时间挂起
export function clampCommandTimeoutSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return createDefaultGeneralPreferences().commandTimeoutSeconds;
  }

  return Math.min(
    Math.max(Math.round(value), minCommandTimeoutSeconds),
    maxCommandTimeoutSeconds
  );
}

// 兼容坏数据和未来迁移, 发送快捷键只允许两种明确模式
function normalizeComposerSubmitShortcut(value: unknown): ComposerSubmitShortcut {
  return value === "ctrl-enter" ? "ctrl-enter" : "enter";
}

// 归一化命令安全规则列表, 丢弃空模式和无效级别
function normalizeCommandSafetyRules(rules: CommandSafetyRule[]): CommandSafetyRule[] {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules
    .slice(0, 50)
    .map((rule, index) => normalizeCommandSafetyRule(rule, index))
    .filter((rule): rule is CommandSafetyRule => Boolean(rule));
}

// 归一化单条命令安全规则, 保证运行时只处理干净字段
function normalizeCommandSafetyRule(rule: unknown, index: number): CommandSafetyRule | null {
  if (!isRecord(rule)) {
    return null;
  }

  if (rule.level !== "allow" && rule.level !== "ask" && rule.level !== "deny") {
    return null;
  }

  const pattern = normalizeTextField(rule.pattern, 160);

  if (!pattern) {
    return null;
  }

  return {
    id: normalizeTextField(rule.id, 80) || `command-rule-${index + 1}`,
    pattern,
    level: rule.level,
    reason: normalizeTextField(rule.reason, 220) || defaultCommandSafetyRuleReason
  };
}

// 收敛文本字段长度和空白, 避免坏数据撑开设置页
function normalizeTextField(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// 将 unknown 缩窄成普通对象, 方便字段校验
// 命令规则按执行器的匹配方式收敛空白, 让保存的精确规则能命中同一条命令
function normalizeCommandPattern(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

// 生成本地规则 id, 不依赖 React 组件中的设置页实现
function createCommandSafetyRuleId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 将 unknown 缩小为普通对象, 方便偏好字段校验
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
