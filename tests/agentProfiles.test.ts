import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultAgentProfiles,
  getActiveAgentProfileContext,
  getAgentProfileDisplayText,
  loadAgentProfiles,
  selectAgentProfile
} from "../src/renderer/src/state/agentProfiles.js";

test("built-in build profile prompts for scoped evidence-based verified changes", () => {
  const context = getActiveAgentProfileContext(createDefaultAgentProfiles(), "zh-CN");

  assert.equal(context.id, "build");
  assert.equal(context.planStepLimit, 12);
  assert.match(context.instructions, /读取真实项目文件/u);
  assert.match(context.instructions, /可验收结果/u);
  assert.match(context.instructions, /只围绕用户目标/u);
  assert.match(context.instructions, /不引入无关重构或依赖/u);
  assert.match(context.instructions, /数据契约/u);
  assert.match(context.instructions, /typecheck, test, build 或 lint/u);
  assert.match(context.instructions, /依据错误输出修复/u);
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
  assert.match(reviewContext.instructions, /触发条件/u);
  assert.match(reviewContext.instructions, /剩余测试缺口/u);
  assert.match(reviewContext.instructions, /不把风格偏好当成缺陷/u);

  const docsText = getAgentProfileDisplayText(docsProfile, "en-US");

  assert.match(docsText.systemPrompt, /real project evidence/u);
  assert.match(docsText.systemPrompt, /actionable steps/u);
  assert.match(docsText.systemPrompt, /implemented, unverified, and planned behavior/u);
  assert.match(docsText.systemPrompt, /do not present guesses as facts/u);
  assert.match(docsText.systemPrompt, /capabilities that are not present/u);
});

test("built-in profile migration upgrades previous default prompt text", () => {
  const oldPrompt =
    "先读取真实项目文件和当前状态, 只围绕用户目标做小而完整的改动; 优先复用现有结构, 不引入无关重构或依赖; 修改后运行匹配的 typecheck, test, build 或 lint, 如检查失败要修复或明确说明阻塞";
  const [buildProfile] = createDefaultAgentProfiles();
  assert.ok(buildProfile);
  const storage = createMemoryStorage({
    "forge.agentProfiles": JSON.stringify([
      {
        ...buildProfile,
        systemPrompt: oldPrompt
      }
    ])
  });
  const [migratedProfile] = loadAgentProfiles(storage);
  const context = getActiveAgentProfileContext([migratedProfile], "zh-CN");

  assert.match(context.instructions, /可验收结果/u);
  assert.match(context.instructions, /依据错误输出修复/u);
});

test("built-in build profile migrates old untouched plan limits", () => {
  const [buildProfile] = createDefaultAgentProfiles();
  assert.ok(buildProfile);
  const storage = createMemoryStorage({
    "forge.agentProfiles": JSON.stringify([
      {
        ...buildProfile,
        planStepLimit: 10
      }
    ])
  });
  const [migratedProfile] = loadAgentProfiles(storage);
  const context = getActiveAgentProfileContext([migratedProfile], "zh-CN");

  assert.equal(context.planStepLimit, 12);
});

test("customized build profile plan limits are preserved", () => {
  const [buildProfile] = createDefaultAgentProfiles();
  assert.ok(buildProfile);
  const storage = createMemoryStorage({
    "forge.agentProfiles": JSON.stringify([
      {
        ...buildProfile,
        planStepLimit: 8,
        updatedAt: "2026-06-01T00:00:00.000Z"
      }
    ])
  });
  const [migratedProfile] = loadAgentProfiles(storage);
  const context = getActiveAgentProfileContext([migratedProfile], "zh-CN");

  assert.equal(context.planStepLimit, 8);
});

function createMemoryStorage(values: Record<string, string>): Storage {
  const store = new Map(Object.entries(values));

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  };
}
