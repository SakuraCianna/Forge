// 本文件说明: 主进程 命令运行器
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { realpath } from "node:fs/promises";
import { sep } from "node:path";
import type { CommandOutputChunk } from "../shared/commandTypes.js";

export type RunProjectCommandOptions = {
  projectRoot: string;
  cwd: string;
  command: string;
  runId?: string;
  timeoutMs?: number;
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

export type ProjectCommandRunner = {
  runProjectCommand: (options: RunProjectCommandOptions) => Promise<CommandResult>;
  cancelProjectCommand: (options: CancelProjectCommandOptions) => CancelProjectCommandResult;
};

type ProjectCommandRunnerDeps = {
  killProcessTree?: (pid: number) => boolean;
};

type RunningCommand = {
  cancel: () => boolean;
};

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

export function runProjectCommand(options: RunProjectCommandOptions): Promise<CommandResult> {
  return defaultRunner.runProjectCommand(options);
}

export function cancelProjectCommand(
  options: CancelProjectCommandOptions
): CancelProjectCommandResult {
  return defaultRunner.cancelProjectCommand(options);
}

async function runProjectCommandWithRegistry(
  {
    projectRoot,
    cwd,
    command,
    runId,
    timeoutMs = 120000,
    shellExecutable = "powershell.exe",
    onOutput
  }: RunProjectCommandOptions,
  runningCommands: Map<string, RunningCommand>,
  killProcessTree: (pid: number) => boolean
): Promise<CommandResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const resolvedCwd = await realpath(cwd);

  if (!isPathInside(resolvedCwd, resolvedProjectRoot)) {
    throw new Error("Command cwd must stay inside the selected project");
  }

  if (runId && runningCommands.has(runId)) {
    throw new Error("Command run id is already active");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      shellExecutable,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        cwd: resolvedCwd,
        windowsHide: true,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          NO_COLOR: "1"
        }
      }
    );

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
      reject(new Error(`Failed to start command shell: ${error.message}`));
    });
  });
}

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

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = candidatePath.toLocaleLowerCase();
  const normalizedRoot = rootPath.toLocaleLowerCase();

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`)
  );
}
