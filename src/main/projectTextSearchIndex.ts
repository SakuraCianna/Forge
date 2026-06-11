// 本文件说明: 为受控文本搜索维护本地内存索引, 避免重复读取未变化的项目文本文件
import type { Stats } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import type {
  ProjectTextSearchMatch,
  ProjectTextSearchRequest,
  ProjectTextSearchResult
} from "../shared/fileTypes.js";
import { isSensitiveProjectPath } from "../shared/sensitiveProjectFiles.js";
import { readCachedSortedDirectoryEntries } from "./projectDirectoryEntriesCache.js";
import { createProjectIgnoreMatcher } from "./projectIgnore.js";
import {
  createProjectTextSearchIndexCache,
  type ProjectTextSearchIndexCache,
  type ProjectTextSearchIndexCacheEntry
} from "./projectTextSearchIndexCache.js";

type ProjectTextIndexEntry = {
  lowerLines: string[];
  modifiedAtMs: number;
  relativePath: string;
  size: number;
  lines: string[];
};

type ProjectTextSearchIndex = {
  entries: ProjectTextIndexEntry[];
  maxFileBytes: number;
  rootPath: string;
  tokenLineReferences: Map<string, ProjectTextLineReference[]>;
};

type ProjectTextLineReference = {
  entryIndex: number;
  lineIndex: number;
};

const maxSearchPreviewChars = 240;
const maxCachedProjectTextSearchIndexes = 6;
const projectTextSearchIndexes = new Map<string, ProjectTextSearchIndex>();
let projectTextSearchIndexCache: ProjectTextSearchIndexCache | null = null;

export function configureProjectTextSearchIndex({
  directory
}: {
  directory: string | null;
}): void {
  projectTextSearchIndexCache = directory ? createProjectTextSearchIndexCache({ directory }) : null;
}

export async function searchProjectTextFiles({
  projectRoot,
  query,
  limit = 80,
  maxFileBytes = 256000
}: ProjectTextSearchRequest): Promise<ProjectTextSearchResult> {
  const normalizedQuery = normalizeSearchQuery(query);
  const resultLimit = Math.min(200, Math.max(1, Math.round(limit)));
  const resolvedProjectRoot = await realpath(projectRoot);
  const index = await buildProjectTextSearchIndex(resolvedProjectRoot, maxFileBytes);
  const matches: ProjectTextSearchMatch[] = [];

  return {
    query: normalizedQuery,
    matches,
    truncated: collectSearchMatchesFromIndex(index, normalizedQuery, matches, resultLimit)
  };
}

// 测试和未来项目切换清理可复用这个入口, 避免长期持有旧项目的大量文本内容
export function clearProjectTextSearchIndex(rootPath?: string): void {
  if (!rootPath) {
    projectTextSearchIndexes.clear();
    return;
  }

  for (const cacheKey of projectTextSearchIndexes.keys()) {
    if (cacheKey.startsWith(`${rootPath}\u0000`)) {
      projectTextSearchIndexes.delete(cacheKey);
    }
  }
}

