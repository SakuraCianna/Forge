import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isReadableLiveProgressEvent,
  shouldShowCompactTranscriptEvent
} from "../src/renderer/src/agent/threadTranscriptEvents.js";
import type { TaskThreadEvent } from "../src/renderer/src/state/taskThreads.js";

test("compact user messages use hover copy and edit icon actions instead of retry text", async () => {
  const workspaceSource = await readFile("src/renderer/src/components/ThreadWorkspace.tsx", "utf8");
  const appSource = await readFile("src/renderer/src/App.tsx", "utf8");

  assert.doesNotMatch(workspaceSource, /重发并撤销|Retry and revert/u);
  assert.match(workspaceSource, /function renderUserMessageBubble/u);
  assert.match(workspaceSource, /group-hover:opacity-100/u);
  assert.match(workspaceSource, /navigator\.clipboard\?\.writeText\(message\)/u);
  assert.match(workspaceSource, /PencilLine/u);
  assert.match(workspaceSource, /onRetryThreadPrompt\(selectedThread\.id, event\.id\)/u);
  assert.match(appSource, /retryThreadPrompt\(threadId: string, userEventId\?: string\)/u);
  assert.match(appSource, /createThreadPromptRetryPlan\(\{ thread, userEventId \}\)/u);
});

test("compact transcript shows live process events before folding them after completion", async () => {
  const workspaceSource = await readFile("src/renderer/src/components/ThreadWorkspace.tsx", "utf8");
  const settingsSource = await readFile("src/renderer/src/components/SettingsPanel.tsx", "utf8");

  assert.equal(
    shouldShowCompactTranscriptEvent(
      createThreadEvent({ id: "event-user", kind: "user", message: "Build it" }),
      "completed"
    ),
    true
  );
  assert.equal(
    shouldShowCompactTranscriptEvent(
      createThreadEvent({
        id: "event-command",
        kind: "command",
        message: "开始执行命令: npm test",
        commandRun: { command: "npm test", status: "running" }
      }),
      "running"
    ),
    true
  );
  assert.equal(
    shouldShowCompactTranscriptEvent(
      createThreadEvent({
        id: "event-command",
        kind: "command",
        message: "开始执行命令: npm test",
        commandRun: { command: "npm test", status: "running" }
      }),
      "completed"
    ),
    false
  );
  assert.equal(
    shouldShowCompactTranscriptEvent(
      createThreadEvent({ id: "event-result", kind: "result", message: "Done" }),
      "completed"
    ),
    true
  );
  assert.match(workspaceSource, /shouldShowCompactTranscriptEvent\(event, selectedThread\.status\)/u);
  assert.match(settingsSource, /运行中展示读取、命令和编辑过程/u);
  assert.match(settingsSource, /while running, then fold/u);
});

test("compact transcript does not show internal agent action run records as chat text", async () => {
  const failedActionRun = createThreadEvent({
    id: "thread-agent-action-failed-action-1",
    kind: "error",
    message: "Agent 动作执行失败: 运行命令 npm run build",
    agentActionRun: {
      actionId: "action-1",
      label: "运行命令 npm run build",
      status: "failed"
    }
  });

  assert.equal(isReadableLiveProgressEvent(failedActionRun), false);
  assert.equal(shouldShowCompactTranscriptEvent(failedActionRun, "running"), false);
  assert.equal(
    isReadableLiveProgressEvent(
      createThreadEvent({
        id: "event-file",
        kind: "file",
        message: "已创建 1 个文件",
        fileChange: { relativePath: "src/App.tsx", changeKind: "create" }
      })
    ),
    true
  );
});

test("compact transcript keeps raw controlled tool results out of the chat stream", async () => {
  assert.equal(
    isReadableLiveProgressEvent(
      createThreadEvent({
        id: "thread-agent-built-in-tool-readFile-1",
        kind: "plan",
        message: "Built-in tool readFile result:\n{}"
      })
    ),
    false
  );
  assert.equal(
    isReadableLiveProgressEvent(
      createThreadEvent({
        id: "event-error",
        kind: "error",
        message: "命令失败"
      })
    ),
    true
  );
});

test("processed summary uses gray handled labels with collapsed details", async () => {
  const workspaceSource = await readFile("src/renderer/src/components/ThreadWorkspace.tsx", "utf8");

  assert.match(workspaceSource, /已处理 \$\{duration\}/u);
  assert.match(workspaceSource, /思考过程/u);
  assert.match(workspaceSource, /处理详情/u);
  assert.match(workspaceSource, /compactProcessedGroupExpanded\[group\.kind\] \?\? false/u);
  assert.doesNotMatch(workspaceSource, /executionRecord: "执行记录"/u);
});

function createThreadEvent(
  event: Partial<TaskThreadEvent> & Pick<TaskThreadEvent, "id" | "kind" | "message">
): TaskThreadEvent {
  return {
    createdAt: "2026-06-17T00:00:00.000Z",
    ...event
  };
}
