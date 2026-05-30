// 本文件说明: 主进程 Git 服务测试
import { describe, expect, it, vi } from "vitest";
import { basename, dirname, resolve } from "node:path";
import { commitProjectChanges, createProjectWorktree, getProjectGitStatus } from "./gitService.js";

const projectRoot = process.cwd();

describe("gitService", () => {
  it("returns changed files from git status --short", async () => {
    const runGit = vi.fn(async (args: string[]) => {
      if (args[0] === "rev-parse") {
        return { exitCode: 0, stdout: "true\n", stderr: "" };
      }

      if (args[0] === "diff" && args.includes("--cached")) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      if (args[0] === "diff" && args.includes("src/App.tsx")) {
        return {
          exitCode: 0,
          stdout: "diff --git a/src/App.tsx b/src/App.tsx\n+changed\n",
          stderr: ""
        };
      }

      if (args[0] === "diff" && args.includes("src/new.ts")) {
        return {
          exitCode: 1,
          stdout: "diff --git a/src/new.ts b/src/new.ts\n+new\n",
          stderr: ""
        };
      }

      return {
        exitCode: 0,
        stdout: " M src/App.tsx\n?? src/new.ts\n",
        stderr: ""
      };
    });

    await expect(getProjectGitStatus({ projectRoot, runGit })).resolves.toEqual({
      isRepo: true,
      changedFiles: ["src/App.tsx", "src/new.ts"],
      changes: [
        {
          path: "src/App.tsx",
          status: "M",
          diff: "diff --git a/src/App.tsx b/src/App.tsx\n+changed\n"
        },
        {
          path: "src/new.ts",
          status: "??",
          diff: "diff --git a/src/new.ts b/src/new.ts\n+new\n"
        }
      ],
      rawStatus: " M src/App.tsx\n?? src/new.ts\n"
    });
  });

  it("reports non-git projects without throwing", async () => {
    const runGit = vi.fn(async () => ({ exitCode: 128, stdout: "", stderr: "not a repo" }));

    await expect(getProjectGitStatus({ projectRoot, runGit })).resolves.toEqual({
      isRepo: false,
      changedFiles: [],
      changes: [],
      rawStatus: ""
    });
  });

  it("stages and commits project changes with an explicit message", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: " M src/App.tsx\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "diff --git a/src/App.tsx b/src/App.tsx\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "[main abc] update\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

    const result = await commitProjectChanges({
      projectRoot,
      message: "update files",
      runGit
    });

    expect(runGit.mock.calls.map(([args]) => args)).toEqual([
      ["rev-parse", "--is-inside-work-tree"],
      ["status", "--porcelain"],
      ["diff", "--cached", "--", "src/App.tsx"],
      ["diff", "--", "src/App.tsx"],
      ["add", "-A"],
      ["commit", "-m", "update files"],
      ["rev-parse", "--is-inside-work-tree"],
      ["status", "--porcelain"]
    ]);
    expect(result.output).toContain("[main abc] update");
    expect(result.status.changedFiles).toEqual([]);
  });

  it("creates a permanent worktree next to the repository", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: `${projectRoot}\n`, stderr: "" })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "Preparing worktree (new branch 'forge/feature-login')\n",
        stderr: ""
      });
    const expectedPath = resolve(dirname(projectRoot), `${basename(projectRoot)}-feature-login`);

    const result = await createProjectWorktree({
      projectRoot,
      name: "Feature Login",
      runGit,
      pathExists: async () => false
    });

    expect(runGit.mock.calls.map(([args]) => args)).toEqual([
      ["rev-parse", "--is-inside-work-tree"],
      ["rev-parse", "--show-toplevel"],
      ["worktree", "add", "-b", "forge/feature-login", expectedPath, "HEAD"]
    ]);
    expect(result).toEqual({
      path: expectedPath,
      branch: "forge/feature-login",
      output: "Preparing worktree (new branch 'forge/feature-login')"
    });
  });

  it("stops before creating a worktree when the target directory exists", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: `${projectRoot}\n`, stderr: "" });

    await expect(
      createProjectWorktree({
        projectRoot,
        name: "feature-login",
        runGit,
        pathExists: async () => true
      })
    ).rejects.toThrow("工作树目录已存在");

    expect(runGit).toHaveBeenCalledTimes(2);
  });
});
