import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCachedSortedDirectoryEntries } from "../src/main/projectDirectoryEntriesCache.js";

test("readCachedSortedDirectoryEntries reuses unchanged directory entry snapshots", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-directory-cache-reuse-"));

  try {
    await mkdir(join(projectRoot, "src"));
    await writeFile(join(projectRoot, "package.json"), "{}", "utf8");

    const firstEntries = await readCachedSortedDirectoryEntries(projectRoot);
    const secondEntries = await readCachedSortedDirectoryEntries(projectRoot);

    assert.strictEqual(secondEntries, firstEntries);
    assert.deepEqual(
      secondEntries.map((entry) => ({
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
        name: entry.name
      })),
      [
        { isDirectory: true, isFile: false, name: "src" },
        { isDirectory: false, isFile: true, name: "package.json" }
      ]
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("readCachedSortedDirectoryEntries invalidates when directory entries change", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-directory-cache-invalidate-"));

  try {
    await writeFile(join(projectRoot, "alpha.txt"), "alpha\n", "utf8");
    const firstEntries = await readCachedSortedDirectoryEntries(projectRoot);
    const firstSignature = await readDirectorySignature(projectRoot);

    await writeFile(join(projectRoot, "beta.txt"), "beta\n", "utf8");
    await waitForDirectorySignatureChange(projectRoot, firstSignature);
    const secondEntries = await readCachedSortedDirectoryEntries(projectRoot);

    assert.notStrictEqual(secondEntries, firstEntries);
    assert.deepEqual(
      secondEntries.map((entry) => entry.name),
      ["alpha.txt", "beta.txt"]
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function readDirectorySignature(directoryPath: string): Promise<string> {
  const directoryStat = await stat(directoryPath, { bigint: true });

  return `${directoryStat.ctimeNs}:${directoryStat.mtimeNs}`;
}

async function waitForDirectorySignatureChange(
  directoryPath: string,
  previousSignature: string
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await readDirectorySignature(directoryPath)) !== previousSignature) {
      return;
    }

    const nudgePath = join(directoryPath, `.forge-cache-signature-${attempt}.tmp`);

    await writeFile(nudgePath, "nudge\n", "utf8");
    await rm(nudgePath, { force: true });
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  assert.notEqual(
    await readDirectorySignature(directoryPath),
    previousSignature,
    "Directory cache invalidation test could not observe a directory metadata change"
  );
}

test("readCachedSortedDirectoryEntries keeps cache when only file content changes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-directory-cache-content-change-"));
  const filePath = join(projectRoot, "alpha.txt");

  try {
    await writeFile(filePath, "alpha\n", "utf8");
    const firstEntries = await readCachedSortedDirectoryEntries(projectRoot);

    await writeFile(filePath, "alpha updated without changing entries\n", "utf8");
    const secondEntries = await readCachedSortedDirectoryEntries(projectRoot);

    assert.strictEqual(secondEntries, firstEntries);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("readCachedSortedDirectoryEntries coalesces concurrent reads for the same directory", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-directory-cache-inflight-"));

  try {
    await writeFile(join(projectRoot, "index.ts"), "export const ok = true;\n", "utf8");

    const firstRead = readCachedSortedDirectoryEntries(projectRoot);
    const secondRead = readCachedSortedDirectoryEntries(projectRoot);

    assert.strictEqual(secondRead, firstRead);
    assert.strictEqual(await secondRead, await firstRead);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