async function buildProjectTextSearchIndex(
  resolvedProjectRoot: string,
  maxFileBytes: number
): Promise<ProjectTextSearchIndex> {
  const normalizedMaxFileBytes = Math.max(1, Math.round(maxFileBytes));
  const cacheKey = createTextSearchIndexCacheKey(resolvedProjectRoot, normalizedMaxFileBytes);
  const memoryIndex = projectTextSearchIndexes.get(cacheKey);
  const persistedIndex = memoryIndex
    ? null
    : await projectTextSearchIndexCache
        ?.read(resolvedProjectRoot, normalizedMaxFileBytes)
        .catch(() => null);
  const previousEntries = new Map(
    (memoryIndex?.entries ?? createProjectTextIndexEntriesFromCache(persistedIndex?.entries ?? []))
      .map((entry) => [entry.relativePath, entry])
  );
  const ignoreMatcher = await createProjectIgnoreMatcher(resolvedProjectRoot);
  const entries: ProjectTextIndexEntry[] = [];

  // 仍然每次按目录确认可见文件集合, 但未变化文件直接复用内存文本快照
  async function walk(directoryPath: string): Promise<void> {
    for (const entry of await readCachedSortedDirectoryEntries(directoryPath)) {
      const absolutePath = `${directoryPath}${sep}${entry.name}`;
      const relativePath = normalizeRelativePath(relative(resolvedProjectRoot, absolutePath));

      if (entry.isDirectory) {
        if (isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, true)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile || isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, false)) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      const textEntry = await readTextIndexEntry(
        absolutePath,
        relativePath,
        fileStat,
        normalizedMaxFileBytes,
        previousEntries.get(relativePath)
      );

      if (textEntry) {
        entries.push(textEntry);
      }
    }
  }

  await walk(resolvedProjectRoot);

  const index = {
    entries,
    maxFileBytes: normalizedMaxFileBytes,
    rootPath: resolvedProjectRoot,
    tokenLineReferences: createTokenLineReferences(entries)
  };

  rememberProjectTextSearchIndex(cacheKey, index);
  void projectTextSearchIndexCache?.write({
    entries: createProjectTextSearchIndexCacheEntries(entries),
    maxFileBytes: normalizedMaxFileBytes,
    rootPath: resolvedProjectRoot
  }).catch(() => undefined);
  return index;
}

async function readTextIndexEntry(
  absolutePath: string,
  relativePath: string,
  fileStat: Stats,
  maxFileBytes: number,
  previousEntry: ProjectTextIndexEntry | undefined
): Promise<ProjectTextIndexEntry | null> {
  const modifiedAtMs = fileStat.mtimeMs;

  if (fileStat.size > maxFileBytes) {
    return null;
  }

  if (
    previousEntry &&
    previousEntry.size === fileStat.size &&
    previousEntry.modifiedAtMs === modifiedAtMs
  ) {
    return previousEntry;
  }

  const content = await readFile(absolutePath, "utf8");

  if (content.includes("\u0000")) {
    return null;
  }

  const lines = content.split(/\r?\n/u);

  return {
    lines,
    lowerLines: lines.map((line) => line.toLocaleLowerCase()),
    modifiedAtMs,
    relativePath,
    size: fileStat.size
  };
}

function createTokenLineReferences(
  entries: ProjectTextIndexEntry[]
): Map<string, ProjectTextLineReference[]> {
  const references = new Map<string, ProjectTextLineReference[]>();

  for (const [entryIndex, entry] of entries.entries()) {
    for (const [lineIndex, lowerLine] of entry.lowerLines.entries()) {
      // 同一行重复出现同一词只需要一个候选引用, 搜索结果仍以行作为最小单位
      for (const token of new Set(extractAsciiSearchTokens(lowerLine))) {
        const tokenReferences = references.get(token) ?? [];
        tokenReferences.push({ entryIndex, lineIndex });
        references.set(token, tokenReferences);
      }
    }
  }

  return references;
}

function createProjectTextIndexEntriesFromCache(
  entries: ProjectTextSearchIndexCacheEntry[]
): ProjectTextIndexEntry[] {
  return entries.map((entry) => ({
    ...entry,
    lowerLines: entry.lines.map((line) => line.toLocaleLowerCase())
  }));
}

function createProjectTextSearchIndexCacheEntries(
  entries: ProjectTextIndexEntry[]
): ProjectTextSearchIndexCacheEntry[] {
  return entries.map((entry) => ({
    lines: entry.lines,
    modifiedAtMs: entry.modifiedAtMs,
    relativePath: entry.relativePath,
    size: entry.size
  }));
}

function collectSearchMatchesFromIndex(
  index: ProjectTextSearchIndex,
  query: string,
  matches: ProjectTextSearchMatch[],
  limit: number
): boolean {
  const normalizedQuery = query.toLocaleLowerCase();
  const candidateLineReferences = selectCandidateLineReferences(index, normalizedQuery);

  if (candidateLineReferences) {
    return collectSearchMatchesFromCandidateLines(
      index,
      candidateLineReferences,
      normalizedQuery,
      matches,
      limit
    );
  }

  return collectSearchMatchesByFullScan(index.entries, normalizedQuery, matches, limit);
}

