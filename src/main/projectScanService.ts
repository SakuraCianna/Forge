// 本文件说明: 协调项目扫描缓存, 避免同一项目重复并发索引
import type { ProjectScanResult } from "../shared/projectTypes.js";
import type { ProjectIndexCache } from "./projectIndexCache.js";

type ScanProjectFiles = (
  rootPath: string,
  options: {
    previousIndex?: ProjectScanResult | null;
  }
) => Promise<ProjectScanResult>;

type CachedProjectScannerOptions = {
  cache: ProjectIndexCache;
  maxCachedProjects?: number;
  scanProjectFiles: ScanProjectFiles;
};

export type CachedProjectScanner = {
  scan: (rootPath: string) => Promise<ProjectScanResult>;
};

const defaultMaxCachedProjects = 6;

export function createCachedProjectScanner({
  cache,
  maxCachedProjects = defaultMaxCachedProjects,
  scanProjectFiles
}: CachedProjectScannerOptions): CachedProjectScanner {
  const recentScans = new Map<string, ProjectScanResult>();
  const inFlightScans = new Map<string, Promise<ProjectScanResult>>();
  const normalizedMaxCachedProjects = normalizeMaxCachedProjects(maxCachedProjects);

  function scan(rootPath: string): Promise<ProjectScanResult> {
    const inFlightScan = inFlightScans.get(rootPath);

    if (inFlightScan) {
      return inFlightScan;
    }

    const scanPromise = scanWithCache(rootPath).finally(() => {
      if (inFlightScans.get(rootPath) === scanPromise) {
        inFlightScans.delete(rootPath);
      }
    });

    inFlightScans.set(rootPath, scanPromise);
    return scanPromise;
  }

  async function scanWithCache(rootPath: string): Promise<ProjectScanResult> {
    const previousIndex = await readPreviousIndex(rootPath);
    const scanResult = await scanProjectFiles(rootPath, { previousIndex });

    rememberScanResult(rootPath, scanResult);
    void cache.write(scanResult).catch(() => undefined);

    return scanResult;
  }

  async function readPreviousIndex(rootPath: string): Promise<ProjectScanResult | null> {
    const memoryIndex = recentScans.get(rootPath);

    if (memoryIndex) {
      recentScans.delete(rootPath);
      recentScans.set(rootPath, memoryIndex);
      return memoryIndex;
    }

    return cache.read(rootPath).catch(() => null);
  }

  function rememberScanResult(rootPath: string, scanResult: ProjectScanResult): void {
    recentScans.delete(rootPath);
    recentScans.set(rootPath, scanResult);

    while (recentScans.size > normalizedMaxCachedProjects) {
      const oldestRootPath = recentScans.keys().next().value;

      if (typeof oldestRootPath !== "string") {
        return;
      }

      recentScans.delete(oldestRootPath);
    }
  }

  return {
    scan
  };
}

function normalizeMaxCachedProjects(value: number): number {
  if (!Number.isFinite(value)) {
    return defaultMaxCachedProjects;
  }

  return Math.max(1, Math.round(value));
}
