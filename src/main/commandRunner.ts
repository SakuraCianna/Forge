import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { sep } from "node:path";

export type RunProjectCommandOptions = {
  projectRoot: string;
  cwd: string;
  command: string;
  timeoutMs?: number;
  shellExecutable?: string;
};

export type CommandResult = {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export async function runProjectCommand({
  projectRoot,
  cwd,
  command,
  timeoutMs = 120000,
  shellExecutable = "powershell.exe"
}: RunProjectCommandOptions): Promise<CommandResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const resolvedCwd = await realpath(cwd);

  if (!isPathInside(resolvedCwd, resolvedProjectRoot)) {
    throw new Error("Command cwd must stay inside the selected project");
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

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        command,
        cwd: resolvedCwd,
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start command shell: ${error.message}`));
    });
  });
}

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = candidatePath.toLocaleLowerCase();
  const normalizedRoot = rootPath.toLocaleLowerCase();

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`)
  );
}
