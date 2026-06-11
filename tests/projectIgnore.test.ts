import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectIgnoreMatcher } from "../src/main/projectIgnore.js";

test("project ignore matcher reuses the compiled matcher when gitignore is unchanged", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-ignore-cache-"));

  try {
    await writeFile(join(projectRoot, ".gitignore"), "dist/\n*.log\n", "utf8");

    const firstMatcher = await createProjectIgnoreMatcher(projectRoot);
    const secondMatcher = await createProjectIgnoreMatcher(projectRoot);

    assert.strictEqual(secondMatcher, firstMatcher);
    assert.equal(secondMatcher("dist", true), true);
    assert.equal(secondMatcher("debug.log", false), true);
    assert.equal(secondMatcher("src/index.ts", false), false);
    assert.equal(secondMatcher(".git/config", false), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project ignore matcher invalidates when gitignore metadata changes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-ignore-update-"));

  try {
    await writeFile(join(projectRoot, ".gitignore"), "dist/\n", "utf8");
    const firstMatcher = await createProjectIgnoreMatcher(projectRoot);

    await writeFile(join(projectRoot, ".gitignore"), "build/\nnode_modules/\n", "utf8");
    const secondMatcher = await createProjectIgnoreMatcher(projectRoot);

    assert.notStrictEqual(secondMatcher, firstMatcher);
    assert.equal(secondMatcher("dist", true), false);
    assert.equal(secondMatcher("build", true), true);
    assert.equal(secondMatcher("node_modules", true), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project ignore matcher invalidates when gitignore is removed", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-ignore-remove-"));
  const gitignorePath = join(projectRoot, ".gitignore");

  try {
    await writeFile(gitignorePath, "dist/\n", "utf8");
    const firstMatcher = await createProjectIgnoreMatcher(projectRoot);

    await rm(gitignorePath, { force: true });
    const secondMatcher = await createProjectIgnoreMatcher(projectRoot);

    assert.notStrictEqual(secondMatcher, firstMatcher);
    assert.equal(secondMatcher("dist", true), false);
    assert.equal(secondMatcher(".git/config", false), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project ignore matcher coalesces concurrent creation for the same root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-ignore-inflight-"));

  try {
    await writeFile(join(projectRoot, ".gitignore"), "dist/\n", "utf8");

    const firstMatcherPromise = createProjectIgnoreMatcher(projectRoot);
    const secondMatcherPromise = createProjectIgnoreMatcher(projectRoot);

    assert.strictEqual(secondMatcherPromise, firstMatcherPromise);
    assert.strictEqual(await secondMatcherPromise, await firstMatcherPromise);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
