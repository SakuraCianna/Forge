// 本文件说明: 覆盖开发者与社区类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createDeveloperCommunityExtensions } from "../src/main/extensions/serviceDeveloperCommunityExtensions.js";

test("developer community service extensions keep their production order and summaries", () => {
  const definitions = createDeveloperCommunityExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "jira-cloud",
    "discord"
  ]);

  assert.equal(definitions[0].summarizeInput?.("searchIssues", { jql: "project = FORGE" }), "jira project = FORGE");
  assert.equal(definitions[0].summarizeInput?.("listAccessibleResources", {}), "jira resources");
  assert.equal(definitions[1].summarizeInput?.("getCurrentUser", {}), "discord");
  assert.equal(definitions[1].summarizeInput?.("listGuilds", {}), "discord");
});
