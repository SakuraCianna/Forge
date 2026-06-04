import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createLocalPluginSkill,
  deleteLocalPluginSkill,
  updateLocalPluginSkill
} from "../src/main/localSkillScanner.js";
import {
  createCustomExtensionScaffold,
  deleteCustomExtensionScaffold,
  readCustomExtensionManifests,
  updateCustomExtensionScaffold
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

test("user-owned local skills can be updated and deleted from the managed skill root", async () => {
  const home = await mkdtemp(join(tmpdir(), "forge-editable-skill-home-"));

  try {
    const created = await createLocalPluginSkill(
      {
        kind: "skill",
        name: "Draft Skill",
        description: "Initial instructions."
      },
      { homeDirectory: home }
    );
    const updated = await updateLocalPluginSkill(
      {
        kind: "skill",
        filePath: created.primaryFilePath,
        name: "Reviewed Skill",
        description: "Updated instructions."
      },
      { homeDirectory: home }
    );
    const content = await readFile(created.primaryFilePath, "utf8");

    assert.match(content, /name: "Reviewed Skill"/u);
    assert.equal(
      updated.scanResult.skills.some(
        (skill) => skill.name === "Reviewed Skill" && skill.userOwned
      ),
      true
    );

    const deleted = await deleteLocalPluginSkill(
      {
        kind: "skill",
        filePath: created.primaryFilePath
      },
      { homeDirectory: home }
    );

    assert.match(deleted.deletedPath.replace(/\\/gu, "/"), /\/draft-skill$/u);
    assert.equal(
      deleted.scanResult.skills.some((skill) => skill.name === "Reviewed Skill"),
      false
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

test("custom extension scaffold accepts user-defined fields and can be updated then deleted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-extension-managed-"));

  try {
    const created = await createCustomExtensionScaffold({
      directory,
      request: {
        name: "Feishu Tasks",
        description: "Create and search Feishu tasks.",
        category: "developer",
        auth: {
          type: "secret",
          fields: [
            {
              id: "app_id",
              label: "App ID",
              description: "Feishu app id"
            }
          ]
        },
        permissions: [
          {
            id: "task.read",
            label: "读取任务",
            description: "读取飞书任务",
            defaultMode: "ask"
          }
        ],
        actions: [
          {
            id: "searchTasks",
            label: "搜索任务",
            description: "按关键词搜索任务",
            permission: "task.read",
            risk: "read",
            confirmation: "ask",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string" }
              }
            },
            outputSchema: {
              type: "object",
              properties: {
                tasks: { type: "array" }
              }
            }
          }
        ]
      }
    });

    assert.equal(created.manifest.auth.fields[0]?.id, "app_id");
    assert.equal(created.manifest.actions[0]?.id, "searchTasks");

    const updated = await updateCustomExtensionScaffold({
      directory,
      extensionId: created.manifest.id,
      manifest: {
        ...created.manifest,
        name: "Feishu Workbench",
        auth: {
          type: "secret",
          fields: [
            ...created.manifest.auth.fields,
            {
              id: "app_secret",
              label: "App Secret",
              description: "Feishu app secret"
            }
          ]
        }
      }
    });

    assert.equal(updated.manifest.name, "Feishu Workbench");
    assert.equal(updated.manifest.auth.fields.some((field) => field.id === "app_secret"), true);

    const deleted = await deleteCustomExtensionScaffold({
      directory,
      extensionId: created.manifest.id
    });
    const manifests = await readCustomExtensionManifests(directory);

    assert.equal(deleted.deletedManifestId, created.manifest.id);
    assert.equal(manifests.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
