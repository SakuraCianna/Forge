// 本文件说明: 覆盖源码托管类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createSourceControlExtensions } from "../src/main/extensions/serviceSourceControlExtensions.js";

test("source control service extensions keep their production order and summaries", () => {
  const definitions = createSourceControlExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "github",
    "gitlab",
    "bitbucket"
  ]);

  assert.equal(
    definitions[0].summarizeInput?.("listIssues", {
      owner: "SakuraCianna",
      repo: "Forge"
    }),
    "github SakuraCianna/Forge"
  );
  assert.equal(
    definitions[1].summarizeInput?.("listProjectIssues", {
      projectId: "group/project"
    }),
    "gitlab group/project"
  );
  assert.equal(
    definitions[2].summarizeInput?.("listRepositories", {
      workspace: "team"
    }),
    "bitbucket team/"
  );
});
