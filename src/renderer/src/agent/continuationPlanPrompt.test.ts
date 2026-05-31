// 本文件说明: 验证 Agent 后续计划提示会携带真实线程状态和工具结果
import { describe, expect, it } from "vitest";
import type { TaskThread } from "@/state/taskThreads";
import { createContinuationPlanTaskPrompt } from "./continuationPlanPrompt";

describe("createContinuationPlanTaskPrompt", () => {
  it("includes completed and skipped actions plus recent tool results", () => {
    const thread: TaskThread = {
      id: "thread-1",
      title: "Continue agent task",
      prompt: "Update the project README and verify it",
      status: "completed",
      modelId: "openai:gpt-test",
      intelligence: "high",
      speed: "balanced",
      createdAt: "2026-05-31T08:00:00.000Z",
      events: [
        {
          id: "event-read",
          kind: "file",
          message: "File read complete: README.md (42 bytes)\n# Forge\nExisting content",
          createdAt: "2026-05-31T08:01:00.000Z"
        },
        {
          id: "event-command",
          kind: "result",
          message: "Command failed",
          createdAt: "2026-05-31T08:02:00.000Z",
          commandResult: {
            command: "npm test",
            cwd: "E:\\CodeHome\\Forge",
            exitCode: 1,
            stdout: "",
            stderr: "README assertion failed",
            timedOut: false
          }
        }
      ],
      agentActions: [
        {
          id: "action-1",
          stepId: "step-1",
          kind: "inspect-file",
          label: "Inspect README.md",
          status: "completed",
          target: "README.md"
        },
        {
          id: "action-2",
          stepId: "step-2",
          kind: "run-command",
          label: "Run risky command",
          status: "skipped",
          command: "Remove-Item -Recurse src"
        }
      ]
    };

    const prompt = createContinuationPlanTaskPrompt(thread);

    expect(prompt).toContain("Original task: Update the project README and verify it");
    expect(prompt).toContain("Current thread status: completed");
    expect(prompt).toContain("[completed] Inspect README.md");
    expect(prompt).toContain("[skipped] Run risky command");
    expect(prompt).toContain("Prior controlled tool results:");
    expect(prompt).toContain("File read complete: README.md");
    expect(prompt).toContain("Recent execution context:");
    expect(prompt).toContain("README assertion failed");
    expect(prompt).toContain("Generate the next execution plan from the current state.");
    expect(prompt).toContain("do not repeat completed or skipped actions");
  });
});
