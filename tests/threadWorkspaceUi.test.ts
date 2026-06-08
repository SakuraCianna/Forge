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
