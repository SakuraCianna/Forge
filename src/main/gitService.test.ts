import { describe, expect, it, vi } from "vitest";
import { commitProjectChanges, getProjectGitStatus } from "./gitService.js";

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
});
