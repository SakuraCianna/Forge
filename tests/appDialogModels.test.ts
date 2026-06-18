import test from "node:test";
import assert from "node:assert/strict";
import {
  createContextCompactionCommandDialog,
  createFeedbackIssueUrl,
  createMcpCommandDialog,
  createProjectInstructionsCommandDialog,
  createStatusCommandDialog,
  getFeedbackDialogCopy
} from "../src/renderer/src/components/appDialogModels.js";

test("MCP command dialog reports local skill context without touching App state", () => {
  const dialog = createMcpCommandDialog("zh-CN", {
    scannedRoots: ["C:/Users/Sakura_Cianna/.codex/skills"],
    skills: [
      {
        coreFiles: ["SKILL.md"],
        deletable: false,
        description: "创建测试技能",
        directoryPath: "C:/Users/Sakura_Cianna/.codex/skills/test-skill",
        editable: false,
        filePath: "C:/Users/Sakura_Cianna/.codex/skills/test-skill/SKILL.md",
        id: "test-skill",
        name: "test-skill",
        source: "codex",
        sourceLabel: "Codex",
        userOwned: true
      }
    ],
    errors: []
  });

  assert.equal(dialog.title, "MCP 状态");
  assert.deepEqual(dialog.rows.map((row) => row.value), [
    "未接入",
    "1",
    "C:/Users/Sakura_Cianna/.codex/skills"
  ]);
});

test("project instructions dialog distinguishes created and existing states", () => {
  assert.match(
    createProjectInstructionsCommandDialog("zh-CN", "created", "AGENTS.md").description,
    /已创建默认 AGENTS\.md/u
  );
  assert.match(
    createProjectInstructionsCommandDialog("en-US", "exists", "AGENTS.md").description,
    /already exists/u
  );
});

test("status command dialog keeps absent project and model readable", () => {
  const dialog = createStatusCommandDialog("zh-CN", {
    currentModelId: null,
    currentProjectName: null,
    currentProjectPath: null,
    estimatedContextTokens: 4096,
    indexedFileCount: 88,
    localSkillCount: 2,
    threadCount: 3
  });

  assert.equal(dialog.title, "当前状态");
  assert.deepEqual(dialog.rows.map((row) => row.value), [
    "未选择",
    "-",
    "未选择",
    "88",
    "4096 tokens",
    "2",
    "3"
  ]);
});

test("context compaction dialog reports the compacted thread summary", () => {
  const dialog = createContextCompactionCommandDialog("zh-CN", {
    archived: false,
    contextCompaction: {
      content: "用户希望 Forge 输出更像 Codex。",
      createdAt: "2026-06-18T01:00:00.000Z",
      estimatedTokensAfter: 1200,
      estimatedTokensBefore: 9600,
      reason: "auto",
      retainedEventCount: 3,
      sourceEventCount: 42
    },
    createdAt: "2026-06-18T00:00:00.000Z",
    events: [],
    id: "thread-context",
    intelligence: "medium",
    modelId: "deepseek-v4-flash",
    prompt: "继续优化 Forge 输出",
    projectPath: "E:/CodeHome/Forge",
    speed: "balanced",
    status: "completed",
    title: "优化 Forge 输出"
  });

  assert.equal(dialog.title, "上下文已压缩");
  assert.deepEqual(dialog.rows.map((row) => row.value), [
    "优化 Forge 输出",
    "auto",
    "9600 -> 1200",
    "42"
  ]);
});

test("feedback issue URL trims detail and includes optional status summary", () => {
  const url = new URL(
    createFeedbackIssueUrl({
      category: "错误",
      currentModelId: "deepseek-v4-flash",
      currentProjectName: "Forge",
      detail: "  输出乱码  ",
      includeStatus: true,
      localSkillCount: 5,
      threadCount: 8
    })
  );
  const body = url.searchParams.get("body") ?? "";

  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/SakuraCianna/Forge/issues/new");
  assert.equal(url.searchParams.get("title"), "[Feedback] 错误");
  assert.equal(url.searchParams.get("labels"), "feedback");
  assert.match(body, /## Detail\n输出乱码/u);
  assert.match(body, /- Project: Forge/u);
  assert.match(body, /- Model: deepseek-v4-flash/u);
});

test("feedback copy stays localized for the dialog component", () => {
  assert.equal(getFeedbackDialogCopy("zh-CN").submit, "提交");
  assert.equal(getFeedbackDialogCopy("en-US").submit, "Submit");
});
