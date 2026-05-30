const agentMemoryStorageKey = "forge.agentMemories";
const maxMemoryContentLength = 420;

export type AgentMemoryScope = "global" | "project";

export type AgentMemoryEntry = {
  id: string;
  scope: AgentMemoryScope;
  projectPath: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  sourceThreadId?: string;
};

export type AgentMemoryCandidate = {
  content: string;
  projectPath?: string | null;
  sourceThreadId?: string;
};

type MemoryDeps = {
  createId: () => string;
  now: () => string;
};

export function createAgentMemoryEntry(
  candidate: AgentMemoryCandidate,
  deps: MemoryDeps = defaultMemoryDeps
): AgentMemoryEntry {
  const createdAt = deps.now();
  const projectPath = normalizeProjectPath(candidate.projectPath);

  return {
    id: deps.createId(),
    scope: projectPath ? "project" : "global",
    projectPath,
    content: normalizeMemoryContent(candidate.content),
    createdAt,
    updatedAt: createdAt,
    ...(candidate.sourceThreadId ? { sourceThreadId: candidate.sourceThreadId } : {})
  };
}

export function loadAgentMemories(storage: Storage): AgentMemoryEntry[] {
  const rawValue = storage.getItem(agentMemoryStorageKey);

  if (!rawValue) {
    return [];
  }

  try {
    const value = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(isPersistedAgentMemory).map((memory) => ({
      ...memory,
      content: normalizeMemoryContent(memory.content),
      projectPath: normalizeProjectPath(memory.projectPath)
    }));
  } catch {
    return [];
  }
}

export function saveAgentMemories(storage: Storage, memories: AgentMemoryEntry[]): void {
  storage.setItem(agentMemoryStorageKey, JSON.stringify(memories));
}

export function selectRelevantAgentMemories(
  memories: AgentMemoryEntry[],
  projectPath: string | null | undefined,
  limit = 8,
  query = ""
): AgentMemoryEntry[] {
  const normalizedProjectPath = normalizeProjectPath(projectPath);
  const queryTokens = tokenizeMemoryText(query);

  return memories
    .filter(
      (memory) =>
        memory.scope === "global" ||
        (normalizedProjectPath &&
          memory.scope === "project" &&
          normalizeProjectPathForCompare(memory.projectPath) ===
            normalizeProjectPathForCompare(normalizedProjectPath))
    )
    .sort((left, right) => {
      const scoreDifference =
        scoreMemoryForQuery(right, queryTokens) - scoreMemoryForQuery(left, queryTokens);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return compareMemoryFreshness(right, left);
    })
    .slice(0, limit);
}

export function upsertAgentMemory(
  memories: AgentMemoryEntry[],
  candidate: AgentMemoryCandidate,
  deps: MemoryDeps = defaultMemoryDeps
): AgentMemoryEntry[] {
  const content = normalizeMemoryContent(candidate.content);

  if (!content) {
    return memories;
  }

  const projectPath = normalizeProjectPath(candidate.projectPath);
  const scope: AgentMemoryScope = projectPath ? "project" : "global";
  const duplicateIndex = memories.findIndex(
    (memory) =>
      memory.scope === scope &&
      normalizeProjectPathForCompare(memory.projectPath) ===
        normalizeProjectPathForCompare(projectPath) &&
      normalizeForDuplicate(memory.content) === normalizeForDuplicate(content)
  );

  if (duplicateIndex < 0) {
    return [createAgentMemoryEntry({ ...candidate, content, projectPath }, deps), ...memories];
  }

  const updatedAt = deps.now();

  return memories.map((memory, index) =>
    index === duplicateIndex
      ? {
          ...memory,
          content,
          updatedAt,
          ...(candidate.sourceThreadId ? { sourceThreadId: candidate.sourceThreadId } : {})
        }
      : memory
  );
}

export function deleteAgentMemory(memories: AgentMemoryEntry[], memoryId: string): AgentMemoryEntry[] {
  return memories.filter((memory) => memory.id !== memoryId);
}

export function extractAgentMemoryCandidate(
  prompt: string,
  projectPath?: string | null
): AgentMemoryCandidate | null {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    return null;
  }

  const explicitMatch =
    /(?:请记住|记住|以后记得|帮我记住|remember|note that)[:：,\s]*(.+)$/iu.exec(normalizedPrompt);

  if (!explicitMatch?.[1]) {
    return null;
  }

  const content = normalizeMemoryContent(explicitMatch[1]);

  if (!content || content.length < 4) {
    return null;
  }

  return {
    content,
    projectPath: normalizeProjectPath(projectPath)
  };
}

function normalizeMemoryContent(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxMemoryContentLength);
}

function normalizeProjectPath(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeProjectPathForCompare(value: string | null | undefined): string | null {
  return normalizeProjectPath(value)?.toLowerCase() ?? null;
}

function normalizeForDuplicate(value: string): string {
  return normalizeMemoryContent(value).toLowerCase();
}

function tokenizeMemoryText(value: string): Set<string> {
  const normalized = normalizeMemoryContent(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");

  return new Set(normalized.split(/\s+/).filter((token) => token.length >= 3));
}

function scoreMemoryForQuery(memory: AgentMemoryEntry, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) {
    return 0;
  }

  const contentTokens = tokenizeMemoryText(memory.content);
  let score = 0;

  // 记忆排序优先贴合当前任务, 再回退到更新时间
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function compareMemoryFreshness(left: AgentMemoryEntry, right: AgentMemoryEntry): number {
  const leftTime = Date.parse(left.updatedAt || left.createdAt);
  const rightTime = Date.parse(right.updatedAt || right.createdAt);

  return leftTime - rightTime;
}

function isPersistedAgentMemory(value: unknown): value is AgentMemoryEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.scope === "global" || value.scope === "project") &&
    (value.projectPath === null || typeof value.projectPath === "string") &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (!("sourceThreadId" in value) || typeof value.sourceThreadId === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const defaultMemoryDeps: MemoryDeps = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString()
};
