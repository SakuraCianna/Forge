// 本文件说明: 覆盖日程会议与设计协作类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createSchedulingCollaborationExtensions } from "../src/main/extensions/serviceSchedulingCollaborationExtensions.js";

test("scheduling collaboration service extensions keep their production order and summaries", () => {
  const definitions = createSchedulingCollaborationExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "google-calendar",
    "calendly",
    "miro",
    "zoom",
    "figma"
  ]);

  assert.equal(definitions[0].summarizeInput?.("listEvents", { calendarId: "team" }), "calendar team");
  assert.equal(definitions[0].summarizeInput?.("createEvent", { summary: "Sync" }), "calendar create Sync");
  assert.equal(definitions[1].summarizeInput?.("getCurrentUser", {}), "calendly user");
  assert.equal(
    definitions[1].summarizeInput?.("listEventTypes", {
      userUri: "https://api.calendly.com/users/ABC"
    }),
    "calendly https://api.calendly.com/users/ABC"
  );
  assert.equal(definitions[2].summarizeInput?.("getBoard", { boardId: "board-1" }), "miro board-1");
  assert.equal(definitions[2].summarizeInput?.("listBoards", {}), "miro boards");
  assert.equal(definitions[3].summarizeInput?.("listMeetings", {}), "zoom listMeetings");
  assert.equal(definitions[4].summarizeInput?.("getFile", { fileKey: "file-1" }), "figma file-1");
});
