import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectScanResult } from "../src/shared/projectTypes.js";
import type { ProjectIndexCache } from "../src/main/projectIndexCache.js";
import { createCachedProjectScanner } from "../src/main/projectScanService.js";

type ScanCall = {
  previousIndex: ProjectScanResult | null | undefined;
  rootPath: string;
};

type TestCache = {
  cache: ProjectIndexCache;
  getReadCount: () => number;
  writes: ProjectScanResult[];
};

test("cached project scanner coalesces concurrent scans for the same root", async () => {
  const projectRoot = "E:\\CodeHome\\Forge";
  const previousIndex = createScanResult(projectRoot, "old.ts");
  const scanResult = createScanResult(projectRoot, "index.ts");
  const scanCalls: ScanCall[] = [];
  const deferredScan = createDeferred<ProjectScanResult>();
  const testCache = createTestCache(previousIndex);
  const scanner = createCachedProjectScanner({
    cache: testCache.cache,
    scanProjectFiles: (rootPath, options) => {
      scanCalls.push({
        previousIndex: options.previousIndex,
        rootPath
      });

      return deferredScan.promise;
    }
  });

  const firstScan = scanner.scan(projectRoot);
  const secondScan = scanner.scan(projectRoot);

  assert.strictEqual(firstScan, secondScan);
  await waitForNextTick();
  assert.equal(scanCalls.length, 1);
  assert.equal(scanCalls[0]?.rootPath, projectRoot);
  assert.equal(scanCalls[0]?.previousIndex, previousIndex);

  deferredScan.resolve(scanResult);

  assert.equal(await firstScan, scanResult);
  assert.equal(await secondScan, scanResult);
  assert.equal(testCache.getReadCount(), 1);
  assert.deepEqual(testCache.writes, [scanResult]);
});

test("cached project scanner reuses the latest in-memory scan as previous index", async () => {
  const projectRoot = "E:\\CodeHome\\Forge";
  const firstResult = createScanResult(projectRoot, "first.ts");
  const secondResult = createScanResult(projectRoot, "second.ts");
  const scanCalls: ScanCall[] = [];
  const testCache = createTestCache(null);
  const scanner = createCachedProjectScanner({
    cache: testCache.cache,
    scanProjectFiles: async (rootPath, options) => {
      scanCalls.push({
        previousIndex: options.previousIndex,
        rootPath
      });

      return scanCalls.length === 1 ? firstResult : secondResult;
    }
  });

  assert.equal(await scanner.scan(projectRoot), firstResult);
  assert.equal(await scanner.scan(projectRoot), secondResult);

  assert.equal(testCache.getReadCount(), 1);
  assert.equal(scanCalls[0]?.previousIndex, null);
  assert.equal(scanCalls[1]?.previousIndex, firstResult);
  assert.deepEqual(testCache.writes, [firstResult, secondResult]);
});

test("cached project scanner ignores async cache write failures", async () => {
  const projectRoot = "E:\\CodeHome\\Forge";
  const scanResult = createScanResult(projectRoot, "index.ts");
  const scanner = createCachedProjectScanner({
    cache: {
      read: async () => null,
      write: async () => {
        throw new Error("disk cache unavailable");
      }
    },
    scanProjectFiles: async () => scanResult
  });

  assert.equal(await scanner.scan(projectRoot), scanResult);
});

test("cached project scanner keeps recent project indexes bounded", async () => {
  const scanCalls: ScanCall[] = [];
  const readRoots: string[] = [];
  const scanner = createCachedProjectScanner({
    cache: {
      read: async (rootPath) => {
        readRoots.push(rootPath);
        return null;
      },
      write: async () => undefined
    },
    maxCachedProjects: 2,
    scanProjectFiles: async (rootPath, options) => {
      scanCalls.push({
        previousIndex: options.previousIndex,
        rootPath
      });

      return createScanResult(rootPath, `${scanCalls.length}.ts`);
    }
  });

  await scanner.scan("E:\\CodeHome\\One");
  await scanner.scan("E:\\CodeHome\\Two");
  await scanner.scan("E:\\CodeHome\\Three");
  await scanner.scan("E:\\CodeHome\\One");

  assert.deepEqual(readRoots, [
    "E:\\CodeHome\\One",
    "E:\\CodeHome\\Two",
    "E:\\CodeHome\\Three",
    "E:\\CodeHome\\One"
  ]);
  assert.equal(scanCalls[3]?.previousIndex, null);
});

function createScanResult(rootPath: string, relativePath: string): ProjectScanResult {
  return {
    rootPath,
    files: [
      {
        modifiedAtMs: 100,
        relativePath,
        size: 42
      }
    ],
    truncated: false,
    instructionFiles: []
  };
}

function createTestCache(readResult: ProjectScanResult | null): TestCache {
  let readCount = 0;
  const writes: ProjectScanResult[] = [];

  return {
    cache: {
      read: async () => {
        readCount += 1;
        return readResult;
      },
      write: async (scanResult) => {
        writes.push(scanResult);
      }
    },
    getReadCount: () => readCount,
    writes
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
} {
  let rejectPromise: (error: unknown) => void = () => undefined;
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise
  };
}

function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
