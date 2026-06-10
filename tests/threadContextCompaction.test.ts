import test from "node:test";
import assert from "node:assert/strict";
import { createContinuationPlanTaskPrompt } from "../src/renderer/src/agent/continuationPlanPrompt.js";
import type { TaskThread } from "../src/renderer/src/state/taskThreads.js";
import {
  compactThreadContext,
  shouldAutoCompactThreadContext
} from "../src/renderer/src/state/threadContextCompaction.js";
import { createThreadConversation } from "../src/renderer/src/state/threadSelectors.js";

test("thread context compaction keeps a summary and only sends new turns afterward", () => {
  const thread = createLongThread();
  const { thread: compacted } = compactThreadContext(thread, {
    contextBudget: 900,
    createdAt: "2026-06-10T03:00:00.000Z",
    language: "zh-CN",
    reason: "manual"
  });
  const withFollowUp: TaskThread = {
    ...compacted,
    events: [
      ...compacted.events,
      {
        id: "new-user",
        kind: "user",
        message: "继续优化自动压缩",
        createdAt: "2026-06-10T03:01:00.000Z"
      }
    ]
  };
  const conversation = createThreadConversation(withFollowUp);

  assert.equal(compacted.contextCompaction?.sourceEventCount, thread.events.length);
  assert.equal(conversation[0]?.content, "实现长上下文任务");
  assert.match(conversation[1]?.content ?? "", /Context compaction summary/u);
  assert.equal(conversation.filter((turn) => turn.role === "user").length, 2);
  assert.equal(conversation.at(-1)?.content, "继续优化自动压缩");
});

test("continuation plan prompt includes compacted summary instead of full old event stream", () => {
  const { thread: compacted } = compactThreadContext(createLongThread(), {
    contextBudget: 900,
    createdAt: "2026-06-10T03:00:00.000Z",
    language: "zh-CN",
    reason: "auto"
  });
  const prompt = createContinuationPlanTaskPrompt(compacted);

  assert.match(prompt, /<compacted_thread_context>/u);
  assert.match(prompt, /Context compaction summary/u);
  assert.match(prompt, /自动压缩/u);
});

test("auto compaction triggers near the configured context budget", () => {
  const thread = createLongThread();

  assert.equal(shouldAutoCompactThreadContext(thread, 400), true);
});

function createLongThread(): TaskThread {
  return {
    id: "thread-compact",
    title: "Long task",
    prompt: "实现长上下文任务",
    status: "running",
    modelId: "model",
    intelligence: "high",
    speed: "balanced",
    createdAt: "2026-06-10T02:00:00.000Z",
    agentActions: [
      {
        id: "action-1",
        stepId: "step-1",
        kind: "run-command",
        label: "运行测试",
        status: "completed",
        command: "npm test"
      }
    ],
    events: Array.from({ length: 10 }, (_, index) => ({
      id: `event-${index}`,
      kind: index % 2 === 0 ? "user" : "result",
      message:
        index % 2 === 0
          ? `旧用户消息 ${index} ` + "需要保留事实 ".repeat(40)
          : `旧回答 ${index} ` + "已经完成部分实现 ".repeat(40),
      createdAt: `2026-06-10T02:${String(index).padStart(2, "0")}:00.000Z`
    }))
  };
}
