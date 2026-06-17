// 本文件说明: 覆盖邮件云盘与办公套件类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createCloudOfficeExtensions } from "../src/main/extensions/serviceCloudOfficeExtensions.js";

test("cloud office service extensions keep their production order and summaries", () => {
  const definitions = createCloudOfficeExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "gmail",
    "google-drive",
    "dropbox",
    "microsoft-365"
  ]);

  assert.equal(definitions[0].summarizeInput?.("listMessages", { query: "from:alice" }), "gmail from:alice");
  assert.equal(definitions[0].summarizeInput?.("getProfile", {}), "gmail profile");
  assert.equal(definitions[1].summarizeInput?.("getFileMetadata", { fileId: "file-1" }), "drive file file-1");
  assert.equal(definitions[1].summarizeInput?.("listFiles", { query: "name contains 'report'" }), "drive name contains 'report'");
  assert.equal(definitions[2].summarizeInput?.("listFolder", { path: "/Team" }), "dropbox /Team");
  assert.equal(definitions[2].summarizeInput?.("getCurrentAccount", {}), "dropbox account");
  assert.equal(definitions[3].summarizeInput?.("listEvents", {}), "microsoft365 listEvents");
});
