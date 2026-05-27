import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runProjectCommand } from "./commandRunner";

const testRoot = join(process.cwd(), ".tmp-test", "command-runner");

describe("commandRunner", () => {
  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("runs a PowerShell command inside the selected project", async () => {
    await mkdir(testRoot, { recursive: true });

    const result = await runProjectCommand({
      projectRoot: testRoot,
      cwd: testRoot,
      command: "Write-Output forge-ok",
      timeoutMs: 5000
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("forge-ok");
    expect(result.stderr).toBe("");
  });

  it("rejects commands outside the selected project root", async () => {
    await mkdir(testRoot, { recursive: true });

    await expect(
      runProjectCommand({
        projectRoot: testRoot,
        cwd: process.cwd(),
        command: "Write-Output nope",
        timeoutMs: 5000
      })
    ).rejects.toThrow("Command cwd must stay inside the selected project");
  });

  it("returns stderr and non-zero exit code without throwing", async () => {
    await mkdir(testRoot, { recursive: true });

    const result = await runProjectCommand({
      projectRoot: testRoot,
      cwd: testRoot,
      command: "Write-Error forge-fail; exit 7",
      timeoutMs: 5000
    });

    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain("forge-fail");
  });
});
