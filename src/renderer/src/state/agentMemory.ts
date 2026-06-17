// 本文件说明: 维护 Agent 记忆的持久化, 去重, 检索和中文短词匹配
import type { Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import { redactSensitiveMemoryContent } from "../../../shared/memoryRedaction.js";
import { parseProjectMemoryMarkdownEntries } from "../../../shared/projectMemoryMarkdown.js";

const agentMemoryStorageKey = "forge.agentMemories";
const maxMemoryContentLength = 420;

type AgentMemoryScope = "global" | "project";

export type AgentMemoryEntry = {
  id: string;
  scope: AgentMemoryScope;
  projectPath: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  sourceThreadId?: string;
};

type AgentMemoryCandidate = {
  content: string;
  projectPath?: string | null;
  sourceThreadId?: string;
  trigger?: "explicit" | "implicit";
};

export type ProjectMemoryWriteRequest = {
  toolName: "writeProjectMemory";
  projectRoot: string;
  input: {
    id: string;
    content: string;
    tags: string[];
  };
};

export type CompactedProjectMemorySource = {
  id: string;
  projectPath?: string | null;
  contextCompaction?: {
    content: string;
    createdAt: string;
    estimatedTokensAfter?: number;
    estimatedTokensBefore?: number;
    reason: "manual" | "auto";
    retainedEventCount?: number;
    sourceEventCount?: number;
  };
};

export type ProjectMemoryWriteFailureEvent = {
  id: string;
  kind: "error";
  message: string;
  createdAt: string;
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
    .filter((memory) => isMemoryInActiveScope(memory, normalizedProjectPath))
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

// 项目任务只允许注入当前项目记忆, 避免全局或其他项目知识串进当前项目上下文
function isMemoryInActiveScope(
  memory: AgentMemoryEntry,
  normalizedProjectPath: string | null
): boolean {
  if (!normalizedProjectPath) {
    return memory.scope === "global";
  }

  return (
    memory.scope === "project" &&
    normalizeProjectPathForCompare(memory.projectPath) ===
      normalizeProjectPathForCompare(normalizedProjectPath)
  );
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

// 将根目录 MEMORY.md 的受控区条目并入运行时记忆, 让文件记忆也能按任务相关性召回
export function mergeAgentMemoriesWithProjectScan(
  memories: AgentMemoryEntry[],
  projectScan: ProjectScanResult | null | undefined
): AgentMemoryEntry[] {
  if (!projectScan) {
    return memories;
  }

  const projectMemories = createAgentMemoriesFromProjectScan(projectScan);

  if (projectMemories.length === 0) {
    return memories;
  }

  const existingKeys = new Set(memories.map(createMemoryDuplicateKey));
  const nextMemories = [...memories];

  for (const memory of projectMemories) {
    const key = createMemoryDuplicateKey(memory);

    if (existingKeys.has(key)) {
      continue;
    }

    existingKeys.add(key);
    nextMemories.push(memory);
  }

  return nextMemories;
}

export function selectRelevantAgentMemoriesForProject({
  agentMemories,
  limit = 8,
  projectPath,
  projectScan,
  query = ""
}: {
  agentMemories: AgentMemoryEntry[];
  limit?: number;
  projectPath?: string | null;
  projectScan?: ProjectScanResult | null;
  query?: string;
}): AgentMemoryEntry[] {
  return selectRelevantAgentMemories(
    mergeAgentMemoriesWithProjectScan(agentMemories, projectScan),
    projectPath ?? projectScan?.rootPath ?? null,
    limit,
    query
  );
}

// 只从明确记忆指令或项目级长期规则里提取内容, 避免普通聊天被误存成长期记忆
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

  const content = explicitMatch?.[1]
    ? normalizeMemoryContent(redactSensitiveMemoryContent(explicitMatch[1]))
    : extractImplicitProjectMemoryContent(normalizedPrompt, projectPath);

  if (!content || content.length < 4) {
    return null;
  }

  return {
    content,
    projectPath: normalizeProjectPath(projectPath),
    trigger: explicitMatch?.[1] ? "explicit" : "implicit"
  };
}

function extractImplicitProjectMemoryContent(
  prompt: string,
  projectPath?: string | null
): string | null {
  if (!normalizeProjectPath(projectPath)) {
    return null;
  }

  const match =
    /^(?:以后|后续|今后)(?:在)?(?:这个|本)?项目(?:里|中)?[:：,，\s]*(.+)$/iu.exec(prompt) ??
    /^(?:这个|本)项目(?:里|中)?[:：,，\s]*(.+)$/iu.exec(prompt);
  const content = normalizeMemoryContent(redactSensitiveMemoryContent(match?.[1] ?? ""));

  if (!content || !isDurableProjectMemoryContent(content)) {
    return null;
  }

  return content;
}

function isDurableProjectMemoryContent(content: string): boolean {
  return (
    !looksLikeTransientProjectTask(content) &&
    hasProjectPolicyLanguage(content) &&
    hasDurableProjectMemorySignal(content)
  );
}

function hasProjectPolicyLanguage(content: string): boolean {
  return (
    /(?:必须|统一|都用|不要|禁止|优先|保持|只能|默认)/u.test(content) ||
    /\b(?:always|never|prefer|must|keep)\b/iu.test(content)
  );
}

function hasDurableProjectMemorySignal(content: string): boolean {
  return (
    /(?:规则|约定|规范|风格|提交|commit|PR|README|文档|注释|命令|PowerShell|Windows|main\/preload|renderer|IPC|fs|Git|分支|测试|质量|门禁|CI|lint|typecheck|build|npm|pnpm|yarn|环境变量|密钥|token|api_key|API key|本地测试|模型|provider|memory|MEMORY\.md|架构|目录|路径|依赖|TypeScript|any|复用|读取|查看|运行)/iu.test(
      content
    ) || /(?:都用|统一|保持|只能|不要|禁止)/u.test(content)
  );
}

function looksLikeTransientProjectTask(content: string): boolean {
  return (
    /(?:帮我|看看|报错|打不开|失败|异常|崩溃|bug|错误|卡住|不显示|不能|无法|fix|broken|error|failing|fails|crash)/iu.test(
      content
    ) ||
    /^(?:必须|优先|默认|先|继续)?(?:修复|解决|排查|处理|实现|新增|添加|支持|优化|重构|拆|推进|改|调整|更新|检查|打开|关闭|删除|创建|做|写|加|移除)/u.test(
      content
    )
  );
}

// 项目级显式记忆同步写入 MEMORY.md, 让文件记忆和本地记忆保持同一来源
export function createProjectMemoryWriteRequest(
  candidate: AgentMemoryCandidate
): ProjectMemoryWriteRequest | null {
  const projectRoot = normalizeProjectPath(candidate.projectPath);
  const content = normalizeMemoryContent(candidate.content);

  if (!projectRoot || !content) {
    return null;
  }

  return {
    toolName: "writeProjectMemory",
    projectRoot,
    input: {
      id: `${candidate.trigger === "implicit" ? "implicit" : "explicit"}-${hashMemoryContent(
        content
      )}`,
      content,
      tags: candidate.trigger === "implicit" ? ["auto-memory", "implicit"] : ["explicit"]
    }
  };
}

// 长线程压缩后把摘要沉淀到项目 MEMORY.md, 靠压缩阈值避免短会话被误存成长期记忆
export function createCompactedProjectMemoryWriteRequest(
  thread: CompactedProjectMemorySource
): ProjectMemoryWriteRequest | null {
  const projectRoot = normalizeProjectPath(thread.projectPath);
  const compaction = thread.contextCompaction;
  const content = normalizeMemoryContent(compaction?.content ?? "");

  if (!projectRoot || !compaction || content.length < 80) {
    return null;
  }

  return {
    toolName: "writeProjectMemory",
    projectRoot,
    input: {
      id: `compact-${normalizeMemoryIdSegment(thread.id)}`,
      content,
      tags: ["auto-memory", "compaction", compaction.reason]
    }
  };
}

function createAgentMemoriesFromProjectScan(projectScan: ProjectScanResult): AgentMemoryEntry[] {
  const memoryFile = projectScan.instructionFiles?.find(
    (file) => normalizeInstructionPath(file.relativePath) === "memory.md"
  );

  if (!memoryFile) {
    return [];
  }

  return parseProjectMemoryMarkdownEntries(memoryFile.content).map((entry) => ({
    id: `memory-md:${entry.id}`,
    scope: "project",
    projectPath: projectScan.rootPath,
    content: normalizeMemoryContent(entry.content),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }));
}

// MEMORY.md 写入失败需要能被用户审计, 但不应让主问答或任务队列误判为失败
export function formatProjectMemoryWriteFailure(language: Language, detail: string): string {
  return language === "zh-CN"
    ? `项目 MEMORY.md 记忆写入失败: ${detail}`
    : `Project MEMORY.md memory write failed: ${detail}`;
}

export function createProjectMemoryWriteFailureEvent({
  createdAt,
  message,
  threadId
}: {
  createdAt: string;
  message: string;
  threadId: string;
}): ProjectMemoryWriteFailureEvent {
  return {
    id: `${threadId}-memory-write-error-${createdAt}`,
    kind: "error",
    message,
    createdAt
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

function normalizeInstructionPath(value: string): string {
  return value.replace(/\\/gu, "/").toLowerCase();
}

// 去重比较只关心可读内容, 避免大小写差异生成重复记忆
function normalizeForDuplicate(value: string): string {
  return normalizeMemoryContent(value).toLowerCase();
}

function createMemoryDuplicateKey(memory: AgentMemoryEntry): string {
  return [
    memory.scope,
    normalizeProjectPathForCompare(memory.projectPath) ?? "",
    normalizeForDuplicate(memory.content)
  ].join("\0");
}

// 生成稳定短 ID, 避免同一条显式项目记忆反复写入时在 MEMORY.md 里重复堆积
function hashMemoryContent(value: string): string {
  let hash = 0x811c9dc5;

  for (const character of normalizeForDuplicate(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36);
}

function normalizeMemoryIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "thread";
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
