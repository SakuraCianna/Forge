// 本文件说明: 持久化受控文本搜索索引, 让应用重启后也能复用未变化文件的行级快照
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ProjectTextSearchIndexCacheEntry = {
  relativePath: string;
  size: number;
  modifiedAtMs: number;
  lines: string[];
};

export type ProjectTextSearchIndexCachePayload = {
  rootPath: string;
  maxFileBytes: number;
  entries: ProjectTextSearchIndexCacheEntry[];
};

type ProjectTextSearchIndexCacheFile = ProjectTextSearchIndexCachePayload & {
  cacheVersion: 1;
  indexedAt: string;
};

export type ProjectTextSearchIndexCache = {
  read: (rootPath: string, maxFileBytes: number) => Promise<ProjectTextSearchIndexCachePayload | null>;
  write: (payload: ProjectTextSearchIndexCachePayload) => Promise<void>;
};

const projectTextSearchIndexCacheVersion = 1;

export function createProjectTextSearchIndexCache({
  directory
}: {
  directory: string;
}): ProjectTextSearchIndexCache {
  return {
    read: (rootPath, maxFileBytes) => readProjectTextSearchIndexCache(directory, rootPath, maxFileBytes),
    write: (payload) => writeProjectTextSearchIndexCache(directory, payload)
  };
}

async function readProjectTextSearchIndexCache(
  directory: string,
  rootPath: string,
  maxFileBytes: number
): Promise<ProjectTextSearchIndexCachePayload | null> {
  try {
    const payload = parseProjectTextSearchIndexCacheFile(
      await readFile(resolveProjectTextSearchIndexCachePath(directory, rootPath, maxFileBytes), "utf8")
    );

    if (!payload || payload.rootPath !== rootPath || payload.maxFileBytes !== maxFileBytes) {
      return null;
    }

    return stripProjectTextSearchIndexCacheMetadata(payload);
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

async function writeProjectTextSearchIndexCache(
  directory: string,
  payload: ProjectTextSearchIndexCachePayload
): Promise<void> {
  await mkdir(directory, { recursive: true });

  const cacheFile: ProjectTextSearchIndexCacheFile = {
    ...payload,
    cacheVersion: projectTextSearchIndexCacheVersion,
    indexedAt: new Date().toISOString()
  };

  await writeFile(
    resolveProjectTextSearchIndexCachePath(directory, payload.rootPath, payload.maxFileBytes),
    `${JSON.stringify(cacheFile)}\n`,
    "utf8"
  );
}

function parseProjectTextSearchIndexCacheFile(rawValue: string): ProjectTextSearchIndexCacheFile | null {
  try {
    const value = JSON.parse(rawValue) as unknown;

    return isProjectTextSearchIndexCacheFile(value) ? value : null;
  } catch {
    return null;
  }
}

function isProjectTextSearchIndexCacheFile(value: unknown): value is ProjectTextSearchIndexCacheFile {
  return (
    isRecord(value) &&
    value.cacheVersion === projectTextSearchIndexCacheVersion &&
    typeof value.indexedAt === "string" &&
    typeof value.rootPath === "string" &&
    typeof value.maxFileBytes === "number" &&
    Number.isFinite(value.maxFileBytes) &&
    Array.isArray(value.entries) &&
    value.entries.every(isProjectTextSearchIndexCacheEntry)
  );
}

function isProjectTextSearchIndexCacheEntry(value: unknown): value is ProjectTextSearchIndexCacheEntry {
  return (
    isRecord(value) &&
    typeof value.relativePath === "string" &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    typeof value.modifiedAtMs === "number" &&
    Number.isFinite(value.modifiedAtMs) &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === "string")
  );
}

function stripProjectTextSearchIndexCacheMetadata(
  payload: ProjectTextSearchIndexCacheFile
): ProjectTextSearchIndexCachePayload {
  return {
    entries: payload.entries,
    maxFileBytes: payload.maxFileBytes,
    rootPath: payload.rootPath
  };
}

function resolveProjectTextSearchIndexCachePath(
  directory: string,
  rootPath: string,
  maxFileBytes: number
): string {
  return join(directory, `${createHash("sha256").update(`${rootPath}\u0000${maxFileBytes}`).digest("hex")}.json`);
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
