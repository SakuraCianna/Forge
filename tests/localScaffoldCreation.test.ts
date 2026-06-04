import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalPluginSkill } from "../src/main/localSkillScanner.js";
import {
  createCustomExtensionScaffold,
  readCustomExtensionManifests
} from "../src/main/extensions/customExtensionScaffold.js";

test("local skill creation writes SKILL.md and refreshes the local scan result", async () => {
  const home = await mkdtemp(join(tmpdir(), "forge-skill-home-"));

  try {
    const result = await createLocalPluginSkill(
      {
        kind: "skill",
        name: "Review Flow",
        description: "Review code changes before completion."
      },
      { homeDirectory: home }
    );
    const content = await readFile(result.primaryFilePath, "utf8");

    assert.match(result.primaryFilePath, /SKILL\.md$/u);
    assert.match(content, /name: "Review Flow"/u);
    assert.equal(
      result.scanResult.skills.some((skill) => skill.name === "Review Flow"),
      true
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("local plugin creation writes a plugin manifest and exposes its skill", async () => {
  const home = await mkdtemp(join(tmpdir(), "forge-plugin-home-"));

  try {
    const result = await createLocalPluginSkill(
      {
        kind: "plugin",
        name: "Delivery Plugin",
        description: "Bundle delivery skills."
      },
      { homeDirectory: home }
    );
    const manifest = await readFile(result.primaryFilePath, "utf8");

    assert.match(result.primaryFilePath, /plugin\.json$/u);
    assert.match(manifest, /"skills":/u);
    assert.equal(
      result.scanResult.skills.some(
        (skill) => skill.name === "Delivery Plugin" && skill.source === "plugin-local"
      ),
      true
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("custom extension scaffold keeps write actions behind forced confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-extension-"));

  try {
    const result = await createCustomExtensionScaffold({
      directory,
      request: {
        name: "Task Extension",
        description: "Create tasks in an external service."
      }
    });
    const manifests = await readCustomExtensionManifests(directory);
    const writeAction = result.manifest.actions.find((action) => action.id === "writeData");

    assert.equal(result.manifest.builtIn, false);
    assert.equal(writeAction?.confirmation, "always");
    assert.deepEqual(
      manifests.map((manifest) => manifest.id),
      [result.manifest.id]
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
