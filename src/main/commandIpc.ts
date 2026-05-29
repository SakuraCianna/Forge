import { commandChannels } from "../shared/ipcChannels.js";
import type {
  CancelProjectCommandOptions,
  CancelProjectCommandResult,
  CommandResult,
  RunProjectCommandOptions
} from "./commandRunner.js";

type RunCommand = (request: RunProjectCommandOptions) => Promise<CommandResult>;
type CancelCommand = (
  request: CancelProjectCommandOptions
) => Promise<CancelProjectCommandResult> | CancelProjectCommandResult;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { commandChannels };

export function registerCommandHandlers(
  runCommand: RunCommand,
  registerHandler: RegisterHandler,
  cancelCommand: CancelCommand = (request) => ({ ok: false, runId: request.runId })
): void {
  registerHandler(commandChannels.run, async (_event, request) => runCommand(assertRunCommandRequest(request)));
  registerHandler(commandChannels.cancel, async (_event, request) =>
    cancelCommand(assertCancelCommandRequest(request))
  );
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
    runId: typeof value.runId === "string" ? value.runId : undefined,
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined
  };
}

function assertCancelCommandRequest(value: unknown): CancelProjectCommandOptions {
  if (!isRecord(value) || typeof value.runId !== "string") {
    throw new Error("Invalid command cancellation request");
  }

  return { runId: value.runId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
