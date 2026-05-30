// 本文件说明: 维护 Agent 记忆的持久化, 去重, 检索和中文短词匹配
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

// 根据候选内容生成可持久化的记忆记录, 项目路径存在时自动收束到项目作用域
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

// 从 localStorage 读取记忆并做结构校验, 坏数据直接丢弃避免污染后续上下文
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

// 统一保存记忆列表, 让调用方不用关心底层存储键名
export function saveAgentMemories(storage: Storage, memories: AgentMemoryEntry[]): void {
  storage.setItem(agentMemoryStorageKey, JSON.stringify(memories));
}

// 按当前项目和用户问题挑出最相关记忆, 先匹配内容再比较更新时间
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

// 写入记忆时先按作用域和内容去重, 已存在的记录只刷新时间和来源
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

// 根据记忆 id 删除单条记录, 设置页和后续管理入口共用这个纯函数
export function deleteAgentMemory(memories: AgentMemoryEntry[], memoryId: string): AgentMemoryEntry[] {
  return memories.filter((memory) => memory.id !== memoryId);
}

// 只从明确的记忆指令里提取内容, 避免普通聊天被误存成长期记忆
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

// 统一压缩空白并限制长度, 防止单条记忆拖慢提示词拼装
function normalizeMemoryContent(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxMemoryContentLength);
}

// 把空项目路径归一成 null, 方便后面判断全局和项目作用域
function normalizeProjectPath(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

// 路径比较只做大小写归一, 不改写用户原始保存的项目路径
function normalizeProjectPathForCompare(value: string | null | undefined): string | null {
  return normalizeProjectPath(value)?.toLowerCase() ?? null;
}

// 去重比较只关心可读内容, 避免大小写差异生成重复记忆
function normalizeForDuplicate(value: string): string {
  return normalizeMemoryContent(value).toLowerCase();
}

// 同时生成英文单词 token 和中文短词 token, 让中英混合提问都能召回记忆
function tokenizeMemoryText(value: string): Set<string> {
  const normalized = normalizeMemoryContent(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  const tokens = new Set(normalized.split(/\s+/).filter((token) => token.length >= 3));

  // 中文记忆检索需要短词粒度, 否则整句 token 会让相关记忆被新旧时间覆盖
  for (const segment of normalized.match(/[\u4e00-\u9fff]+/gu) ?? []) {
    for (const gram of createChineseMemoryGrams(segment)) {
      tokens.add(gram);
    }
  }

  return tokens;
}

// 用 token 命中数量给记忆打分, 分数相同时再交给更新时间排序
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

// 为连续中文片段生成二元和三元短词, 解决中文没有空格导致的整句匹配问题
function createChineseMemoryGrams(value: string): string[] {
  const characters = Array.from(value);
  const grams: string[] = [];

  for (const size of [2, 3] as const) {
    for (let index = 0; index <= characters.length - size; index += 1) {
      grams.push(characters.slice(index, index + size).join(""));
    }
  }

  return grams;
}

// 记忆新旧比较使用 updatedAt 优先, 兼容旧记录只存在 createdAt 的情况
function compareMemoryFreshness(left: AgentMemoryEntry, right: AgentMemoryEntry): number {
  const leftTime = Date.parse(left.updatedAt || left.createdAt);
  const rightTime = Date.parse(right.updatedAt || right.createdAt);

  return leftTime - rightTime;
}

// 校验持久化数据的字段形状, 只允许完整的记忆对象回到运行态
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

// unknown 入参先缩窄成普通对象, 后续字段检查才有类型保护
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const defaultMemoryDeps: MemoryDeps = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString()
};
