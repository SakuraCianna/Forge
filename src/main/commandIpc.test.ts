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

    expect(forwardedRequest).toEqual({
      projectRoot: "E:\\CodeHome\\Forge",
      cwd: "E:\\CodeHome\\Forge",
      command: "Write-Output ok",
      timeoutMs: undefined
    });
  });
});
