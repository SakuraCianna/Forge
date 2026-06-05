import test from "node:test";
import assert from "node:assert/strict";
import {
  developmentQaSandboxProject,
  getProductionDefaultProjectPath
} from "../src/shared/developmentSandboxConfig.js";

test("development QA sandbox is configured without becoming a production default", () => {
  assert.equal(developmentQaSandboxProject.kind, "development-qa-sandbox");
  assert.equal(developmentQaSandboxProject.path, "E:\\CodeHome\\已完结的项目\\测试项目");
  assert.equal(developmentQaSandboxProject.modelId, "mimo-v2.5-pro");
  assert.equal(getProductionDefaultProjectPath(), null);
});
