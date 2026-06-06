import test from "node:test";
import assert from "node:assert/strict";
import type { ModelSettings } from "../src/shared/modelTypes.js";
import type { TaskThread } from "../src/renderer/src/state/taskThreads.js";
import { createTaskSubmissionRoute } from "../src/renderer/src/state/taskSubmissionRouting.js";

test("project action submissions create a new thread instead of appending to a stopped project thread", () => {
  const route = createTaskSubmissionRoute({
    activeThread: thread("old-thread", "blocked"),
    currentProjectPath: "E:\\CodeHome\\Demo",
    hasProjectScan: true,
    prompt: "写一个学生管理系统, 数据库改成 sqlite",
    settings: modelSettings(),
    createId: () => "new-thread",
    now: () => "2026-06-06T05:00:00.000Z"
  });

  assert.equal(route.kind, "project-new");

  if (route.kind === "project-new") {
    assert.equal(route.thread.id, "new-thread");
    assert.equal(route.thread.prompt, "写一个学生管理系统, 数据库改成 sqlite");
  }
});

function modelSettings(): ModelSettings {
  return {
    language: "zh-CN",
    intelligence: "high",
    speed: "balanced",
    currentModelId: "test:model",
    providers: [
      {
        id: "test",
        label: "Test",
        kind: "openai-compatible",
        requiresBaseUrl: false
      }
    ],
    models: [
      {
        id: "test:model",
        providerId: "test",
        label: "Test Model",
        modelName: "model",
        enabled: true,
        capabilities: {
          reasoning: { type: "none" },
          streaming: true,
          toolCalling: true,
          vision: false
        },
        capabilitySource: "manual"
      }
    ]
  };
}

function thread(id: string, status: TaskThread["status"]): TaskThread {
  return {
    id,
    title: "Old task",
    prompt: "写一个学生管理系统, 数据库用 h2",
    status,
    modelId: "test:model",
    intelligence: "high",
    speed: "balanced",
    createdAt: "2026-06-06T04:00:00.000Z",
    projectPath: "E:\\CodeHome\\Demo",
    agentActions: [
      {
        id: "edit-package",
        stepId: "step-edit-package",
        kind: "edit-file",
        label: "编辑 package.json",
        status: "pending",
        target: "package.json"
      }
    ],
    events: [
      {
        id: "old-plan",
        kind: "plan",
        message: "old plan",
        createdAt: "2026-06-06T04:01:00.000Z"
      },
      {
        id: "old-stop",
        kind: "error",
        message: "已终止",
        createdAt: "2026-06-06T04:02:00.000Z"
      }
    ]
  };
}
