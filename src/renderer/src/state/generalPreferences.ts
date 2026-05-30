// 本文件说明: 持久化通用偏好, 包括权限模式和软件背景
const generalPreferencesStorageKey = "forge.generalPreferences";

export type WorkMode = "code" | "daily";
export type DefaultOpenTarget = "recent-project" | "blank";
export type AgentRuntime = "windows-native" | "wsl";
export type TerminalShell = "powershell" | "cmd" | "git-bash";

export type GeneralPreferences = {
  workMode: WorkMode;
  defaultOpenTarget: DefaultOpenTarget;
  agentRuntime: AgentRuntime;
  terminalShell: TerminalShell;
  autoReview: boolean;
  defaultPermission: boolean;
  backgroundImageDataUrl: string | null;
  backgroundOpacity: number;
  fullAccess: boolean;
  telemetry: boolean;
};

// 创建通用偏好的默认值, 首次启动和损坏数据都回退到这里
export function createDefaultGeneralPreferences(): GeneralPreferences {
  return {
    workMode: "code",
    defaultOpenTarget: "recent-project",
    agentRuntime: "windows-native",
    terminalShell: "powershell",
    autoReview: true,
    defaultPermission: true,
    backgroundImageDataUrl: null,
    backgroundOpacity: 0.18,
    fullAccess: false,
    telemetry: false
  };
}

// 用局部补丁更新偏好, 背景和权限都共享这个入口
export function updateGeneralPreferences(
  preferences: GeneralPreferences,
  patch: Partial<GeneralPreferences>
): GeneralPreferences {
  return normalizePermissionPreferences({
    ...preferences,
    ...patch
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

// 兼容旧版权限字段, 目前只保留自动审查和完全访问权限
function normalizePermissionPreferences(preferences: GeneralPreferences): GeneralPreferences {
  return {
    ...preferences,
    defaultPermission: true,
    autoReview: true,
    fullAccess: preferences.fullAccess
  };
}

// 保存通用偏好, 让设置页刷新后保持用户选择
export function saveGeneralPreferences(storage: Storage, preferences: GeneralPreferences): void {
  storage.setItem(generalPreferencesStorageKey, JSON.stringify(preferences));
}

// 校验持久化偏好对象, 坏数据不会进入运行态
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
    (!("autoReview" in value) || typeof value.autoReview === "boolean") &&
    (!("defaultPermission" in value) || typeof value.defaultPermission === "boolean") &&
    (!("backgroundImageDataUrl" in value) ||
      value.backgroundImageDataUrl === null ||
      (typeof value.backgroundImageDataUrl === "string" &&
        value.backgroundImageDataUrl.startsWith("data:image/"))) &&
    (!("backgroundOpacity" in value) ||
      (typeof value.backgroundOpacity === "number" &&
        Number.isFinite(value.backgroundOpacity) &&
        value.backgroundOpacity >= 0 &&
        value.backgroundOpacity <= 0.6)) &&
    (!("fullAccess" in value) || typeof value.fullAccess === "boolean") &&
    (!("telemetry" in value) || typeof value.telemetry === "boolean")
  );
}

// 将 unknown 缩窄成普通对象, 方便做字段校验
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
