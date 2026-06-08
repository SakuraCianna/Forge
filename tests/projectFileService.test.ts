import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProjectDirectory, previewProjectFile } from "../src/main/projectFileService.js";

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

test("previewProjectFile treats package.json as text even when the new file is empty", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-preview-special-name-"));

  try {
    await writeFile(join(projectRoot, "package.json"), "", "utf8");

    const preview = await previewProjectFile({
      projectRoot,
      relativePath: "package.json"
    });

    assert.equal(preview.kind, "text");

    if (preview.kind === "text") {
      assert.equal(preview.content, "");
      assert.match(preview.mediaType, /json/u);
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("listProjectDirectory returns a missing result when a loaded subdirectory was deleted", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-deleted-directory-"));

  try {
    await mkdir(join(projectRoot, "backend"));
    await rm(join(projectRoot, "backend"), { recursive: true, force: true });

    const result = await listProjectDirectory({
      projectRoot,
      relativePath: "backend",
      includeGitIgnored: true
    });

    assert.equal(result.relativePath, "backend");
    assert.equal(result.missing, true);
    assert.equal(result.truncated, false);
    assert.deepEqual(result.entries, []);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
