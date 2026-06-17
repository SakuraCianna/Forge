// 本文件说明: 覆盖工作台生产力类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspaceProductivityExtensions } from "../src/main/extensions/serviceWorkspaceProductivityExtensions.js";

test("workspace productivity service extensions keep their production order and summaries", () => {
  const definitions = createWorkspaceProductivityExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "confluence",
    "slack",
    "notion",
    "airtable",
    "hubspot"
  ]);

  assert.equal(definitions[0].summarizeInput?.("searchPages", { query: "release" }), "confluence release");
  assert.equal(definitions[0].summarizeInput?.("listSpaces", { cloudId: "cloud-1" }), "confluence cloud-1");
  assert.equal(definitions[1].summarizeInput?.("postMessage", { channel: "C1", text: "hello" }), "slack C1: hello");
  assert.equal(definitions[1].summarizeInput?.("listChannels", {}), "slack listChannels");
  assert.equal(definitions[2].summarizeInput?.("searchPages", { query: "spec" }), "notion search spec");
  assert.equal(definitions[2].summarizeInput?.("createDatabasePage", { title: "Spec" }), "notion create Spec");
  assert.equal(
    definitions[3].summarizeInput?.("listRecords", { baseId: "app-1", tableNameOrId: "Tasks" }),
    "airtable app-1/Tasks"
  );
  assert.equal(definitions[3].summarizeInput?.("listBases", {}), "airtable bases");
  assert.equal(definitions[4].summarizeInput?.("listContacts", {}), "hubspot listContacts");
});
