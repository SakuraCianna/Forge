import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProjectFiles } from "../src/main/projectScanner.js";

test("scanProjectFiles reuses unchanged instruction file cache entries", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-scanner-instructions-cache-"));

  try {
    await writeFile(join(projectRoot, "AGENTS.md"), "Use real project evidence.\n", "utf8");
    await writeFile(join(projectRoot, "index.ts"), "export const answer = 42;\n", "utf8");

    const firstScan = await scanProjectFiles(projectRoot);
    const secondScan = await scanProjectFiles(projectRoot, { previousIndex: firstScan });

    assert.equal(firstScan.instructionFiles?.[0]?.relativePath, "AGENTS.md");
    assert.strictEqual(secondScan.instructionFiles?.[0], firstScan.instructionFiles?.[0]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("scanProjectFiles invalidates an instruction cache entry when the file changes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-scanner-instructions-update-"));
  const instructionPath = join(projectRoot, "AGENTS.md");

  try {
    await writeFile(instructionPath, "Initial project rule.\n", "utf8");
    const firstScan = await scanProjectFiles(projectRoot);

    await writeFile(instructionPath, "Updated project rule with more detail.\n", "utf8");
    const secondScan = await scanProjectFiles(projectRoot, { previousIndex: firstScan });

    assert.notStrictEqual(secondScan.instructionFiles?.[0], firstScan.instructionFiles?.[0]);
    assert.equal(secondScan.instructionFiles?.[0]?.content, "Updated project rule with more detail.");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("scanProjectFiles drops a cached instruction file after it is removed", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-scanner-instructions-remove-"));
  const instructionPath = join(projectRoot, "AGENTS.md");

  try {
    await writeFile(instructionPath, "Temporary project rule.\n", "utf8");
    const firstScan = await scanProjectFiles(projectRoot);

    await rm(instructionPath, { force: true });
    const secondScan = await scanProjectFiles(projectRoot, { previousIndex: firstScan });

    assert.equal(firstScan.instructionFiles?.length, 1);
    assert.deepEqual(secondScan.instructionFiles, []);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("scanProjectFiles caches cursor rule instruction files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-scanner-cursor-cache-"));

  try {
    await mkdir(join(projectRoot, ".cursor", "rules"), { recursive: true });
    await writeFile(join(projectRoot, ".cursor", "rules", "frontend.mdc"), "Use app components.\n", "utf8");

    const firstScan = await scanProjectFiles(projectRoot);
    const secondScan = await scanProjectFiles(projectRoot, { previousIndex: firstScan });

    assert.equal(firstScan.instructionFiles?.[0]?.relativePath, ".cursor/rules/frontend.mdc");
    assert.strictEqual(secondScan.instructionFiles?.[0], firstScan.instructionFiles?.[0]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("scanProjectFiles reuses unchanged file metadata entries", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-scanner-file-cache-"));

  try {
    await writeFile(join(projectRoot, "index.ts"), "export const answer = 42;\n", "utf8");
    const firstScan = await scanProjectFiles(projectRoot);
    const secondScan = await scanProjectFiles(projectRoot, { previousIndex: firstScan });

    assert.strictEqual(secondScan.files[0], firstScan.files[0]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("scanProjectFiles invalidates same-size file metadata when ctime changes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-scanner-file-signature-"));
  const filePath = join(projectRoot, "index.ts");

  try {
    await writeFile(filePath, "alpha\n", "utf8");
    const firstFileStat = await stat(filePath);
    const firstScan = await scanProjectFiles(projectRoot);
    const firstFile = firstScan.files.find((file) => file.relativePath === "index.ts");

    await writeFile(filePath, "bravo\n", "utf8");
    await utimes(filePath, firstFileStat.atime, firstFileStat.mtime);

    const secondScan = await scanProjectFiles(projectRoot, { previousIndex: firstScan });
    const secondFile = secondScan.files.find((file) => file.relativePath === "index.ts");

    assert.ok(firstFile);
    assert.ok(secondFile);
    const firstSignature = firstFile as unknown as {
      changedAtNs?: unknown;
      modifiedAtNs?: unknown;
    };
    const secondSignature = secondFile as unknown as {
      changedAtNs?: unknown;
      modifiedAtNs?: unknown;
    };

    assert.equal(typeof firstSignature.changedAtNs, "string");
    assert.equal(typeof firstSignature.modifiedAtNs, "string");
    assert.equal(typeof secondSignature.changedAtNs, "string");
    assert.equal(typeof secondSignature.modifiedAtNs, "string");
    assert.equal(secondFile.size, firstFile.size);
    assert.notEqual(secondSignature.changedAtNs, firstSignature.changedAtNs);
    assert.notStrictEqual(secondFile, firstFile);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
