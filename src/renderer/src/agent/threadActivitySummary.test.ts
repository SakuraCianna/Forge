import { describe, expect, it } from "vitest";
import type { TaskThreadEvent } from "@/state/taskThreads";
import {
  getThreadActivitySummary,
  inferActivityKindFromText
} from "./threadActivitySummary";

describe("thread activity summary", () => {
  it("shows running command elapsed time from the first model work event", () => {
    const events: TaskThreadEvent[] = [
      {
        id: "plan-1",
        kind: "plan",
        message: "planning",
        createdAt: "2025-01-01T00:00:00.000Z"
      },
      {
        id: "cmd-1",
        kind: "command",
        message: "run tests",
        createdAt: "2025-01-01T00:00:05.000Z",
        commandRun: {
          command: "npm test",
          status: "running"
        }
      }
    ];

    expect(
      getThreadActivitySummary(events, "en-US", Date.parse("2025-01-01T00:01:10.000Z"))
    ).toEqual({
      kind: "running",
      activityKind: "command",
      label: "Running command",
      command: "npm test",
      meta: "1m 10s elapsed"
    });
  });

  it("uses concrete action labels to infer tool icons and Chinese elapsed text", () => {
    const events: TaskThreadEvent[] = [
      {
        id: "action-1",
        kind: "file",
        message: "editing",
        createdAt: "2025-01-01T00:00:02.000Z",
        agentActionRun: {
          actionId: "edit-1",
          label: "编辑 src/App.tsx",
          status: "started",
          startedAt: "2025-01-01T00:00:02.000Z"
        }
      }
    ];

    expect(
      getThreadActivitySummary(events, "zh-CN", Date.parse("2025-01-01T00:00:08.000Z"))
    ).toMatchObject({
      kind: "running",
      activityKind: "edit",
      label: "正在处理",
      command: "编辑 src/App.tsx",
      meta: "已用 6 秒"
    });
  });

  it("ignores command runs that already have matching results", () => {
    const events: TaskThreadEvent[] = [
      {
        id: "cmd-start",
        kind: "command",
        message: "run",
        createdAt: "2025-01-01T00:00:00.000Z",
        commandRun: {
          runId: "run-1",
          command: "npm test",
          status: "running"
        }
      },
      {
        id: "cmd-end",
        kind: "command",
        message: "done",
        createdAt: "2025-01-01T00:00:02.000Z",
        commandResult: {
          runId: "run-1",
          command: "npm test",
          cwd: "",
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false
        }
      }
    ];

    expect(getThreadActivitySummary(events, "en-US", Date.parse("2025-01-01T00:00:03.000Z"))).toBeNull();
  });

  it("maps common tool labels to activity kinds", () => {
    expect(inferActivityKindFromText("读取 README.md")).toBe("file");
    expect(inferActivityKindFromText("搜索 error")).toBe("search");
    expect(inferActivityKindFromText("运行 npm test")).toBe("command");
    expect(inferActivityKindFromText("Plan next step")).toBe("plan");
  });
});
