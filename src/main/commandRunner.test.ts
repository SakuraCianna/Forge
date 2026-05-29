import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createProjectCommandRunner, runProjectCommand } from "./commandRunner";

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

  it("streams stdout and stderr chunks while a command is running", async () => {
    await mkdir(testRoot, { recursive: true });
    const chunks: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];

    const result = await runProjectCommand({
      projectRoot: testRoot,
      cwd: testRoot,
      command: "Write-Output live-stdout; Write-Error live-stderr; exit 7",
      timeoutMs: 5000,
      onOutput: (chunk) => chunks.push({ stream: chunk.stream, chunk: chunk.chunk })
    });

    expect(result.exitCode).toBe(7);
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stream: "stdout", chunk: expect.stringContaining("live-stdout") }),
        expect.objectContaining({ stream: "stderr", chunk: expect.stringContaining("live-stderr") })
      ])
    );
  });

  it("rejects when the command shell cannot be spawned", async () => {
    await mkdir(testRoot, { recursive: true });

    await expect(
      runProjectCommand({
        projectRoot: testRoot,
        cwd: testRoot,
        command: "Write-Output never-runs",
        timeoutMs: 5000,
        shellExecutable: "forge-missing-shell.exe"
      })
    ).rejects.toThrow("Failed to start command shell");
  });

  it("cancels a running command by run id", async () => {
    await mkdir(testRoot, { recursive: true });
    const runner = createProjectCommandRunner();

    const commandPromise = runner.runProjectCommand({
      projectRoot: testRoot,
      cwd: testRoot,
      command: "Start-Sleep -Seconds 20; Write-Output after-cancel",
      runId: "run-1",
      timeoutMs: 30000
    });

    await delay(300);

    expect(runner.cancelProjectCommand({ runId: "run-1" })).toEqual({
      ok: true,
      runId: "run-1"
    });

    const result = await commandPromise;

    expect(result.cancelled).toBe(true);
    expect(result.stdout).not.toContain("after-cancel");
  });

  it("tries to stop the whole process tree when cancelling a running command", async () => {
    await mkdir(testRoot, { recursive: true });
    const killedPids: number[] = [];
    const runner = createProjectCommandRunner({
      killProcessTree: (pid) => {
        killedPids.push(pid);
        return false;
      }
    });

    const commandPromise = runner.runProjectCommand({
      projectRoot: testRoot,
      cwd: testRoot,
      command: "Start-Sleep -Seconds 20; Write-Output after-cancel",
      runId: "run-tree-cancel",
      timeoutMs: 30000
    });

    await delay(300);

    const cancelResult = runner.cancelProjectCommand({ runId: "run-tree-cancel" });
    const result = await commandPromise;

    expect(cancelResult.ok).toBe(true);
    expect(killedPids).toHaveLength(1);
    expect(killedPids[0]).toEqual(expect.any(Number));
    expect(result.cancelled).toBe(true);
  });

  it("tries to stop the whole process tree when a command times out", async () => {
    await mkdir(testRoot, { recursive: true });
    const killedPids: number[] = [];
    const runner = createProjectCommandRunner({
      killProcessTree: (pid) => {
        killedPids.push(pid);
        return false;
      }
    });

    const result = await runner.runProjectCommand({
      projectRoot: testRoot,
      cwd: testRoot,
      command: "Start-Sleep -Seconds 20; Write-Output after-timeout",
      timeoutMs: 100
    });

    expect(result.timedOut).toBe(true);
    expect(killedPids).toHaveLength(1);
    expect(killedPids[0]).toEqual(expect.any(Number));
    expect(result.stdout).not.toContain("after-timeout");
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