function selectCandidateLineReferences(
  index: ProjectTextSearchIndex,
  normalizedQuery: string
): ProjectTextLineReference[] | null {
  const queryTokens = extractAsciiSearchTokens(normalizedQuery);

  if (queryTokens.length === 0) {
    return null;
  }

  let rarestTokenReferences: ProjectTextLineReference[] | null = null;

  for (const token of queryTokens) {
    const tokenReferences = index.tokenLineReferences.get(token);

    if (!tokenReferences) {
      return [];
    }

    if (!rarestTokenReferences || tokenReferences.length < rarestTokenReferences.length) {
      rarestTokenReferences = tokenReferences;
    }
  }

  return rarestTokenReferences ?? null;
}

function collectSearchMatchesFromCandidateLines(
  index: ProjectTextSearchIndex,
  candidateLineReferences: ProjectTextLineReference[],
  normalizedQuery: string,
  matches: ProjectTextSearchMatch[],
  limit: number
): boolean {
  for (const reference of candidateLineReferences) {
    const entry = index.entries[reference.entryIndex];

    if (entry.lowerLines[reference.lineIndex]?.includes(normalizedQuery)) {
      pushSearchMatch(entry, reference.lineIndex, matches);

      if (matches.length >= limit) {
        return true;
      }
    }
  }

  return false;
}

function collectSearchMatchesByFullScan(
  entries: ProjectTextIndexEntry[],
  normalizedQuery: string,
  matches: ProjectTextSearchMatch[],
  limit: number
): boolean {
  for (const entry of entries) {
    if (collectSearchMatchesFromIndexEntry(entry, normalizedQuery, matches, limit)) {
      return true;
    }
  }

  return false;
}

function collectSearchMatchesFromIndexEntry(
  entry: ProjectTextIndexEntry,
  query: string,
  matches: ProjectTextSearchMatch[],
  limit: number
): boolean {
  const normalizedQuery = query.toLocaleLowerCase();

  for (const [index, lowerLine] of entry.lowerLines.entries()) {
    if (!lowerLine.includes(normalizedQuery)) {
      continue;
    }

    if (matches.length >= limit) {
      return true;
    }

    pushSearchMatch(entry, index, matches);
  }

  return false;
}

function pushSearchMatch(
  entry: ProjectTextIndexEntry,
  lineIndex: number,
  matches: ProjectTextSearchMatch[]
): void {
  matches.push({
    relativePath: entry.relativePath,
    lineNumber: lineIndex + 1,
    preview: entry.lines[lineIndex].trim().slice(0, maxSearchPreviewChars)
  });
}

function rememberProjectTextSearchIndex(cacheKey: string, index: ProjectTextSearchIndex): void {
  projectTextSearchIndexes.delete(cacheKey);
  projectTextSearchIndexes.set(cacheKey, index);

  while (projectTextSearchIndexes.size > maxCachedProjectTextSearchIndexes) {
    const oldestCacheKey = projectTextSearchIndexes.keys().next().value;

    if (typeof oldestCacheKey !== "string") {
      return;
    }

    projectTextSearchIndexes.delete(oldestCacheKey);
  }
}

function extractAsciiSearchTokens(value: string): string[] {
  return [...new Set(value.match(/[a-z0-9_]{2,}/giu)?.map((token) => token.toLocaleLowerCase()) ?? [])];
}

function normalizeSearchQuery(query: string): string {
  const normalized = query.trim().slice(0, 160);

  if (!normalized) {
    throw new Error("Search query is required");
  }

  return normalized;
}

function createTextSearchIndexCacheKey(rootPath: string, maxFileBytes: number): string {
  return `${rootPath}\u0000${maxFileBytes}`;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}
