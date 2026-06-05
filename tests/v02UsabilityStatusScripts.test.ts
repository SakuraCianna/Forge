import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const createdAt = "2026-06-05T12:00:00.000Z";

test("v0.2 usability status is wired and reports missing evidence as unproven", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-usability-status-missing-"));
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-2-usability-status.mjs");

  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.2.0" }), "utf8");

  assert.equal(
    packageJson.scripts?.["quality:v0.2:status"],
    "npm run test:compile && node scripts/summarize-v0-2-usability-status.mjs"
  );

  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--json"], {
    cwd: directory,
    windowsHide: true
  });
  const summary = JSON.parse(stdout) as {
    classification: string;
    passed: boolean;
    blockers: string[];
    regression: { status: string };
    installerSmoke: { status: string };
  };

  assert.deepEqual(summary, {
    classification: "unproven",
    passed: false,
    blockers: ["regression-results-missing", "installer-smoke-missing"],
    regression: { status: "missing" },
    installerSmoke: { status: "missing" }
  });
});

test("v0.2 usability status reports evidence-ready when strict evidence files pass", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-usability-status-ready-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const regressionFile = join(docsDirectory, "V0_2_REGRESSION_RESULTS.json");
  const smokeFile = join(docsDirectory, "V0_2_INSTALLER_SMOKE.json");
  const installerPath = join(releaseDirectory, "Forge-0.2.0-x64-setup.exe");
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-2-usability-status.mjs");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.2.0" }), "utf8");
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    regressionFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          ...["S1", "S2", "S3", "S4", "S5"].map((taskId) => createRegressionRun(taskId, "simple")),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) => createRegressionRun(taskId, "medium")),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex"))
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    smokeFile,
    JSON.stringify(
      {
        installerPath: "release/Forge-0.2.0-x64-setup.exe",
        installerSha256: createSha256(installerFixture),
        testedAt: "2026-06-05T12:00:00.000Z",
        platform: "Windows 11",
        checks: {
          appLaunches: true,
          projectOpens: true,
          filePreviewWorks: true,
          safeCommandRuns: true,
          generatedDiffAcceptRejectWorks: true,
          gitStatusViewOpens: true,
          highRiskRequiresConfirmation: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--json"], {
    cwd: directory,
    windowsHide: true
  });
  const summary = JSON.parse(stdout) as {
    classification: string;
    passed: boolean;
    blockers: string[];
    regression: { status: string };
    installerSmoke: { status: string };
  };

  assert.deepEqual(summary, {
    classification: "evidence-ready",
    passed: true,
    blockers: [],
    regression: { status: "passed" },
    installerSmoke: { status: "passed" }
  });
});

function createRegressionRun(taskId: string, complexity: "simple" | "medium" | "complex") {
  const recoveredTask = taskId === "M1";

  return {
    taskId,
    createdAt,
    complexity,
    completedInFirstAttempt: !recoveredTask,
    wrongFileModified: false,
    unrelatedCodeChanged: false,
    validations: [
      { kind: "typecheck", command: "npm run typecheck", exitCode: 0, passed: true },
      { kind: "build", command: "npm run build", exitCode: 0, passed: true },
      { kind: "lint", command: "npm run lint", exitCode: 0, passed: true }
    ],
    failureRecovered: recoveredTask ? true : null
  };
}

function createSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
