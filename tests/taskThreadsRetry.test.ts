import test from "node:test";
import assert from "node:assert/strict";
import type { TaskThread } from "../src/renderer/src/state/taskThreads.js";
import { createThreadPromptRetryPlan } from "../src/renderer/src/state/taskThreads.js";

test("thread prompt retry plan rolls back reversible file changes after the original prompt", () => {
  const plan = createThreadPromptRetryPlan({
    thread: {
      id: "thread-1",
      title: "Task",
      prompt: "写一个学生管理系统",
      status: "blocked",
      modelId: "model",
      intelligence: "high",
      speed: "balanced",
      createdAt: "2026-06-06T04:00:00.000Z",
      projectPath: "E:\\CodeHome\\Demo",
      events: [
        {
          id: "create-package",
          kind: "file",
          message: "已应用文件修改: package.json",
          createdAt: "2026-06-06T04:01:00.000Z",
          fileChange: {
            relativePath: "package.json",
            changeKind: "create",
            previousContent: null,
            nextContent: "{}\n"
          }
        },
        {
          id: "edit-index",
          kind: "file",
          message: "已应用文件修改: pages/index.js",
          createdAt: "2026-06-06T04:02:00.000Z",
          fileChange: {
            relativePath: "pages/index.js",
            changeKind: "edit",
            previousContent: "before\n",
            nextContent: "after\n"
          }
        }
      ]
    } satisfies TaskThread
  });

  assert.equal(plan.prompt, "写一个学生管理系统");
  assert.deepEqual(plan.fileReverts, [
    {
      relativePath: "pages/index.js",
      previousContent: "before\n"
    },
    {
      relativePath: "package.json",
      previousContent: null
    }
  ]);
});
