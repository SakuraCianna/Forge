import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectScanResult } from "../shared/projectTypes.js";

type ProjectIndexCacheOptions = {
  directory: string;
};

type ProjectIndexCachePayload = ProjectScanResult & {
  cacheVersion: 1;
  indexedAt: string;
};

export type ProjectIndexCache = {
  read: (rootPath: string) => Promise<ProjectScanResult | null>;
  write: (scanResult: ProjectScanResult) => Promise<void>;
};

export function createProjectIndexCache({ directory }: ProjectIndexCacheOptions): ProjectIndexCache {
  return {
    read: (rootPath) => readProjectIndexCache(directory, rootPath),
    write: (scanResult) => writeProjectIndexCache(directory, scanResult)
  };
}

async function readProjectIndexCache(
  directory: string,
  rootPath: string
): Promise<ProjectScanResult | null> {
  try {
    const payload = parseProjectIndexCachePayload(
      await readFile(resolveProjectIndexCachePath(directory, rootPath), "utf8")
    );

    return payload && payload.rootPath === rootPath ? stripCacheMetadata(payload) : null;
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

async function writeProjectIndexCache(
  directory: string,
  scanResult: ProjectScanResult
): Promise<void> {
  await mkdir(directory, { recursive: true });

  const payload: ProjectIndexCachePayload = {
    ...scanResult,
    cacheVersion: 1,
    indexedAt: new Date().toISOString()
  };

  await writeFile(
    resolveProjectIndexCachePath(directory, scanResult.rootPath),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

function parseProjectIndexCachePayload(rawValue: string): ProjectIndexCachePayload | null {
  try {
    const value = JSON.parse(rawValue) as unknown;

    if (!isProjectIndexCachePayload(value)) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function isProjectIndexCachePayload(value: unknown): value is ProjectIndexCachePayload {
  return (
    isRecord(value) &&
    value.cacheVersion === 1 &&
    typeof value.indexedAt === "string" &&
    typeof value.rootPath === "string" &&
    Array.isArray(value.files) &&
    typeof value.truncated === "boolean"
  );
}

function stripCacheMetadata(payload: ProjectIndexCachePayload): ProjectScanResult {
  return {
    files: payload.files,
    instructionFiles: payload.instructionFiles,
    rootPath: payload.rootPath,
    truncated: payload.truncated
  };
}

function resolveProjectIndexCachePath(directory: string, rootPath: string): string {
  return join(directory, `${createHash("sha256").update(rootPath).digest("hex")}.json`);
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
