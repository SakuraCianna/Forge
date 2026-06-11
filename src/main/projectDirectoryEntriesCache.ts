// 本文件说明: 缓存目录直接子项列表, 为扫描和索引复用安全的目录结构快照
import { readdir, stat } from "node:fs/promises";

export type CachedSortedDirectoryEntry = {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
};

type DirectoryEntryCacheSignature = {
  changedAtNs: bigint;
  modifiedAtNs: bigint;
};

type DirectoryEntryCacheRecord = {
  entries: CachedSortedDirectoryEntry[];
  signature: DirectoryEntryCacheSignature;
};

const maxCachedDirectoryEntryLists = 400;
const directoryEntryCache = new Map<string, DirectoryEntryCacheRecord>();
const inFlightDirectoryReads = new Map<string, Promise<CachedSortedDirectoryEntry[]>>();

export function readCachedSortedDirectoryEntries(
  directoryPath: string
): Promise<CachedSortedDirectoryEntry[]> {
  const inFlightRead = inFlightDirectoryReads.get(directoryPath);

  if (inFlightRead) {
    return inFlightRead;
  }

  const readPromise = readCachedSortedDirectoryEntriesOnce(directoryPath).finally(() => {
    if (inFlightDirectoryReads.get(directoryPath) === readPromise) {
      inFlightDirectoryReads.delete(directoryPath);
    }
  });

  inFlightDirectoryReads.set(directoryPath, readPromise);
  return readPromise;
}

async function readCachedSortedDirectoryEntriesOnce(
  directoryPath: string
): Promise<CachedSortedDirectoryEntry[]> {
  const signature = await readDirectoryEntryCacheSignature(directoryPath);
  const cachedRecord = directoryEntryCache.get(directoryPath);

  if (cachedRecord && areDirectoryEntryCacheSignaturesEqual(cachedRecord.signature, signature)) {
    rememberDirectoryEntryList(directoryPath, cachedRecord);
    return cachedRecord.entries;
  }

  const entries = (await readdir(directoryPath, { withFileTypes: true }))
    .map((entry) => ({
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      name: entry.name
    }))
    .sort(compareCachedSortedDirectoryEntries);

  rememberDirectoryEntryList(directoryPath, {
    entries,
    signature: await readDirectoryEntryCacheSignature(directoryPath).catch(() => signature)
  });

  return entries;
}

function rememberDirectoryEntryList(
  directoryPath: string,
  cacheRecord: DirectoryEntryCacheRecord
): void {
  directoryEntryCache.delete(directoryPath);
  directoryEntryCache.set(directoryPath, cacheRecord);

  while (directoryEntryCache.size > maxCachedDirectoryEntryLists) {
    const oldestDirectoryPath = directoryEntryCache.keys().next().value;

    if (typeof oldestDirectoryPath !== "string") {
      return;
    }

    directoryEntryCache.delete(oldestDirectoryPath);
  }
}

async function readDirectoryEntryCacheSignature(
  directoryPath: string
): Promise<DirectoryEntryCacheSignature> {
  const directoryStat = await stat(directoryPath, { bigint: true });

  return {
    changedAtNs: directoryStat.ctimeNs,
    modifiedAtNs: directoryStat.mtimeNs
  };
}

function areDirectoryEntryCacheSignaturesEqual(
  left: DirectoryEntryCacheSignature,
  right: DirectoryEntryCacheSignature
): boolean {
  return left.changedAtNs === right.changedAtNs && left.modifiedAtNs === right.modifiedAtNs;
}

function compareCachedSortedDirectoryEntries(
  left: CachedSortedDirectoryEntry,
  right: CachedSortedDirectoryEntry
): number {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}
