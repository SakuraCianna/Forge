import { describe, expect, it } from "vitest";
import { getProjectGitStatus } from "./gitService";

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
});
