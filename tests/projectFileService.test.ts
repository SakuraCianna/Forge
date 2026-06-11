import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { listProjectDirectory, previewProjectFile, readProjectTextFile } from "../src/main/projectFileService.js";

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

test("readProjectTextFile reuses unchanged text file snapshots", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-text-read-cache-"));

  try {
    await writeFile(join(projectRoot, "README.md"), "# Forge\n", "utf8");

    const firstFile = await readProjectTextFile({
      projectRoot,
      relativePath: "README.md"
    });
    const secondFile = await readProjectTextFile({
      projectRoot,
      relativePath: "README.md"
    });

    assert.strictEqual(secondFile, firstFile);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("readProjectTextFile invalidates cached snapshots after same-size file changes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-text-read-cache-update-"));
  const filePath = join(projectRoot, "README.md");

  try {
    await writeFile(filePath, "# Forge\n", "utf8");
    const firstFile = await readProjectTextFile({
      projectRoot,
      relativePath: "README.md"
    });

    await delay(5);
    await writeFile(filePath, "# Forth\n", "utf8");
    const secondFile = await readProjectTextFile({
      projectRoot,
      relativePath: "README.md"
    });

    assert.notStrictEqual(secondFile, firstFile);
    assert.equal(secondFile.size, firstFile.size);
    assert.equal(secondFile.content, "# Forth\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("readProjectTextFile keeps cached snapshots scoped to the maxBytes budget", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-text-read-cache-budget-"));

  try {
    await writeFile(join(projectRoot, "README.md"), "# Forge\n", "utf8");
    const fullFile = await readProjectTextFile({
      projectRoot,
      relativePath: "README.md"
    });

    await assert.rejects(
      readProjectTextFile({
        projectRoot,
        relativePath: "README.md",
        maxBytes: 4
      }),
      /File is too large to preview/u
    );
    assert.equal(fullFile.content, "# Forge\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("readProjectTextFile coalesces concurrent unchanged reads", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-text-read-cache-inflight-"));

  try {
    await writeFile(join(projectRoot, "README.md"), "# Forge\n", "utf8");

    const [firstFile, secondFile] = await Promise.all([
      readProjectTextFile({
        projectRoot,
        relativePath: "README.md"
      }),
      readProjectTextFile({
        projectRoot,
        relativePath: "README.md"
      })
    ]);

    assert.strictEqual(secondFile, firstFile);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("previewProjectFile reuses unchanged text preview snapshots", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-preview-cache-"));

  try {
    await writeFile(join(projectRoot, "README.md"), "# Forge\n", "utf8");

    const firstPreview = await previewProjectFile({
      projectRoot,
      relativePath: "README.md"
    });
    const secondPreview = await previewProjectFile({
      projectRoot,
      relativePath: "README.md"
    });

    assert.strictEqual(secondPreview, firstPreview);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("previewProjectFile invalidates cached text previews after file changes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-preview-cache-update-"));
  const filePath = join(projectRoot, "README.md");

  try {
    await writeFile(filePath, "# Forge\n", "utf8");
    const firstPreview = await previewProjectFile({
      projectRoot,
      relativePath: "README.md"
    });

    await delay(5);
    await writeFile(filePath, "# Forth\n", "utf8");
    const secondPreview = await previewProjectFile({
      projectRoot,
      relativePath: "README.md"
    });

    assert.notStrictEqual(secondPreview, firstPreview);
    assert.equal(secondPreview.kind, "text");

    if (secondPreview.kind === "text") {
      assert.equal(secondPreview.content, "# Forth\n");
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("previewProjectFile keeps cached previews scoped to the maxBytes budget", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-preview-cache-budget-"));

  try {
    await writeFile(join(projectRoot, "README.md"), "# Forge\n", "utf8");
    const fullPreview = await previewProjectFile({
      projectRoot,
      relativePath: "README.md"
    });
    const smallBudgetPreview = await previewProjectFile({
      projectRoot,
      relativePath: "README.md",
      maxBytes: 4
    });

    assert.equal(fullPreview.kind, "text");
    assert.equal(smallBudgetPreview.kind, "unsupported");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("previewProjectFile coalesces concurrent unchanged preview reads", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-preview-cache-inflight-"));

  try {
    await writeFile(join(projectRoot, "README.md"), "# Forge\n", "utf8");

    const [firstPreview, secondPreview] = await Promise.all([
      previewProjectFile({
        projectRoot,
        relativePath: "README.md"
      }),
      previewProjectFile({
        projectRoot,
        relativePath: "README.md"
      })
    ]);

    assert.strictEqual(secondPreview, firstPreview);
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
