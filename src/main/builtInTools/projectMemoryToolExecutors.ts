// 本文件说明: 提供项目 MEMORY.md 内置工具的主进程读写、搜索和删除执行逻辑
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { redactSensitiveMemoryContent } from "../../shared/memoryRedaction.js";
import {
  parseManagedProjectMemoryMarkdownEntries,
  parseProjectMemoryMarkdownEntries,
  renderProjectMemoryMarkdown,
  type ProjectMemoryMarkdownEntry
} from "../../shared/projectMemoryMarkdown.js";
import { assertProjectPathNotSensitive } from "../../shared/sensitiveProjectFiles.js";

type ProjectMemoryEntry = ProjectMemoryMarkdownEntry;

export type ProjectMemoryWriteInput = {
  content: string;
  id?: string;
  tags?: string[];
};

const projectMemoryRelativePath = "MEMORY.md";
const legacyProjectMemoryRelativePath = ".forge/project-memory.json";
const maxProjectMemoryContentChars = 1_000;
const maxProjectMemoryManagedEntries = 40;
const projectMemoryMergeStopWords = new Set([
  "always",
  "and",
  "for",
  "from",
  "into",
  "must",
  "project",
  "should",
  "that",
  "the",
  "this",
  "use",
  "using",
  "with"
]);

export async function readProjectMemoryFile(projectRoot: string): Promise<Record<string, unknown>> {
  const filePath = resolveProjectRelativePath(projectRoot, projectMemoryRelativePath);
  const rawContent = await readOptionalTextFile(filePath);

  if (rawContent === null) {
    const legacyEntries = await readLegacyProjectMemoryEntries(projectRoot);

    return {
      status: "ok",
      relativePath: projectMemoryRelativePath,
      ...(legacyEntries.length > 0 ? { legacyRelativePath: legacyProjectMemoryRelativePath } : {}),
      entries: legacyEntries
    };
  }

  return {
    status: "ok",
    relativePath: projectMemoryRelativePath,
    entries: parseProjectMemoryMarkdownEntries(rawContent)
  };
}

export async function writeProjectMemoryFile(
  projectRoot: string,
  {
    content,
    id,
    tags = []
  }: ProjectMemoryWriteInput
): Promise<Record<string, unknown>> {
  const currentEntries = await readWritableProjectMemoryEntries(projectRoot);
  const now = new Date().toISOString();
  const entryId = normalizeProjectMemoryEntryId(id);
  const normalizedContent = normalizeProjectMemoryContent(content);
  const normalizedTags = normalizeProjectMemoryTags(tags);
  const existingEntry = findProjectMemoryUpsertTarget(currentEntries, entryId, normalizedContent);
  const nextEntry: ProjectMemoryEntry = {
    id: existingEntry?.id ?? entryId,
    content: normalizedContent,
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now,
    tags: mergeProjectMemoryTags(existingEntry?.tags ?? [], normalizedTags)
  };
  const entries = existingEntry
    ? currentEntries.map((entry) => (entry.id === existingEntry.id ? nextEntry : entry))
    : [...currentEntries, nextEntry];
  const boundedEntries = trimProjectMemoryEntries(entries);
  const boundedEntryIds = new Set(boundedEntries.map((entry) => entry.id));
  const prunedEntryIds = entries
    .filter((entry) => !boundedEntryIds.has(entry.id))
    .map((entry) => entry.id);

  await writeProjectMemoryEntries(projectRoot, boundedEntries);

  return {
    status: "ok",
    relativePath: projectMemoryRelativePath,
    entry: nextEntry,
    entries: boundedEntries,
    ...(prunedEntryIds.length > 0 ? { prunedEntryIds } : {})
  };
}

export async function searchProjectMemoryFile(
  projectRoot: string,
  query: string
): Promise<Record<string, unknown>> {
  const memory = await readProjectMemoryFile(projectRoot);
  const entries = Array.isArray(memory.entries)
    ? memory.entries.filter(isProjectMemoryEntry)
    : [];
  const tokens = tokenizeSearchText(query);
  const matches = entries
    .map((entry) => ({
      entry,
      score: tokens.reduce(
        (score, token) => score + (entry.content.toLocaleLowerCase().includes(token) ? 1 : 0),
        0
      )
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 20)
    .map((match) => match.entry);

  return {
    status: "ok",
    query,
    matches
  };
}

export async function deleteProjectMemoryEntry(
  projectRoot: string,
  id: string
): Promise<Record<string, unknown>> {
  const entries = await readWritableProjectMemoryEntries(projectRoot);
  const nextEntries = entries.filter((entry) => entry.id !== id);

  if (nextEntries.length === entries.length) {
    throw new Error(`Project memory entry was not found: ${id}`);
  }

  await writeProjectMemoryEntries(projectRoot, nextEntries);

  return {
    status: "ok",
    relativePath: projectMemoryRelativePath,
    deletedId: id,
    entries: nextEntries
  };
}

async function readWritableProjectMemoryEntries(projectRoot: string): Promise<ProjectMemoryEntry[]> {
  const filePath = resolveProjectRelativePath(projectRoot, projectMemoryRelativePath);
  const rawContent = await readOptionalTextFile(filePath);

  if (rawContent === null) {
    return readLegacyProjectMemoryEntries(projectRoot);
  }

  return parseManagedProjectMemoryMarkdownEntries(rawContent);
}

async function writeProjectMemoryEntries(
  projectRoot: string,
  entries: ProjectMemoryEntry[]
): Promise<void> {
  const filePath = resolveProjectRelativePath(projectRoot, projectMemoryRelativePath);
  const currentContent = await readOptionalTextFile(filePath);
  const nextContent = renderProjectMemoryMarkdown(currentContent, entries);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, nextContent, "utf8");
}

async function readOptionalTextFile(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch((error: unknown) => {
    if (isNodeErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  });
}

async function readLegacyProjectMemoryEntries(projectRoot: string): Promise<ProjectMemoryEntry[]> {
  const legacyFilePath = resolveProjectRelativePath(projectRoot, legacyProjectMemoryRelativePath);
  const rawContent = await readOptionalTextFile(legacyFilePath);

  if (rawContent === null) {
    return [];
  }

  const parsed = JSON.parse(rawContent) as { entries?: unknown };

  return Array.isArray(parsed.entries)
    ? parsed.entries.filter(isProjectMemoryEntry)
    : [];
}

function normalizeProjectMemoryEntryId(id: string | undefined): string {
  const fallbackId = `memory-${Date.now().toString(36)}`;
  const normalizedId = (id ?? fallbackId)
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);

  return normalizedId || fallbackId;
}

function normalizeProjectMemoryContent(content: string): string {
  const normalizedContent = redactSensitiveMemoryContent(content)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxProjectMemoryContentChars);

  if (!normalizedContent) {
    throw new Error("Project memory content must not be empty");
  }

  return normalizedContent;
}

