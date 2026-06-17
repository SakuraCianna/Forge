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

export type RunningProjectCommand = {
  runId: string;
  command: string;
  cwd: string;
  projectRoot: string;
  startedAt: string;
  startedAtMs: number;
  timeoutMs: number;
  runtime: AgentRuntime;
  shell: CommandShell;
};

type ProjectCommandRunner = {
  runProjectCommand: (options: RunProjectCommandOptions) => Promise<CommandResult>;
  cancelProjectCommand: (options: CancelProjectCommandOptions) => CancelProjectCommandResult;
  listRunningProjectCommands: () => RunningProjectCommand[];
};

type ProjectCommandRunnerDeps = {
  killProcessTree?: (pid: number) => boolean;
};

type RunningCommand = RunningProjectCommand & {
  cancel: () => boolean;
};

export type CommandOutputStreamDecoder = {
  decode: (buffer: Buffer) => string;
  flush: () => string;
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
    }),
    listRunningProjectCommands: () => Array.from(runningCommands.values(), snapshotRunningCommand)
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

// 读取默认全局运行器中的活动命令, 供 Agent 恢复和停止后台任务
export function listRunningProjectCommands(): RunningProjectCommand[] {
  return defaultRunner.listRunningProjectCommands();
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
    throw new Error("Command cwd must stay inside the selected project");
  }

  if (runId && runningCommands.has(runId)) {
    throw new Error("Command run id is already active");
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
    const stdoutDecoder = createCommandOutputStreamDecoder();
    const stderrDecoder = createCommandOutputStreamDecoder();
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      terminateCommandProcess(child, killProcessTree);
    }, timeoutMs);

    if (runId) {
      const startedAtMs = Date.now();
      runningCommands.set(runId, {
        runId,
        command,
        cwd: resolvedCwd,
        projectRoot: resolvedProjectRoot,
        startedAt: new Date(startedAtMs).toISOString(),
        startedAtMs,
        timeoutMs,
        runtime,
        shell,
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
      const decodedChunk = stdoutDecoder.decode(chunk);

      if (!decodedChunk) {
        return;
      }

      onOutput?.({
        runId,
        command,
        stream: "stdout",
        chunk: decodedChunk
      });
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
      const decodedChunk = stderrDecoder.decode(chunk);

      if (!decodedChunk) {
        return;
      }

      onOutput?.({
        runId,
        command,
        stream: "stderr",
        chunk: decodedChunk
      });
    });

    child.on("close", (exitCode) => {
      emitDecodedTail("stdout", stdoutDecoder.flush());
      emitDecodedTail("stderr", stderrDecoder.flush());
      cleanup();
      resolve({
        runId,
        command,
        cwd: resolvedCwd,
        exitCode,
        stdout: decodeCommandOutputBuffer(Buffer.concat(stdout)),
        stderr: decodeCommandOutputBuffer(Buffer.concat(stderr)),
        timedOut,
        cancelled
      });
    });

    function emitDecodedTail(stream: CommandOutputChunk["stream"], chunk: string): void {
      if (!chunk) {
        return;
      }

      onOutput?.({
        runId,
        command,
        stream,
        chunk
      });
    }

    child.on("error", (error) => {
      cleanup();
      reject(createShellStartError(shellInvocation, error));
    });
  });
}

function snapshotRunningCommand({
  runId,
  command,
  cwd,
  projectRoot,
  startedAt,
  startedAtMs,
  timeoutMs,
  runtime,
  shell
}: RunningCommand): RunningProjectCommand {
  return {
    runId,
    command,
    cwd,
    projectRoot,
    startedAt,
    startedAtMs,
    timeoutMs,
    runtime,
    shell
  };
}

// Windows 下 Maven/Javac 等工具可能按系统 ANSI/OEM 编码输出中文, 先保留 UTF-8, 明显乱码时回退 GB18030
export function decodeCommandOutputBuffer(buffer: Buffer): string {
  const utf8 = decodeUtf8(buffer);
  const gb18030 = decodeGb18030(buffer);

  if (gb18030 === null) {
    return utf8.text;
  }

  return chooseDecodedCommandOutput({
    utf8: utf8.text,
    gb18030,
    utf8HadDecodeErrors: !utf8.valid
  });
}

