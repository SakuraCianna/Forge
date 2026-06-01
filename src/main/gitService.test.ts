import { describe, expect, it } from "vitest";
import { commitProjectChanges, getProjectGitStatus, pushProjectBranch } from "./gitService";

describe("getProjectGitStatus", () => {
  it("asks Git for unquoted UTF-8 paths and keeps Chinese file names intact", async () => {
    const calls: string[][] = [];
    const status = await getProjectGitStatus({
      projectRoot: process.cwd(),
      runGit: async (args) => {
        calls.push(args);

        if (args[0] === "rev-parse") {
          return { exitCode: 0, stdout: "true\n", stderr: "" };
        }

        if (args.includes("status")) {
          return { exitCode: 0, stdout: "?? 项目说明书.md\n", stderr: "" };
        }

        if (args.includes("diff")) {
          return {
            exitCode: 1,
            stdout: "diff --git a/项目说明书.md b/项目说明书.md\n+项目说明\n",
            stderr: "",
          };
        }

        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(status.changedFiles).toEqual(["项目说明书.md"]);
    expect(status.changes[0]?.diff).toContain("+项目说明");
    expect(
      calls.some(
        (args) => args[0] === "-c" && args[1] === "core.quotepath=false",
      ),
    ).toBe(true);
    expect(calls.find((args) => args.includes("diff"))?.at(-1)).toBe(
      "项目说明书.md",
    );
  });

  it("decodes existing Git quoted paths from porcelain output", async () => {
    const status = await getProjectGitStatus({
      projectRoot: process.cwd(),
      runGit: async (args) => {
        if (args[0] === "rev-parse") {
          return { exitCode: 0, stdout: "true\n", stderr: "" };
        }

        if (args.includes("status")) {
          return {
            exitCode: 0,
            stdout:
              '?? "\\351\\241\\271\\347\\233\\256\\350\\257\\264\\346\\230\\216\\344\\271\\246.md"\n',
            stderr: "",
          };
        }

        if (args.includes("diff")) {
          return { exitCode: 1, stdout: "diff\n", stderr: "" };
        }

        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    expect(status.changedFiles).toEqual(["项目说明书.md"]);
  });

  it("can commit on a selected branch and push after commit", async () => {
    const calls: string[][] = [];
    let currentBranch = "main";
    const result = await commitProjectChanges({
      projectRoot: process.cwd(),
      message: "test commit",
      branch: "forge/source-control",
      createBranch: true,
      push: true,
      remote: "origin",
      runGit: async (args) => {
        calls.push(args);

        if (args[0] === "rev-parse") {
          return { exitCode: 0, stdout: "true\n", stderr: "" };
        }

        if (args[0] === "check-ref-format") {
          return { exitCode: 0, stdout: "forge/source-control\n", stderr: "" };
        }

        if (args[0] === "branch" && args.includes("--show-current")) {
          return { exitCode: 0, stdout: `${currentBranch}\n`, stderr: "" };
        }

        if (args[0] === "branch") {
          return { exitCode: 0, stdout: "main\nforge/source-control\n", stderr: "" };
        }

        if (args[0] === "remote") {
          return { exitCode: 0, stdout: "origin\n", stderr: "" };
        }

        if (args.includes("status")) {
          return { exitCode: 0, stdout: " M src/App.tsx\n", stderr: "" };
        }

        if (args.includes("diff")) {
          return { exitCode: 0, stdout: "diff --git a/src/App.tsx b/src/App.tsx\n+line\n", stderr: "" };
        }

        if (args[0] === "switch") {
          currentBranch = args.at(-1) ?? currentBranch;
          return { exitCode: 0, stdout: "", stderr: "" };
        }

        if (args[0] === "commit") {
          return { exitCode: 0, stdout: "[forge/source-control abc] test commit\n", stderr: "" };
        }

        if (args[0] === "push") {
          return { exitCode: 0, stdout: "set upstream\n", stderr: "" };
        }

        return { exitCode: 0, stdout: "", stderr: "" };
      }
    });

    expect(calls).toContainEqual(["switch", "-c", "forge/source-control"]);
    expect(calls).toContainEqual(["push", "-u", "origin", "forge/source-control"]);
    expect(result.pushed).toBe(true);
    expect(result.pushOutput).toBe("set upstream");
  });

  it("pushes the current branch when no branch is provided", async () => {
    const calls: string[][] = [];
    const result = await pushProjectBranch({
      projectRoot: process.cwd(),
      runGit: async (args) => {
        calls.push(args);

        if (args[0] === "rev-parse") {
          return { exitCode: 0, stdout: "true\n", stderr: "" };
        }

        if (args[0] === "branch" && args.includes("--show-current")) {
          return { exitCode: 0, stdout: "codex/Forge\n", stderr: "" };
        }

        if (args[0] === "branch") {
          return { exitCode: 0, stdout: "codex/Forge\n", stderr: "" };
        }

        if (args[0] === "check-ref-format") {
          return { exitCode: 0, stdout: "codex/Forge\n", stderr: "" };
        }

        if (args[0] === "remote") {
          return { exitCode: 0, stdout: "origin\n", stderr: "" };
        }

        if (args.includes("status")) {
          return { exitCode: 0, stdout: "", stderr: "" };
        }

        if (args[0] === "push") {
          return { exitCode: 0, stdout: "pushed\n", stderr: "" };
        }

        return { exitCode: 0, stdout: "", stderr: "" };
      }
    });

    expect(calls).toContainEqual(["push", "-u", "origin", "codex/Forge"]);
    expect(result.branch).toBe("codex/Forge");
    expect(result.remote).toBe("origin");
  });
});
