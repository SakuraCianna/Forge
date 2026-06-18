// 本文件说明: 覆盖区域服务内置 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createRegionalExtensions } from "../src/main/extensions/serviceRegionalExtensions.js";

test("regional service extensions keep their production order and summaries", () => {
  const definitions = createRegionalExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "gitee",
    "dingtalk",
    "wecom",
    "feishu",
    "nextcloud",
    "hetzner-cloud"
  ]);

  assert.equal(
    definitions[0].summarizeInput?.("listRepositoryIssues", {
      owner: "SakuraCianna",
      repo: "Forge"
    }),
    "gitee SakuraCianna/Forge"
  );
  assert.equal(
    definitions[1].summarizeInput?.("sendTextMessage", { content: "发布完成" }),
    "dingtalk 发布完成"
  );
  assert.equal(
    definitions[2].summarizeInput?.("sendMarkdownMessage", { title: "检查结果" }),
    "wecom 检查结果"
  );
  assert.equal(
    definitions[3].summarizeInput?.("sendTextMessage", { content: "构建通过" }),
    "feishu 构建通过"
  );
  assert.equal(
    definitions[4].summarizeInput?.("getUserMetadata", { userId: "sakura" }),
    "nextcloud user sakura"
  );
  assert.equal(definitions[5].summarizeInput?.("listServers", {}), "hetzner-cloud listServers");
});
