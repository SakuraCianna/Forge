import { commandChannels } from "../shared/ipcChannels.js";
import type { CommandResult, RunProjectCommandOptions } from "./commandRunner.js";

type RunCommand = (request: RunProjectCommandOptions) => Promise<CommandResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { commandChannels };

export function registerCommandHandlers(runCommand: RunCommand, registerHandler: RegisterHandler): void {
  registerHandler(commandChannels.run, async (_event, request) => runCommand(assertRunCommandRequest(request)));
}

function assertRunCommandRequest(value: unknown): RunProjectCommandOptions {
  if (
    !isRecord(value) ||
    typeof value.projectRoot !== "string" ||
    typeof value.cwd !== "string" ||
    typeof value.command !== "string"
  ) {
    throw new Error("Invalid command request");
  }

  return {
    projectRoot: value.projectRoot,
    cwd: value.cwd,
    command: value.command,
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
