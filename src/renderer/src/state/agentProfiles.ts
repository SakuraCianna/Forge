// 本文件说明: 渲染状态 Agent 配置状态
import type { AgentProfileContext } from "@shared/agentTypes";

const agentProfileStorageKey = "forge.agentProfiles";

export type AgentProfilePermissionMode = "auto" | "full";
export type AgentProfileTool = "read" | "edit" | "command" | "git";

export type AgentProfileTools = Record<AgentProfileTool, boolean>;

export type AgentProfile = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  permissionMode: AgentProfilePermissionMode;
  tools: AgentProfileTools;
  contextBudget: number;
  active: boolean;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentProfilePatch = Partial<
  Pick<AgentProfile, "name" | "description" | "systemPrompt" | "permissionMode" | "tools" | "contextBudget">
>;

const defaultProfileTimestamp = "2026-05-30T00:00:00.000Z";

const defaultProfiles: AgentProfile[] = [
  {
    id: "build",
    name: "编码 Agent",
    description: "完整编码任务, 包含受控编辑和验证",
    systemPrompt:
      "先阅读项目, 保持现有代码风格, 用小而可审查的步骤实现用户请求, 修改后运行相关命令验证",
    permissionMode: "auto",
    tools: {
      read: true,
      edit: true,
      command: true,
      git: true
    },
    contextBudget: 12000,
    active: true,
    builtIn: true,
    createdAt: defaultProfileTimestamp,
    updatedAt: defaultProfileTimestamp
  },
  {
    id: "review",
    name: "审查 Agent",
    description: "只读审查风险, 回归和缺失测试",
    systemPrompt:
      "审查当前代码中的缺陷, 回归, 不安全行为和缺失验证, 优先输出具体问题",
    permissionMode: "auto",
    tools: {
      read: true,
      edit: false,
      command: false,
      git: true
    },
    contextBudget: 16000,
    active: false,
    builtIn: true,
    createdAt: defaultProfileTimestamp,
    updatedAt: defaultProfileTimestamp
  },
  {
    id: "docs",
    name: "文档 Agent",
    description: "编写文档和解释, 不运行命令",
    systemPrompt:
      "编写清晰文档和解释, 保持项目现有语言和结构",
    permissionMode: "auto",
    tools: {
      read: true,
      edit: true,
      command: false,
      git: false
    },
    contextBudget: 10000,
    active: false,
    builtIn: true,
    createdAt: defaultProfileTimestamp,
    updatedAt: defaultProfileTimestamp
  }
];

const legacyDefaultProfileText: Record<
  string,
  Pick<AgentProfile, "name" | "description" | "systemPrompt">
> = {
  build: {
    name: "Build agent",
    description: "Full coding work with guarded edits and verification",
    systemPrompt:
      "Implement requested code changes with small, reviewable steps. Read the project first, preserve local style, and verify with relevant commands."
  },
  review: {
    name: "Review agent",
    description: "Read-only review focused on risks, regressions, and missing tests",
    systemPrompt:
      "Review the current code for bugs, regressions, unsafe behavior, and missing verification. Lead with concrete findings."
  },
  docs: {
    name: "Docs agent",
    description: "Documentation and explanation work without command execution",
    systemPrompt:
      "Write clear documentation and explanations that match the project's existing language and structure."
  }
};

export function createDefaultAgentProfiles(): AgentProfile[] {
  return defaultProfiles.map((profile) => ({ ...profile, tools: { ...profile.tools } }));
}

export function loadAgentProfiles(storage: Storage): AgentProfile[] {
  const rawValue = storage.getItem(agentProfileStorageKey);

  if (!rawValue) {
    return createDefaultAgentProfiles();
  }

  try {
    const value = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(value)) {
      return createDefaultAgentProfiles();
    }

    const persistedProfiles = value
      .filter(isPersistedAgentProfile)
      .map(migrateBuiltInProfileText)
      .map(normalizeAgentProfile);

    return ensureActiveProfile(persistedProfiles.length > 0 ? persistedProfiles : createDefaultAgentProfiles());
  } catch {
    return createDefaultAgentProfiles();
  }
}

export function saveAgentProfiles(storage: Storage, profiles: AgentProfile[]): void {
  storage.setItem(agentProfileStorageKey, JSON.stringify(ensureActiveProfile(profiles)));
}

