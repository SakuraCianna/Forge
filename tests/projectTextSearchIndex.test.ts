import test from "node:test";
import assert from "node:assert/strict";
import type { BigIntStats } from "node:fs";
import {
  readProjectTextIndexEntriesWithConcurrency,
  type ProjectTextIndexFileTask
} from "../src/main/projectTextSearchIndex.js";

test("readProjectTextIndexEntriesWithConcurrency bounds reads and preserves order", async () => {
  let activeReads = 0;
  let maxActiveReads = 0;

  const entries = await readProjectTextIndexEntriesWithConcurrency(
    [
      { absolutePath: "E:\\CodeHome\\Forge\\a.ts", relativePath: "a.ts" },
      { absolutePath: "E:\\CodeHome\\Forge\\b.ts", relativePath: "b.ts" },
      { absolutePath: "E:\\CodeHome\\Forge\\c.ts", relativePath: "c.ts" },
      { absolutePath: "E:\\CodeHome\\Forge\\d.ts", relativePath: "d.ts" }
    ],
    new Map(),
    256000,
    {
      maxConcurrency: 2,
      readFileContent: async (absolutePath) => {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeReads -= 1;

        return `content from ${absolutePath}`;
      },
      readStat: async (absolutePath) => createFakeBigIntStats(absolutePath)
    }
  );

  assert.equal(maxActiveReads, 2);
  assert.deepEqual(
    entries.map((entry) => entry?.relativePath),
    ["a.ts", "b.ts", "c.ts", "d.ts"]
  );
});

test("readProjectTextIndexEntriesWithConcurrency reuses entries with unchanged nanosecond signatures", async () => {
  const task: ProjectTextIndexFileTask = {
    absolutePath: "E:\\CodeHome\\Forge\\index.ts",
    relativePath: "index.ts"
  };
  const previousEntry = {
    changedAtNs: "10",
    lines: ["export const answer = 42;"],
    lowerLines: ["export const answer = 42;"],
    modifiedAtMs: 10,
    modifiedAtNs: "10",
    relativePath: "index.ts",
    size: 10
  };

  const entries = await readProjectTextIndexEntriesWithConcurrency(
    [task],
    new Map([[previousEntry.relativePath, previousEntry]]),
    256000,
    {
      readFileContent: async () => {
        throw new Error("unchanged entries should not be read again");
      },
      readStat: async () => createFakeBigIntStats("index.ts", 10n)
    }
  );

  assert.strictEqual(entries[0], previousEntry);
});

test("readProjectTextIndexEntriesWithConcurrency invalidates same-size entries when ctime changes", async () => {
  const task: ProjectTextIndexFileTask = {
    absolutePath: "E:\\CodeHome\\Forge\\index.ts",
    relativePath: "index.ts"
  };
  const previousEntry = {
    changedAtNs: "10",
    lines: ["alpha"],
    lowerLines: ["alpha"],
    modifiedAtMs: 10,
    modifiedAtNs: "10",
    relativePath: "index.ts",
    size: 10
  };

  const entries = await readProjectTextIndexEntriesWithConcurrency(
    [task],
    new Map([[previousEntry.relativePath, previousEntry]]),
    256000,
    {
      readFileContent: async () => "bravo",
      readStat: async () => ({
        ...createFakeBigIntStats("index.ts", 10n),
        ctimeNs: 11n
      })
    }
  );

  assert.notStrictEqual(entries[0], previousEntry);
  assert.deepEqual(entries[0]?.lines, ["bravo"]);
});

function createFakeBigIntStats(filePath: string, seedOverride?: bigint): BigIntStats {
  const seed = seedOverride ?? BigInt(filePath.charCodeAt(filePath.length - 4) ?? 1);

  return {
    ctimeNs: seed,
    mtimeMs: seed,
    mtimeNs: seed,
    size: seed
  } as BigIntStats;
}
