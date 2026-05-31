// 本文件说明: 验证 Agent 文件修改提示词会带上当前动作和队列上下文
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { TaskThread } from "@/state/taskThreads";
import { describe, expect, it } from "vitest";
import { createFileChangeTaskPrompt } from "./fileChangeTaskPrompt";

const editAction: AgentAction = {
  id: "action-2",
  stepId: "step-2",
  kind: "edit-file",
  label: "Edit docs/usage.md with installation steps",
  status: "pending",
  target: "docs/usage.md"
};

const thread: TaskThread = {
  id: "thread-1",
  title: "Create docs",
  prompt: "Create a project guide and verify it",
  status: "planned",
  modelId: "openai:gpt-5.5",
  intelligence: "high",
  speed: "balanced",
  createdAt: "2026-05-27T13:00:00.000Z",
  events: [],
  agentActions: [
    {
      id: "action-1",
      stepId: "step-1",
      kind: "inspect-file",
      label: "Inspect package.json",
      status: "completed",
      target: "package.json"
    },
    editAction,
    {
      id: "action-3",
      stepId: "step-3",
      kind: "run-command",
      label: "Run npm test",
      status: "pending",
      command: "npm test"
    }
  ]
};

describe("fileChangeTaskPrompt", () => {
  it("includes the current edit action and queue context", () => {
    const prompt = createFileChangeTaskPrompt(thread, "docs/usage.md", editAction);

    expect(prompt).toContain("Original task:\nCreate a project guide and verify it");
    expect(prompt).toContain("Target file:\ndocs/usage.md");
    expect(prompt).toContain("Current edit action:");
    expect(prompt).toContain("Label: Edit docs/usage.md with installation steps");
    expect(prompt).toContain("[completed] Inspect package.json");
    expect(prompt).toContain("[pending, current] Edit docs/usage.md with installation steps");
    expect(prompt).toContain("[pending] Run npm test");
    expect(prompt).toContain("Rewrite only the target file shown above.");
    expect(prompt).toContain("If the target file is empty, create the complete file content from scratch.");
  });

  it("still gives a focused target prompt for manual file generation", () => {
    const prompt = createFileChangeTaskPrompt({ ...thread, agentActions: undefined }, "src/App.tsx");

    expect(prompt).toContain("Original task:");
    expect(prompt).toContain("Target file:\nsrc/App.tsx");
    expect(prompt).not.toContain("Current edit action:");
    expect(prompt).not.toContain("Action queue:");
  });
});
