import { describe, expect, it } from "vitest";
import { createCommandFinishedEvent, createCommandStartedEvent } from "./commandEvents";

describe("commandEvents", () => {
  it("creates a command started event", () => {
    expect(
      createCommandStartedEvent({
        threadId: "thread-1",
        command: "npm test",
        now: () => "2026-05-27T13:00:00.000Z"
      })
    ).toEqual({
      id: "thread-1-command-started-2026-05-27T13:00:00.000Z",
      kind: "command",
      message: "开始执行命令: npm test",
      createdAt: "2026-05-27T13:00:00.000Z"
    });
  });

  it("creates a successful command result event", () => {
    expect(
      createCommandFinishedEvent({
        threadId: "thread-1",
        result: {
          command: "npm test",
          cwd: "E:\\CodeHome\\Forge",
          exitCode: 0,
          stdout: "passed",
          stderr: "",
          timedOut: false
        },
        now: () => "2026-05-27T13:00:00.000Z"
      })
    ).toEqual({
      id: "thread-1-command-finished-2026-05-27T13:00:00.000Z",
      kind: "result",
      message: "命令执行完成, exitCode=0\nstdout:\npassed",
      createdAt: "2026-05-27T13:00:00.000Z"
    });
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
});
