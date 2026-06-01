// 本文件说明: 封装项目 Git 状态读取和提交命令
import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type {
  ProjectGitFileChange,
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitStatus,
  ProjectGitStatusRequest,
  ProjectGitWorktreeRequest,
  ProjectGitWorktreeResult
} from "../shared/gitTypes.js";

type GitCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type GitRunner = (args: string[], cwd: string) => Promise<GitCommandResult>;

type ProjectGitStatusOptions = ProjectGitStatusRequest & {
  runGit?: GitRunner;
};

type ProjectGitCommitOptions = ProjectGitCommitRequest & {
  runGit?: GitRunner;
};

type ProjectGitWorktreeOptions = ProjectGitWorktreeRequest & {
  runGit?: GitRunner;
  pathExists?: (targetPath: string) => Promise<boolean>;
};

// 读取当前分支, 变更列表和 diff, 让源代码管理页一次拿齐状态
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
      changes: [],
      rawStatus: ""
    };
  }

  const status = await runGit(["status", "--porcelain"], cwd);

  if (status.exitCode !== 0) {
    throw new Error(status.stderr.trim() || "git status failed");
  }

  const changes = await readGitChanges(status.stdout, cwd, runGit);

  return {
    isRepo: true,
    changedFiles: changes.map((change) => change.path),
    changes,
    rawStatus: status.stdout
  };
}

// 提交前先检查项目是否有变更, 避免生成空提交
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

  // 执行 Git 命令并把失败包装成可读错误
  async function runGitOrThrow(args: string[], commandCwd: string): Promise<GitCommandResult> {
    const result = await runGit(args, commandCwd);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
    }

    return result;
  }
}

// 在当前仓库旁创建永久 Git worktree, 新目录会自动加入最近项目
export async function createProjectWorktree({
  projectRoot,
  name,
  runGit = runGitCommand,
  pathExists = doesPathExist
}: ProjectGitWorktreeOptions): Promise<ProjectGitWorktreeResult> {
  const slug = normalizeWorktreeName(name);

  if (!slug) {
    throw new Error("Git worktree name is required");
  }

  const cwd = await realpath(projectRoot);
  const revParse = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);

  if (revParse.exitCode !== 0) {
    throw new Error("Selected project is not a Git repository");
  }

  const root = await runGit(["rev-parse", "--show-toplevel"], cwd);

  if (root.exitCode !== 0) {
    throw new Error(root.stderr.trim() || "Could not read Git repository root");
  }

  const repoRoot = root.stdout.trim() || cwd;
  const repoName = basename(repoRoot) || "project";
  const targetPath = resolve(dirname(repoRoot), `${repoName}-${slug}`);

  if (await pathExists(targetPath)) {
    throw new Error(`Git worktree directory already exists: ${targetPath}`);
  }

  const branch = `forge/${slug}`;
  const result = await runGit(["worktree", "add", "-b", branch, targetPath, "HEAD"], repoRoot);

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "git worktree create failed");
  }

  return {
    path: targetPath,
    branch,
    output: result.stdout.trim() || result.stderr.trim()
  };
}

// 以项目目录作为 cwd 运行 Git, stdout 和 stderr 都保留下来
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

// 检查目标路径是否已存在, 避免覆盖用户已有目录
async function doesPathExist(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

// 将用户输入转成安全的目录和分支片段
function normalizeWorktreeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// 解析 porcelain 输出并补充每个文件的 diff 片段
async function readGitChanges(
  output: string,
  cwd: string,
  runGit: GitRunner
): Promise<ProjectGitFileChange[]> {
  const entries = parseGitStatusEntries(output);

  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      diff: await readGitDiff(entry, cwd, runGit)
    }))
  );
}

// 优先读取普通 diff, 没有内容时再读取 staged diff
async function readGitDiff(
  entry: Omit<ProjectGitFileChange, "diff">,
  cwd: string,
  runGit: GitRunner
): Promise<string> {
  if (entry.status === "??") {
    const noIndexDiff = await runGit(["diff", "--no-index", "--", "/dev/null", entry.path], cwd);

    if (noIndexDiff.exitCode === 0 || noIndexDiff.exitCode === 1) {
      return noIndexDiff.stdout;
    }

    return noIndexDiff.stderr.trim();
  }

  const stagedDiff = await runGit(["diff", "--cached", "--", entry.path], cwd);
  const unstagedDiff = await runGit(["diff", "--", entry.path], cwd);

  return [stagedDiff.stdout, unstagedDiff.stdout].filter(Boolean).join("\n");
}

// 把 Git 双字符状态拆成索引状态和工作区状态
function parseGitStatusEntries(output: string): Array<Omit<ProjectGitFileChange, "diff">> {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const renameArrowIndex = rawPath.lastIndexOf(" -> ");
      const path = renameArrowIndex >= 0 ? rawPath.slice(renameArrowIndex + 4) : rawPath;

      return { path, status };
    });
}
