import { describe, expect, it } from "vitest";
import { commandChannels, registerCommandHandlers } from "./commandIpc";

describe("commandIpc", () => {
  it("registers a project command runner handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();

    registerCommandHandlers(
      async (request) => ({
        command: request.command,
        cwd: request.cwd,
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        timedOut: false
      }),
      (channel, handler) => handlers.set(channel, handler)
    );

    const result = await handlers.get(commandChannels.run)?.(null, {
      projectRoot: "E:\\CodeHome\\Forge",
      cwd: "E:\\CodeHome\\Forge",
      command: "Write-Output ok"
    });

    expect(result).toEqual({
      command: "Write-Output ok",
      cwd: "E:\\CodeHome\\Forge",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false
    });
  });

  it("does not forward renderer-only command runner fields", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
    let forwardedRequest: unknown = null;

    registerCommandHandlers(
      async (request) => {
        forwardedRequest = request;

        return {
          command: request.command,
          cwd: request.cwd,
          exitCode: 0,
          stdout: "ok",
          stderr: "",
          timedOut: false
        };
      },
      (channel, handler) => handlers.set(channel, handler)
    );

    await handlers.get(commandChannels.run)?.(null, {
      projectRoot: "E:\\CodeHome\\Forge",
      cwd: "E:\\CodeHome\\Forge",
      command: "Write-Output ok",
      shellExecutable: "untrusted-shell.exe"
    });

    expect(forwardedRequest).toMatchObject({
      projectRoot: "E:\\CodeHome\\Forge",
      cwd: "E:\\CodeHome\\Forge",
      command: "Write-Output ok",
      timeoutMs: undefined
    });
    expect(forwardedRequest).not.toHaveProperty("shellExecutable");
    expect(forwardedRequest).toHaveProperty("onOutput", expect.any(Function));
  });

  it("streams command output chunks to the invoking web contents", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const sentMessages: Array<{ channel: string; payload: unknown }> = [];

    registerCommandHandlers(
      async (request) => {
        request.onOutput?.({
          runId: request.runId,
          command: request.command,
          stream: "stdout",
          chunk: "live output"
        });

        return {
          runId: request.runId,
          command: request.command,
          cwd: request.cwd,
          exitCode: 0,
          stdout: "live output",
          stderr: "",
          timedOut: false
        };
      },
      (channel, handler) => handlers.set(channel, handler)
    );

    await handlers.get(commandChannels.run)?.(
      {
        sender: {
          send: (channel: string, payload: unknown) => sentMessages.push({ channel, payload })
        }
      },
      {
        projectRoot: "E:\\CodeHome\\Forge",
        cwd: "E:\\CodeHome\\Forge",
        command: "Write-Output ok",
        runId: "run-1"
      }
    );

    expect(sentMessages).toEqual([
      {
        channel: commandChannels.output,
        payload: {
          runId: "run-1",
          command: "Write-Output ok",
          stream: "stdout",
          chunk: "live output"
        }
      }
    ]);
  });

  it("registers a command cancellation handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
    let forwardedRequest: unknown = null;

    registerCommandHandlers(
      async (request) => ({
        command: request.command,
        cwd: request.cwd,
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        timedOut: false
      }),
      (channel, handler) => handlers.set(channel, handler),
      async (request) => {
        forwardedRequest = request;

        return { ok: true, runId: request.runId };
      }
    );

    const result = await handlers.get(commandChannels.cancel)?.(null, {
      runId: "run-1",
      pid: 1234
    });

    expect(forwardedRequest).toEqual({ runId: "run-1" });
    expect(result).toEqual({ ok: true, runId: "run-1" });
  });
});
