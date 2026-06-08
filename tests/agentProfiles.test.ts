import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultAgentProfiles,
  getActiveAgentProfileContext,
  getAgentProfileDisplayText,
  selectAgentProfile
} from "../src/renderer/src/state/agentProfiles.js";

test("built-in build profile prompts for scoped evidence-based verified changes", () => {
  const context = getActiveAgentProfileContext(createDefaultAgentProfiles(), "zh-CN");

  assert.equal(context.id, "build");
  assert.match(context.instructions, /读取真实项目文件/u);
  assert.match(context.instructions, /只围绕用户目标/u);
  assert.match(context.instructions, /不引入无关重构或依赖/u);
  assert.match(context.instructions, /typecheck, test, build 或 lint/u);
  assert.match(context.instructions, /明确说明阻塞/u);
});

test("built-in review and docs profiles keep their specialized prompt boundaries", () => {
  const defaultProfiles = createDefaultAgentProfiles();
  const reviewContext = getActiveAgentProfileContext(
    selectAgentProfile(defaultProfiles, "review"),
    "zh-CN"
  );
  const docsProfile = defaultProfiles.find((profile) => profile.id === "docs");

  assert.ok(docsProfile);
  assert.match(reviewContext.instructions, /只读审查姿态/u);
  assert.match(reviewContext.instructions, /按严重程度排序/u);
  assert.match(reviewContext.instructions, /不把风格偏好当成缺陷/u);

  const docsText = getAgentProfileDisplayText(docsProfile, "en-US");

  assert.match(docsText.systemPrompt, /real project evidence/u);
  assert.match(docsText.systemPrompt, /implemented, unverified, and planned behavior/u);
  assert.match(docsText.systemPrompt, /do not present guesses as facts/u);
});
