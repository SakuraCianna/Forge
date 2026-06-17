// 本文件说明: 覆盖内置服务 Extension 请求工具的轻量分支逻辑
import test from "node:test";
import assert from "node:assert/strict";

import { createFigmaAuthHeaders } from "../src/main/extensions/serviceRequests.js";

test("createFigmaAuthHeaders uses personal access token header for figd tokens", () => {
  assert.deepEqual(createFigmaAuthHeaders("figd_secret"), {
    "X-Figma-Token": "figd_secret"
  });
});

test("createFigmaAuthHeaders uses OAuth bearer header for non-figd tokens", () => {
  assert.deepEqual(createFigmaAuthHeaders("oauth_token"), {
    Authorization: "Bearer oauth_token"
  });
});
