// 本文件说明: 注册命令运行 IPC, 所有命令请求先经过结构校验
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

type IpcEvent = {
  sender?: {
    send: (channel: string, payload: unknown) => void;
  };
};

type IpcHandler = (_event: IpcEvent, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { commandChannels };

// 把命令运行和取消能力暴露给渲染层, 输出流通过 sender 回传
export function registerCommandHandlers(
  runCommand: RunCommand,
  registerHandler: RegisterHandler,
  cancelCommand: CancelCommand = (request) => ({ ok: false, runId: request.runId })
): void {
  registerHandler(commandChannels.run, async (event, request) => {
    const commandRequest = assertRunCommandRequest(request);

    return runCommand({
      ...commandRequest,
      onOutput: (chunk) => event.sender?.send(commandChannels.output, chunk)
    });
  });
  registerHandler(commandChannels.cancel, async (_event, request) =>
    cancelCommand(assertCancelCommandRequest(request))
  );
}

// 校验命令运行请求, projectRoot, cwd 和 command 都必须是字符串
function assertRunCommandRequest(value: unknown): RunProjectCommandOptions {
  if (
    !isRecord(value) ||
    typeof value.projectRoot !== "string" ||
    typeof value.cwd !== "string" ||
    typeof value.command !== "string"
  ) {
    throw new Error("无效的命令请求。");
  }

  return {
    projectRoot: value.projectRoot,
    cwd: value.cwd,
    command: value.command,
    runId: typeof value.runId === "string" ? value.runId : undefined,
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined,
    runtime: isAgentRuntime(value.runtime) ? value.runtime : undefined,
    shell: isCommandShell(value.shell) ? value.shell : undefined,
    shellExecutable: typeof value.shellExecutable === "string" ? value.shellExecutable : undefined
  };
}

// 校验取消命令请求, 只允许通过 runId 取消已登记的进程
function assertCancelCommandRequest(value: unknown): CancelProjectCommandOptions {
  if (!isRecord(value) || typeof value.runId !== "string") {
    throw new Error("无效的命令取消请求。");
  }

  return { runId: value.runId };
}

// 将 IPC 入参缩窄为普通对象, 后续字段校验才有类型保证
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommandShell(value: unknown): value is RunProjectCommandOptions["shell"] {
  return value === "powershell" || value === "cmd" || value === "git-bash";
}

function isAgentRuntime(value: unknown): value is RunProjectCommandOptions["runtime"] {
  return value === "windows-native" || value === "wsl";
}
