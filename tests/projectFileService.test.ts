import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProjectDirectory } from "../src/main/projectFileService.js";

test("listProjectDirectory pages visible entries and keeps sensitive paths hidden", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-files-"));

  try {
    await mkdir(join(projectRoot, "src"));
    await mkdir(join(projectRoot, "docs"));
    await mkdir(join(projectRoot, ".git"));
    await writeFile(join(projectRoot, "alpha.txt"), "alpha\n", "utf8");
    await writeFile(join(projectRoot, "beta.txt"), "beta\n", "utf8");
    await writeFile(join(projectRoot, ".env"), "SECRET=value\n", "utf8");
    await writeFile(join(projectRoot, ".git", "config"), "[core]\n", "utf8");

    const firstPage = await listProjectDirectory({
      projectRoot,
      relativePath: ".",
      includeGitIgnored: true,
      limit: 3
    });
    const secondPage = await listProjectDirectory({
      projectRoot,
      relativePath: ".",
      includeGitIgnored: true,
      limit: 3,
      offset: firstPage.nextOffset
    });

    assert.deepEqual(
      firstPage.entries.map((entry) => ({
        kind: entry.kind,
        name: entry.name,
        relativePath: entry.relativePath
      })),
      [
        { kind: "directory", name: "docs", relativePath: "docs" },
        { kind: "directory", name: "src", relativePath: "src" },
        { kind: "file", name: "alpha.txt", relativePath: "alpha.txt" }
      ]
    );
    assert.equal(firstPage.truncated, true);
    assert.equal(firstPage.nextOffset, 3);
    assert.equal(firstPage.entries[2]?.size, 6);

    assert.deepEqual(
      secondPage.entries.map((entry) => ({
        kind: entry.kind,
        name: entry.name,
        relativePath: entry.relativePath
      })),
      [{ kind: "file", name: "beta.txt", relativePath: "beta.txt" }]
    );
    assert.equal(secondPage.truncated, false);
    assert.equal(secondPage.nextOffset, undefined);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
