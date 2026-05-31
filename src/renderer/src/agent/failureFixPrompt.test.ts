// 本文件说明: 渲染 Agent 失败恢复提示词测试
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { CommandRunResult, TaskThread } from "@/state/taskThreads";
import { describe, expect, it } from "vitest";
import { createFailureFixTaskPrompt } from "./failureFixPrompt";

const thread: TaskThread = {
  id: "thread-1",
  title: "Fix failing tests",
  prompt: "Fix the broken test suite",
  status: "blocked",
  modelId: "openai:gpt-5.5",
  intelligence: "high",
  speed: "balanced",
  createdAt: "2026-05-27T13:00:00.000Z",
  events: []
};

const action: AgentAction = {
  id: "action-1",
  stepId: "step-1",
  kind: "run-command",
  label: "Run npm test",
  status: "failed",
  command: "npm test"
};

describe("failureFixPrompt", () => {
  it("includes the latest command output when generating a fix prompt", () => {
    const commandResult: CommandRunResult = {
      command: "npm test",
      cwd: "E:\\CodeHome\\Forge",
      exitCode: 1,
      stdout: "ran 199 tests",
      stderr: "TypeError: Cannot read properties of undefined",
      timedOut: false
    };

    const prompt = createFailureFixTaskPrompt(thread, action, commandResult);

    expect(prompt).toContain("Original task: Fix the broken test suite");
    expect(prompt).toContain("Current thread status: blocked");
    expect(prompt).toContain("Failed action: Run npm test");
    expect(prompt).toContain("Failed command: npm test");
    expect(prompt).toContain("Command result: exitCode=1, timedOut=false, cancelled=false");
    expect(prompt).toContain("Command cwd: E:\\CodeHome\\Forge");
    expect(prompt).toContain("stdout:\nran 199 tests");
    expect(prompt).toContain("stderr:\nTypeError: Cannot read properties of undefined");
    expect(prompt).toContain('Return a JSON object with a "steps" array');
  });

  it("keeps the tail of long command output so the model sees the final error", () => {
    const commandResult: CommandRunResult = {
      command: "npm test",
      cwd: "E:\\CodeHome\\Forge",
      exitCode: 1,
      stdout: "",
      stderr: [
        "setup started",
        "x".repeat(2200),
        "FINAL ERROR: expected settings page route to be reachable"
      ].join("\n"),
      timedOut: false
    };

    const prompt = createFailureFixTaskPrompt(thread, action, commandResult);

    expect(prompt).toContain("setup started");
    expect(prompt).toContain("FINAL ERROR: expected settings page route to be reachable");
    expect(prompt).toContain("output truncated, middle omitted");
  });

  it("adds action queue and recent execution context for recovery planning", () => {
    const failedAction: AgentAction = {
      id: "action-2",
      stepId: "step-2",
      kind: "edit-file",
      label: "Edit docs/usage.md",
      status: "failed",
      target: "docs/usage.md"
    };
    const prompt = createFailureFixTaskPrompt(
      {
        ...thread,
        events: [
          {
            id: "event-1",
            kind: "file",
            message: "Generated file change suggestion docs/usage.md",
            createdAt: "2026-05-27T13:01:00.000Z"
          },
          {
            id: "event-2",
            kind: "error",
            message: "Model file modification failed: file path was missing",
            createdAt: "2026-05-27T13:02:00.000Z"
          }
        ],
        agentActions: [
          {
            id: "action-1",
            stepId: "step-1",
            kind: "inspect-file",
            label: "Inspect package.json",
            status: "completed",
            target: "package.json"
          },
          failedAction,
          {
            id: "action-3",
            stepId: "step-3",
            kind: "run-command",
            label: "Run npm test",
            status: "pending",
            command: "npm test"
          }
        ]
      },
      failedAction
    );

    expect(prompt).toContain("Action queue:");
    expect(prompt).toContain("[completed] Inspect package.json");
    expect(prompt).toContain("[failed, current failure] Edit docs/usage.md");
    expect(prompt).toContain("[pending] Run npm test");
    expect(prompt).toContain("Recent execution context:");
    expect(prompt).toContain("file at 2026-05-27T13:01:00.000Z");
    expect(prompt).toContain("error at 2026-05-27T13:02:00.000Z");
    expect(prompt).toContain("Reuse completed work");
  });

  it("keeps final errors from recent command context when the failed action is not a command", () => {
    const failedAction: AgentAction = {
      id: "action-2",
      stepId: "step-2",
      kind: "edit-file",
      label: "Edit src/settings.ts",
      status: "failed",
      target: "src/settings.ts"
    };
    const prompt = createFailureFixTaskPrompt(
      {
        ...thread,
        events: [
          {
            id: "event-1",
            kind: "command",
            message: "Command failed: npm run build",
            createdAt: "2026-05-27T13:03:00.000Z",
            commandResult: {
              command: "npm run build",
              cwd: "E:\\CodeHome\\Forge",
              exitCode: 1,
              stdout: "",
              stderr: [
                "build started",
                "y".repeat(900),
                "FINAL BUILD ERROR: Cannot find module './settings'"
              ].join("\n"),
              timedOut: false
            }
          }
        ],
        agentActions: [failedAction]
      },
      failedAction
    );

    expect(prompt).toContain("Recent execution context:");
    expect(prompt).toContain("build started");
    expect(prompt).toContain("FINAL BUILD ERROR: Cannot find module './settings'");
    expect(prompt).toContain("output truncated, middle omitted");
  });
});
