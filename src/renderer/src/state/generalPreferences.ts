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

export function updateGeneralPreferences(
  preferences: GeneralPreferences,
  patch: Partial<GeneralPreferences>
): GeneralPreferences {
  return normalizePermissionPreferences({
    ...preferences,
    ...patch
  });
}

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

function normalizePermissionPreferences(preferences: GeneralPreferences): GeneralPreferences {
  return {
    ...preferences,
    defaultPermission: true,
    autoReview: true,
    fullAccess: preferences.fullAccess
  };
}

export function saveGeneralPreferences(storage: Storage, preferences: GeneralPreferences): void {
  storage.setItem(generalPreferencesStorageKey, JSON.stringify(preferences));
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