export function getActiveAgentProfile(profiles: AgentProfile[]): AgentProfile {
  const normalizedProfiles = ensureActiveProfile(
    profiles.length > 0 ? profiles : createDefaultAgentProfiles()
  );

  return normalizedProfiles.find((profile) => profile.active) ?? normalizedProfiles[0];
}

export function getActiveAgentProfileContext(profiles: AgentProfile[]): AgentProfileContext {
  const activeProfile = getActiveAgentProfile(profiles);

  return {
    id: activeProfile.id,
    name: activeProfile.name,
    description: activeProfile.description,
    instructions: activeProfile.systemPrompt,
    permissionMode: activeProfile.permissionMode,
    enabledTools: getEnabledAgentTools(activeProfile.tools),
    contextBudget: activeProfile.contextBudget
  };
}

export function selectAgentProfile(profiles: AgentProfile[], profileId: string): AgentProfile[] {
  if (!profiles.some((profile) => profile.id === profileId)) {
    return ensureActiveProfile(profiles);
  }

  return profiles.map((profile) => ({
    ...profile,
    active: profile.id === profileId
  }));
}

export function updateAgentProfile(
  profiles: AgentProfile[],
  profileId: string,
  patch: AgentProfilePatch,
  now = () => new Date().toISOString()
): AgentProfile[] {
  return ensureActiveProfile(
    profiles.map((profile) =>
      profile.id === profileId
        ? normalizeAgentProfile({
            ...profile,
            ...patch,
            tools: patch.tools ? { ...profile.tools, ...patch.tools } : profile.tools,
            updatedAt: now()
          })
        : profile
    )
  );
}

function ensureActiveProfile(profiles: AgentProfile[]): AgentProfile[] {
  const normalizedProfiles = (profiles.length > 0 ? profiles : createDefaultAgentProfiles()).map(
    normalizeAgentProfile
  );
  const activeIndex = normalizedProfiles.findIndex((profile) => profile.active);

  if (activeIndex < 0) {
    return normalizedProfiles.map((profile, index) => ({ ...profile, active: index === 0 }));
  }

  return normalizedProfiles.map((profile, index) => ({ ...profile, active: index === activeIndex }));
}

function normalizeAgentProfile(profile: AgentProfile): AgentProfile {
  const contextBudget = Number.isFinite(profile.contextBudget)
    ? Math.min(64000, Math.max(2000, Math.round(profile.contextBudget)))
    : 12000;

  return {
    ...profile,
    name: normalizeText(profile.name) || "Agent profile",
    description: normalizeText(profile.description),
    systemPrompt: normalizeText(profile.systemPrompt),
    permissionMode: profile.permissionMode === "full" ? "full" : "auto",
    tools: normalizeTools(profile.tools),
    contextBudget
  };
}

function migrateBuiltInProfileText(profile: AgentProfile): AgentProfile {
  const defaultProfile = defaultProfiles.find((candidate) => candidate.id === profile.id);
  const legacyProfileText = legacyDefaultProfileText[profile.id];

  if (!profile.builtIn || !defaultProfile || !legacyProfileText) {
    return profile;
  }

  // 内置 Agent 迁移只覆盖旧默认文案, 避免覆盖用户手动修改
  return {
    ...profile,
    name: profile.name === legacyProfileText.name ? defaultProfile.name : profile.name,
    description:
      profile.description === legacyProfileText.description
        ? defaultProfile.description
        : profile.description,
    systemPrompt:
      profile.systemPrompt === legacyProfileText.systemPrompt
        ? defaultProfile.systemPrompt
        : profile.systemPrompt
  };
}

function normalizeTools(tools: AgentProfileTools): AgentProfileTools {
  return {
    read: Boolean(tools.read),
    edit: Boolean(tools.edit),
    command: Boolean(tools.command),
    git: Boolean(tools.git)
  };
}

function getEnabledAgentTools(tools: AgentProfileTools): string[] {
  return (["read", "edit", "command", "git"] as const).filter((tool) => tools[tool]);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isPersistedAgentProfile(value: unknown): value is AgentProfile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.systemPrompt === "string" &&
    (value.permissionMode === "auto" || value.permissionMode === "full") &&
    isRecord(value.tools) &&
    typeof value.contextBudget === "number" &&
    typeof value.active === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (!("builtIn" in value) || typeof value.builtIn === "boolean")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
