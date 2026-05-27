import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitStatus,
  ProjectGitStatusRequest
} from "../shared/gitTypes.js";

export type GitCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type GitRunner = (args: string[], cwd: string) => Promise<GitCommandResult>;

type ProjectGitStatusOptions = ProjectGitStatusRequest & {
  runGit?: GitRunner;
};

type ProjectGitCommitOptions = ProjectGitCommitRequest & {
  runGit?: GitRunner;
};

export async function getProjectGitStatus({
  projectRoot,
  runGit = runGitCommand
}: ProjectGitStatusOptions): Promise<ProjectGitStatus> {
  const cwd = await realpath(projectRoot);
  const revParse = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);

  if (revParse.exitCode !== 0) {
    return {
      isRepo: false,
      changedFiles: [],
      rawStatus: ""
    };
  }

  const status = await runGit(["status", "--short"], cwd);

  if (status.exitCode !== 0) {
    throw new Error(status.stderr.trim() || "git status failed");
  }

  return {
    isRepo: true,
    changedFiles: parseGitStatusFiles(status.stdout),
    rawStatus: status.stdout
  };
}

export async function commitProjectChanges({
  projectRoot,
  message,
  runGit = runGitCommand
}: ProjectGitCommitOptions): Promise<ProjectGitCommitResult> {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    throw new Error("Commit message is required");
  }

  const cwd = await realpath(projectRoot);
  const status = await getProjectGitStatus({ projectRoot: cwd, runGit });

  if (!status.isRepo) {
    throw new Error("Selected project is not a Git repository");
  }

  if (status.changedFiles.length === 0) {
    throw new Error("No changes to commit");
  }

  await runGitOrThrow(["add", "-A"], cwd);
  const commit = await runGitOrThrow(["commit", "-m", normalizedMessage], cwd);
  const nextStatus = await getProjectGitStatus({ projectRoot: cwd, runGit });

  return {
    output: commit.stdout.trim() || commit.stderr.trim(),
    status: nextStatus
  };

  async function runGitOrThrow(args: string[], commandCwd: string): Promise<GitCommandResult> {
    const result = await runGit(args, commandCwd);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
    }

    return result;
  }
}

function runGitCommand(args: string[], cwd: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1"
      }
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("close", (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });

    child.on("error", (error) => {
      resolve({
        exitCode: null,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: error.message
      });
    });
  });
}

function parseGitStatusFiles(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const filePath = line.slice(3).trim();
      const renameArrowIndex = filePath.lastIndexOf(" -> ");
      return renameArrowIndex >= 0 ? filePath.slice(renameArrowIndex + 4) : filePath;
    });
}