export function createCommandOutputStreamDecoder(): CommandOutputStreamDecoder {
  let selectedEncoding: "utf8" | "gb18030" | null = null;
  let selectedDecoder: TextDecoder | null = null;
  let pendingChunks: Buffer[] = [];

  function decodeWithSelectedEncoding(buffer: Buffer, stream: boolean): string {
    if (!selectedEncoding) {
      return "";
    }

    selectedDecoder ??= createTextDecoderForEncoding(selectedEncoding);

    return selectedDecoder.decode(buffer, { stream });
  }

  function decodePending(buffer: Buffer): string {
    pendingChunks.push(buffer);

    const pendingBuffer = Buffer.concat(pendingChunks);
    const utf8 = decodeUtf8(pendingBuffer);

    if (utf8.valid && isAscii(utf8.text)) {
      pendingChunks = [];
      return utf8.text;
    }

    if (!utf8.valid && mayEndWithIncompleteUtf8Sequence(pendingBuffer)) {
      return "";
    }

    const gb18030 = decodeGb18030(pendingBuffer);

    if (gb18030 === null) {
      selectedEncoding = "utf8";
      const decoded = decodeWithSelectedEncoding(pendingBuffer, true);
      pendingChunks = [];
      return decoded;
    }

    const choice = chooseCommandOutputEncoding({
      utf8: utf8.text,
      gb18030,
      utf8HadDecodeErrors: !utf8.valid
    });

    if (!choice.lockEncoding) {
      return "";
    }

    selectedEncoding = choice.encoding;
    const decoded = decodeWithSelectedEncoding(pendingBuffer, true);
    pendingChunks = [];

    return decoded;
  }

  function flushPending(): string {
    if (selectedEncoding) {
      return decodeWithSelectedEncoding(Buffer.alloc(0), false);
    }

    if (pendingChunks.length === 0) {
      return "";
    }

    const pendingBuffer = Buffer.concat(pendingChunks);
    pendingChunks = [];

    return decodeCommandOutputBuffer(pendingBuffer);
  }

  return {
    decode: (buffer) =>
      selectedEncoding ? decodeWithSelectedEncoding(buffer, true) : decodePending(buffer),
    flush: flushPending
  };
}

function decodeUtf8(buffer: Buffer): { text: string; valid: boolean } {
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      valid: true
    };
  } catch {
    return {
      text: buffer.toString("utf8"),
      valid: false
    };
  }
}

function decodeGb18030(buffer: Buffer): string | null {
  const decoder = createGb18030TextDecoder();

  return decoder?.decode(buffer) ?? null;
}

function createGb18030TextDecoder(): TextDecoder | null {
  try {
    return new TextDecoder("gb18030", { fatal: false });
  } catch {
    return null;
  }
}

function createTextDecoderForEncoding(encoding: "utf8" | "gb18030"): TextDecoder {
  return new TextDecoder(encoding === "utf8" ? "utf-8" : "gb18030", { fatal: false });
}

function chooseDecodedCommandOutput({
  utf8,
  gb18030,
  utf8HadDecodeErrors
}: {
  utf8: string;
  gb18030: string;
  utf8HadDecodeErrors: boolean;
}): string {
  return chooseCommandOutputEncoding({ utf8, gb18030, utf8HadDecodeErrors }).text;
}

function chooseCommandOutputEncoding({
  utf8,
  gb18030,
  utf8HadDecodeErrors
}: {
  utf8: string;
  gb18030: string;
  utf8HadDecodeErrors: boolean;
}): { text: string; encoding: "utf8" | "gb18030"; lockEncoding: boolean } {
  if (gb18030 === utf8) {
    return { text: utf8, encoding: "utf8", lockEncoding: false };
  }

  if (utf8HadDecodeErrors) {
    const preferGb18030 =
      countUnicodeReplacementCharacters(gb18030) < countUnicodeReplacementCharacters(utf8) ||
      countCjkCharacters(gb18030) > countCjkCharacters(utf8);

    return preferGb18030
      ? { text: gb18030, encoding: "gb18030", lockEncoding: true }
      : { text: utf8, encoding: "utf8", lockEncoding: true };
  }

  if (looksLikeValidUtf8MisdecodedGb18030(utf8, gb18030)) {
    return { text: gb18030, encoding: "gb18030", lockEncoding: true };
  }

  return {
    text: utf8,
    encoding: "utf8",
    lockEncoding:
      countCjkCharacters(utf8) > 0 ||
      (hasNonAscii(utf8) && countCjkCharacters(gb18030) === 0)
  };
}

function looksLikeValidUtf8MisdecodedGb18030(utf8: string, gb18030: string): boolean {
  return (
    countCjkCharacters(utf8) === 0 &&
    countCjkCharacters(gb18030) >= 2 &&
    countLikelyMojibakeCharacters(utf8) > 0
  );
}

function countUnicodeReplacementCharacters(value: string): number {
  return [...value].filter((char) => char === "\uFFFD").length;
}

function countCjkCharacters(value: string): number {
  return [...value].filter((char) => /\p{Script=Han}/u.test(char)).length;
}

function countLikelyMojibakeCharacters(value: string): number {
  return [...value].filter((char) => /[\p{Mark}\u00c0-\u024f]/u.test(char)).length;
}

function hasNonAscii(value: string): boolean {
  return [...value].some((char) => char.charCodeAt(0) > 0x7f);
}

function isAscii(value: string): boolean {
  return [...value].every((char) => char.charCodeAt(0) <= 0x7f);
}

function mayEndWithIncompleteUtf8Sequence(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  let continuationBytes = 0;
  let leadIndex = buffer.length - 1;

  while (leadIndex >= 0 && isUtf8ContinuationByte(buffer[leadIndex]!)) {
    continuationBytes += 1;
    leadIndex -= 1;
  }

  if (leadIndex < 0) {
    return false;
  }

  const expectedContinuationBytes = getExpectedUtf8ContinuationBytes(buffer[leadIndex]!);

  return expectedContinuationBytes > 0 && continuationBytes < expectedContinuationBytes;
}

function getExpectedUtf8ContinuationBytes(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) {
    return 1;
  }

  if (byte >= 0xe0 && byte <= 0xef) {
    return 2;
  }

  if (byte >= 0xf0 && byte <= 0xf4) {
    return 3;
  }

  return 0;
}

function isUtf8ContinuationByte(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
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
