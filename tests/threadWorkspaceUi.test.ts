import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

  assert.match(workspaceSource, /shouldShowCompactTranscriptEvent\(\s*event: TaskThreadEvent,\s*threadStatus: TaskThread\["status"\]/u);
  assert.match(workspaceSource, /event\.kind === "result" && !isReadableLiveProgressEvent\(event\)/u);
  assert.match(workspaceSource, /threadStatus === "completed"/u);
  assert.match(workspaceSource, /isReadableLiveProgressEvent\(event\)/u);
  assert.match(workspaceSource, /isRawPlanStreamEvent\(event\)/u);
  assert.match(workspaceSource, /shouldShowCompactTranscriptEvent\(event, selectedThread\.status\)/u);
  assert.match(settingsSource, /运行中展示读取、命令和编辑过程/u);
  assert.match(settingsSource, /while running, then fold/u);
});
