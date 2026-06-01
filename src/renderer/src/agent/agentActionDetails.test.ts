import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  formatActionDuration,
  formatAgentActionContextForClipboard,
  formatAgentActionRunForClipboard,
  formatAgentActionRunStatus,
  formatCommandOutputSnippet,
  formatCommandResultForClipboard,
  formatFailureRecoveryAttemptForClipboard
} from "./agentActionDetails";

const action: AgentAction = {
  id: "action-1",
  stepId: "step-1",
  kind: "run-command",
  label: "Run npm test",
  status: "failed",
  command: "npm test"
};

describe("agent action details", () => {
  it("formats action context with command, execution, recovery, and tool sections", () => {
    const context = formatAgentActionContextForClipboard(
      action,
      "Failed",
      "Generate a fix plan",
      {
        actionId: action.id,
        command: "npm test",
        cwd: "E:\\CodeHome\\Forge",
        exitCode: 1,
        stdout: "ok",
        stderr: "failed",
        timedOut: false
      },
      {
        id: "tool-1",
        kind: "plan",
        message: "Tool result message",
        createdAt: "2026-06-01T00:00:00.000Z"
      },
      {
        actionId: action.id,
        label: action.label,
        status: "failed",
        durationMs: 1250
      },
      [
        {
          actionId: action.id,
          label: action.label,
          source: "auto",
          attempt: 1,
          limit: 2,
          createdAt: "2026-06-01T00:00:00.000Z"
        }
      ]
    );

    expect(context).toContain("Action: Run npm test");
    expect(context).toContain("Command result:");
    expect(context).toContain("Execution record:");
    expect(context).toContain("Recovery history:");
    expect(context).toContain("Tool result:");
  });

  it("formats recovery attempts and execution records", () => {
    expect(
      formatFailureRecoveryAttemptForClipboard({
        actionId: action.id,
        label: action.label,
        source: "auto",
        attempt: 2,
        limit: 3,
        createdAt: "2026-06-01T00:00:00.000Z"
      })
    ).toBe("Source: auto, Attempt: 2 / 3, Created: 2026-06-01T00:00:00.000Z");

    expect(
      formatAgentActionRunForClipboard({
        actionId: action.id,
        label: action.label,
        status: "completed",
        durationMs: 800
      })
    ).toContain("Duration: 800 ms");
  });

  it("localizes run statuses and formats command results", () => {
    expect(formatAgentActionRunStatus("waiting", "zh-CN")).toBe("等待继续");
    expect(formatAgentActionRunStatus("waiting", "en-US")).toBe("Waiting");
    expect(formatActionDuration(1200)).toBe("1.2 s");
    expect(
      formatCommandResultForClipboard({
        command: "npm test",
        cwd: "E:\\CodeHome\\Forge",
        exitCode: 1,
        stdout: "",
        stderr: "failed",
        timedOut: false
      })
    ).toContain("stderr:\nfailed");
  });

  it("truncates long command output with context from both ends", () => {
    const output = `${"a".repeat(500)}\n${"b".repeat(500)}`;
    const snippet = formatCommandOutputSnippet(output);

    expect(snippet.length).toBeLessThan(output.length);
    expect(snippet).toContain("output truncated");
    expect(snippet.startsWith("a")).toBe(true);
    expect(snippet.endsWith("b")).toBe(true);
  });
});
