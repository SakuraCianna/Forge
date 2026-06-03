// 本文件说明: 为受控文本搜索维护本地内存索引, 避免重复读取未变化的项目文本文件
import type { Stats } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import type {
  ProjectTextSearchMatch,
  ProjectTextSearchRequest,
  ProjectTextSearchResult
} from "../shared/fileTypes.js";
import { isSensitiveProjectPath } from "../shared/sensitiveProjectFiles.js";
import { createProjectIgnoreMatcher } from "./projectIgnore.js";

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
};

const maxSearchPreviewChars = 240;
const maxCachedProjectTextSearchIndexes = 6;
const projectTextSearchIndexes = new Map<string, ProjectTextSearchIndex>();

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
  let truncated = false;

  for (const entry of index.entries) {
    if (collectSearchMatchesFromIndexEntry(entry, normalizedQuery, matches, resultLimit)) {
      truncated = true;
      break;
    }
  }

  return {
    query: normalizedQuery,
    matches,
    truncated
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
  const previousEntries = new Map(
    projectTextSearchIndexes.get(cacheKey)?.entries.map((entry) => [entry.relativePath, entry]) ?? []
  );
  const ignoreMatcher = await createProjectIgnoreMatcher(resolvedProjectRoot);
  const entries: ProjectTextIndexEntry[] = [];

  // 仍然每次按目录确认可见文件集合, 但未变化文件直接复用内存文本快照
  async function walk(directoryPath: string): Promise<void> {
    for (const entry of await readSortedDirectoryEntries(directoryPath)) {
      const absolutePath = `${directoryPath}${sep}${entry.name}`;
      const relativePath = normalizeRelativePath(relative(resolvedProjectRoot, absolutePath));

      if (entry.isDirectory()) {
        if (isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, true)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, false)) {
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
    rootPath: resolvedProjectRoot
  };

  rememberProjectTextSearchIndex(cacheKey, index);
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

    matches.push({
      relativePath: entry.relativePath,
      lineNumber: index + 1,
      preview: entry.lines[index].trim().slice(0, maxSearchPreviewChars)
    });
  }

  return false;
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

function normalizeSearchQuery(query: string): string {
  const normalized = query.trim().slice(0, 160);

  if (!normalized) {
    throw new Error("Search query is required");
  }

  return normalized;
}

async function readSortedDirectoryEntries(directoryPath: string) {
  return (await readdir(directoryPath, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function createTextSearchIndexCacheKey(rootPath: string, maxFileBytes: number): string {
  return `${rootPath}\u0000${maxFileBytes}`;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}
