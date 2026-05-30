// 本文件说明: 渲染 Agent 命令事件转换测试
import { describe, expect, it } from "vitest";
import { createCommandFinishedEvent, createCommandStartedEvent } from "./commandEvents";

describe("commandEvents", () => {
  it("creates a command started event", () => {
    const event = createCommandStartedEvent({
      threadId: "thread-1",
      command: "npm test",
      now: () => "2026-05-27T13:00:00.000Z"
    });

    expect(event).toEqual(
      expect.objectContaining({
        id: "thread-1-command-started-2026-05-27T13:00:00.000Z",
        kind: "command",
        commandRun: {
          command: "npm test",
          status: "running"
        },
        createdAt: "2026-05-27T13:00:00.000Z"
      })
    );
    expect(event.message).toContain("npm test");
  });

  it("keeps a command run id on started events", () => {
    const event = createCommandStartedEvent({
      threadId: "thread-1",
      command: "npm test",
      runId: "run-1",
      now: () => "2026-05-27T13:00:00.000Z"
    });

    expect(event.commandRun).toEqual({
      command: "npm test",
      runId: "run-1",
      status: "running"
    });
  });

  it("creates a successful command result event", () => {
    const result = {
      command: "npm test",
      cwd: "E:\\CodeHome\\Forge",
      exitCode: 0,
      stdout: "passed",
      stderr: "",
      timedOut: false
    };

    const event = createCommandFinishedEvent({
      threadId: "thread-1",
      result,
      now: () => "2026-05-27T13:00:00.000Z"
    });

    expect(event).toEqual(
      expect.objectContaining({
        id: "thread-1-command-finished-2026-05-27T13:00:00.000Z",
        kind: "result",
        commandResult: result,
        createdAt: "2026-05-27T13:00:00.000Z"
      })
    );
    expect(event.message).toContain("exitCode=0");
    expect(event.message).toContain("stdout:\npassed");
  });

  it("creates an error result event for failed commands", () => {
    const event = createCommandFinishedEvent({
      threadId: "thread-1",
      result: {
        command: "npm test",
        cwd: "E:\\CodeHome\\Forge",
        exitCode: 1,
        stdout: "",
        stderr: "failed",
        timedOut: false
      },
      now: () => "2026-05-27T13:00:00.000Z"
    });

    expect(event.kind).toBe("error");
    expect(event.message).toContain("stderr:\nfailed");
  });

  it("keeps structured command output on finished events", () => {
    const result = {
      command: "npm test",
      cwd: "E:\\CodeHome\\Forge",
      exitCode: 1,
      stdout: "ran 10 tests",
      stderr: "failed tests",
      timedOut: false
    };

    expect(
      createCommandFinishedEvent({
        threadId: "thread-1",
        result,
        now: () => "2026-05-27T13:00:00.000Z"
      })
    ).toEqual(expect.objectContaining({ commandResult: result }));
  });

  it("creates a cancelled command result event", () => {
    const result = {
      runId: "run-1",
      command: "npm test",
      cwd: "E:\\CodeHome\\Forge",
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      cancelled: true
    };

    const event = createCommandFinishedEvent({
      threadId: "thread-1",
      result,
      now: () => "2026-05-27T13:00:00.000Z"
    });

    expect(event.kind).toBe("error");
    expect(event.commandResult).toEqual(result);
    expect(event.message).toContain("取消");
  });
});
