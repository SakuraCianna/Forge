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
    expect(prompt).toContain("Failed action: Run npm test");
    expect(prompt).toContain("Failed command: npm test");
    expect(prompt).toContain("Command result: exitCode=1, timedOut=false");
    expect(prompt).toContain("Command cwd: E:\\CodeHome\\Forge");
    expect(prompt).toContain("stdout:\nran 199 tests");
    expect(prompt).toContain("stderr:\nTypeError: Cannot read properties of undefined");
  });
});