function findProjectMemoryUpsertTarget(
  entries: ProjectMemoryEntry[],
  entryId: string,
  content: string
): ProjectMemoryEntry | null {
  const exactIdEntry = entries.find((entry) => entry.id === entryId);

  if (exactIdEntry) {
    return exactIdEntry;
  }

  return entries.find((entry) => isSimilarProjectMemoryContent(entry.content, content)) ?? null;
}

function isSimilarProjectMemoryContent(left: string, right: string): boolean {
  const leftTokens = createProjectMemoryMergeTokens(left);
  const rightTokens = createProjectMemoryMergeTokens(right);

  if (leftTokens.size < 3 || rightTokens.size < 3) {
    return false;
  }

  let sharedTokenCount = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      sharedTokenCount += 1;
    }
  }

  const smallerTokenCount = Math.min(leftTokens.size, rightTokens.size);

  return sharedTokenCount >= 3 && sharedTokenCount / smallerTokenCount >= 0.75;
}

function createProjectMemoryMergeTokens(content: string): Set<string> {
  return new Set(
    tokenizeSearchText(content)
      .map((token) => token.toLocaleLowerCase())
      .filter((token) => token.length >= 3 && !projectMemoryMergeStopWords.has(token))
  );
}

function mergeProjectMemoryTags(existingTags: string[], incomingTags: string[]): string[] {
  return normalizeProjectMemoryTags([...existingTags, ...incomingTags]);
}

function trimProjectMemoryEntries(entries: ProjectMemoryEntry[]): ProjectMemoryEntry[] {
  if (entries.length <= maxProjectMemoryManagedEntries) {
    return entries;
  }

  const removableEntryIds = new Set(
    [...entries]
      .filter((entry) => !isProtectedProjectMemoryEntry(entry))
      .sort(compareProjectMemoryEntriesByAge)
      .slice(0, entries.length - maxProjectMemoryManagedEntries)
      .map((entry) => entry.id)
  );

  if (removableEntryIds.size === 0) {
    return entries;
  }

  return entries.filter((entry) => !removableEntryIds.has(entry.id));
}

function isProtectedProjectMemoryEntry(entry: ProjectMemoryEntry): boolean {
  return normalizeProjectMemoryTags(entry.tags).includes("explicit");
}

function compareProjectMemoryEntriesByAge(left: ProjectMemoryEntry, right: ProjectMemoryEntry): number {
  const leftTimestamp = Date.parse(left.updatedAt);
  const rightTimestamp = Date.parse(right.updatedAt);

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  return left.id.localeCompare(right.id);
}

function normalizeProjectMemoryTags(tags: string[]): string[] {
  const seenTags = new Set<string>();
  const normalizedTags: string[] = [];

  for (const tag of tags) {
    const normalizedTag = tag
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40);

    if (!normalizedTag || seenTags.has(normalizedTag)) {
      continue;
    }

    seenTags.add(normalizedTag);
    normalizedTags.push(normalizedTag);
  }

  return normalizedTags.slice(0, 12);
}

function tokenizeSearchText(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function isProjectMemoryEntry(value: unknown): value is ProjectMemoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ProjectMemoryEntry>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every((tag) => typeof tag === "string")
  );
}

function resolveProjectRelativePath(projectRoot: string, relativePath: string): string {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");

  assertProjectPathNotSensitive(normalizedRelativePath);

  const absolutePath = resolve(projectRoot, ...normalizedRelativePath.split("/"));
  const normalizedProjectRoot = projectRoot.endsWith(sep) ? projectRoot : `${projectRoot}${sep}`;

  if (absolutePath !== projectRoot && !absolutePath.startsWith(normalizedProjectRoot)) {
    throw new Error("Path must stay inside the selected project");
  }

  return absolutePath;
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
