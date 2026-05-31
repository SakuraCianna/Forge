// 本文件说明: 在项目边界内运行可取消命令并回传输出
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpath } from "node:fs/promises";
import { sep } from "node:path";
import type { AgentRuntime } from "../shared/agentTypes.js";
import type { CommandOutputChunk } from "../shared/commandTypes.js";

export type CommandShell = "powershell" | "cmd" | "git-bash";

export type RunProjectCommandOptions = {
  projectRoot: string;
  cwd: string;
  command: string;
  runId?: string;
  timeoutMs?: number;
  runtime?: AgentRuntime;
  shell?: CommandShell;
  shellExecutable?: string;
  onOutput?: (chunk: CommandOutputChunk) => void;
};

export type CancelProjectCommandOptions = {
  runId: string;
};

export type CancelProjectCommandResult = {
  ok: boolean;
  runId: string;
};

export type CommandResult = {
  runId?: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};

type ProjectCommandRunner = {
  runProjectCommand: (options: RunProjectCommandOptions) => Promise<CommandResult>;
  cancelProjectCommand: (options: CancelProjectCommandOptions) => CancelProjectCommandResult;
};

type ProjectCommandRunnerDeps = {
  killProcessTree?: (pid: number) => boolean;
};

type RunningCommand = {
  cancel: () => boolean;
};

// 创建带进程注册表的命令运行器, 多个命令可以独立取消
export function createProjectCommandRunner({
  killProcessTree = killDefaultProcessTree
}: ProjectCommandRunnerDeps = {}): ProjectCommandRunner {
  const runningCommands = new Map<string, RunningCommand>();

  return {
    runProjectCommand: (options) =>
      runProjectCommandWithRegistry(options, runningCommands, killProcessTree),
    cancelProjectCommand: ({ runId }) => ({
      ok: runningCommands.get(runId)?.cancel() ?? false,
      runId
    })
  };
}

const defaultRunner = createProjectCommandRunner();

// 使用默认全局运行器执行命令, 兼容简单调用路径
export function runProjectCommand(options: RunProjectCommandOptions): Promise<CommandResult> {
  return defaultRunner.runProjectCommand(options);
}

// 使用默认全局运行器取消命令, UI 停止按钮会走这里
export function cancelProjectCommand(
  options: CancelProjectCommandOptions
): CancelProjectCommandResult {
  return defaultRunner.cancelProjectCommand(options);
}

// 在确认 cwd 属于项目后启动子进程, 输出通过回调实时上报
async function runProjectCommandWithRegistry(
  {
    projectRoot,
    cwd,
    command,
    runId,
    timeoutMs = 120000,
    runtime = "windows-native",
    shell = "powershell",
    shellExecutable,
    onOutput
  }: RunProjectCommandOptions,
  runningCommands: Map<string, RunningCommand>,
  killProcessTree: (pid: number) => boolean
): Promise<CommandResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const resolvedCwd = await realpath(cwd);

  if (!isPathInside(resolvedCwd, resolvedProjectRoot)) {
    throw new Error("命令工作目录必须位于当前项目内。");
  }

  if (runId && runningCommands.has(runId)) {
    throw new Error("该命令运行 ID 已在执行中。");
  }

  return new Promise((resolve, reject) => {
    const shellInvocation = createShellInvocation(command, resolvedCwd, runtime, shell, shellExecutable);
    const child = spawn(shellInvocation.executable, shellInvocation.args, {
      cwd: resolvedCwd,
      windowsHide: true,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      }
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      terminateCommandProcess(child, killProcessTree);
    }, timeoutMs);

    if (runId) {
      runningCommands.set(runId, {
        cancel: () => {
          if (settled) {
            return false;
          }

          cancelled = true;
          return terminateCommandProcess(child, killProcessTree);
        }
      });
    }

    // 清理注册表和计时器, 确保正常结束和取消都释放资源
    function cleanup(): void {
      settled = true;
      clearTimeout(timer);

      if (runId) {
        runningCommands.delete(runId);
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
      onOutput?.({
        runId,
        command,
        stream: "stdout",
        chunk: chunk.toString("utf8")
      });
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      onOutput?.({
        runId,
        command,
        stream: "stderr",
        chunk: chunk.toString("utf8")
      });
    });

    child.on("close", (exitCode) => {
      cleanup();
      resolve({
        runId,
        command,
        cwd: resolvedCwd,
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
        cancelled
      });
    });

    child.on("error", (error) => {
      cleanup();
      reject(createShellStartError(shellInvocation, error));
    });
  });
}

// 根据用户选择构造真实 shell 调用参数, 让设置页的 Shell 选择不只是显示项
function createShellInvocation(
  command: string,
  resolvedCwd: string,
  runtime: AgentRuntime,
  shell: CommandShell,
  shellExecutable?: string
): { executable: string; args: string[]; label: string; recoveryHint: string } {
  if (runtime === "wsl") {
    return {
      executable: "wsl.exe",
      args: ["--cd", convertWindowsPathToWslPath(resolvedCwd), "--", "bash", "-lc", command],
      label: "WSL",
      recoveryHint: "Install WSL and a Linux distribution, or choose Windows native in Settings."
    };
  }

  if (shell === "cmd") {
    return {
      executable: shellExecutable ?? "cmd.exe",
      args: ["/d", "/s", "/c", command],
      label: "Command Prompt",
      recoveryHint: "Choose PowerShell in Settings if Command Prompt is unavailable."
    };
  }

  if (shell === "git-bash") {
    return {
      executable: shellExecutable ?? "bash.exe",
      args: ["-lc", command],
      label: "Git Bash",
      recoveryHint: "Install Git for Windows or add bash.exe to PATH, then retry the command."
    };
  }

  return {
    executable: shellExecutable ?? "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    label: "PowerShell",
    recoveryHint: "Choose CMD in Settings if PowerShell is unavailable."
  };
}

function convertWindowsPathToWslPath(windowsPath: string): string {
  const match = windowsPath.match(/^([A-Za-z]):[\\/]*(.*)$/u);

  if (!match) {
    throw new Error(`WSL command cwd must be on a local Windows drive: ${windowsPath}`);
  }

  const [, driveLetter, rest] = match;
  const normalizedRest = rest.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const mountRoot = `/mnt/${driveLetter.toLowerCase()}`;

  return normalizedRest ? `${mountRoot}/${normalizedRest}` : mountRoot;
}

// Shell 启动失败时保留可修复信息, 不让用户只看到底层 spawn ENOENT
function createShellStartError(
  shellInvocation: ReturnType<typeof createShellInvocation>,
  error: Error
): Error {
  return new Error(
    `Command shell ${shellInvocation.label} (${shellInvocation.executable}) could not be started. ${shellInvocation.recoveryHint} Details: ${error.message}`
  );
}

// 优先杀掉整棵进程树, 失败时回退到子进程自身
function terminateCommandProcess(
  child: ChildProcessWithoutNullStreams,
  killProcessTree: (pid: number) => boolean
): boolean {
  const treeKilled = typeof child.pid === "number" ? killProcessTree(child.pid) : false;

  if (treeKilled) {
    return true;
  }

  try {
    return child.kill();
  } catch {
    return false;
  }
}

// Windows 通过 taskkill 终止子进程树, 其他平台使用负 pid 进程组
function killDefaultProcessTree(pid: number): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true
  });

  return result.status === 0;
}

// 确认命令 cwd 没有逃出项目根目录
function isPathInside(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = candidatePath.toLocaleLowerCase();
  const normalizedRoot = rootPath.toLocaleLowerCase();

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`)
  );
}
