// 本文件说明: 覆盖任务协作类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createTaskCollaborationExtensions } from "../src/main/extensions/serviceTaskCollaborationExtensions.js";

test("task collaboration service extensions keep their production order and summaries", () => {
  const definitions = createTaskCollaborationExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "todoist",
    "asana",
    "clickup",
    "monday",
    "trello"
  ]);

  assert.equal(definitions[0].summarizeInput?.("listTasks", { projectId: "proj-1" }), "todoist proj-1");
  assert.equal(definitions[0].summarizeInput?.("createTask", { content: "Ship Forge" }), "todoist create Ship Forge");
  assert.equal(definitions[1].summarizeInput?.("listTasks", { projectGid: "proj-2" }), "asana tasks proj-2");
  assert.equal(definitions[1].summarizeInput?.("listProjects", { workspaceGid: "workspace-1" }), "asana workspace-1");
  assert.equal(definitions[2].summarizeInput?.("listTasks", { listId: "list-1" }), "clickup list list-1");
  assert.equal(definitions[2].summarizeInput?.("listSpaces", { teamId: "team-1" }), "clickup team-1");
  assert.equal(definitions[3].summarizeInput?.("listBoards", {}), "monday listBoards");
  assert.equal(definitions[4].summarizeInput?.("listBoardCards", { boardId: "board-2" }), "trello board-2");
  assert.equal(definitions[4].summarizeInput?.("listBoards", {}), "trello listBoards");
});
