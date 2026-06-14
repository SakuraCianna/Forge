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

test("v0.3 usability status is wired and reports missing evidence as unproven", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const directory = await mkdtemp(join(tmpdir(), "forge-v03-usability-status-missing-"));
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-3-usability-status.mjs");

  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.3.0" }), "utf8");

  assert.equal(
    packageJson.scripts?.["quality:v0.3:status"],
    "npm run test:compile && node scripts/summarize-v0-3-usability-status.mjs"
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

test("v0.3 usability status reports evidence-ready when strict evidence files pass", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v03-usability-status-ready-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const regressionFile = join(docsDirectory, "V0_3_REGRESSION_RESULTS.json");
  const smokeFile = join(docsDirectory, "V0_3_INSTALLER_SMOKE.json");
  const installerPath = join(releaseDirectory, "Forge-0.3.0-x64-setup.exe");
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-3-usability-status.mjs");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.3.0" }), "utf8");
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    regressionFile,
    JSON.stringify(
      {
        forgeVersion: "0.3.0",
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
        forgeVersion: "0.3.0",
        installerPath: "release/Forge-0.3.0-x64-setup.exe",
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

test("v0.3 usability status reports invalid regression evidence separately from below-threshold metrics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v03-usability-status-invalid-regression-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const regressionFile = join(docsDirectory, "V0_3_REGRESSION_RESULTS.json");
  const smokeFile = join(docsDirectory, "V0_3_INSTALLER_SMOKE.json");
  const installerPath = join(releaseDirectory, "Forge-0.3.0-x64-setup.exe");
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-3-usability-status.mjs");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.3.0" }), "utf8");
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    regressionFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.1",
        runs: [
          {
            ...createRegressionRun("S1", "simple"),
            validations: [
              { kind: "typecheck", command: "npm test", exitCode: 0, passed: true },
              { kind: "build", command: "npm run build", exitCode: 0, passed: true },
              { kind: "lint", command: "npm run lint", exitCode: 0, passed: true }
            ]
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) => createRegressionRun(taskId, "simple")),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) => createRegressionRun(taskId, "medium")),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex"))
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeInstallerSmokeReport(smokeFile, installerFixture);

  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--json"], {
    cwd: directory,
    windowsHide: true
  });
  const summary = JSON.parse(stdout) as {
    classification: string;
    passed: boolean;
    blockers: string[];
    regression: {
      status: string;
      details?: {
        invalidMetadata: string[];
        invalidRunCount: number;
        invalidRuns: Array<{ index: number; taskId: string; reasons: string[] }>;
        duplicateTaskIds: string[];
        missingTaskIds: string[];
        unexpectedTaskIds: string[];
        blockingMetricIds: string[];
        unprovenMetricIds: string[];
        fileModificationEvidence: Array<{
          taskId: string | null;
          changedFiles: string[];
          wrongFileModified: boolean;
          unrelatedCodeChanged: boolean;
        }>;
      };
    };
    installerSmoke: { status: string };
  };

  assert.deepEqual(summary, {
    classification: "blocked",
    passed: false,
    blockers: ["regression-results-invalid"],
    regression: {
      status: "invalid",
      details: {
        invalidMetadata: ["forgeVersion"],
        invalidRunCount: 1,
        invalidRuns: [{ index: 0, taskId: "S1", reasons: ["validations.commandForKind"] }],
        duplicateTaskIds: [],
        missingTaskIds: ["S1"],
        unexpectedTaskIds: [],
        blockingMetricIds: [],
        unprovenMetricIds: [],
        fileModificationEvidence: [],
        invalidFileModificationEvidence: []
      }
    },
    installerSmoke: { status: "passed" }
  });

  const { stdout: textOutput } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: directory,
    windowsHide: true
  });

  assert.match(textOutput, /Regression details:/u);
  assert.match(textOutput, /Invalid metadata: forgeVersion/u);
  assert.match(textOutput, /Invalid runs: 1/u);
  assert.match(textOutput, /Invalid run details: 0:S1 \[validations\.commandForKind\]/u);
  assert.match(textOutput, /Duplicate task IDs: none/u);
  assert.match(textOutput, /Blocking metrics: none/u);
});

test("v0.3 usability status surfaces invalid changed-file evidence for regression reports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v03-usability-status-invalid-changed-files-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const regressionFile = join(docsDirectory, "V0_3_REGRESSION_RESULTS.json");
  const smokeFile = join(docsDirectory, "V0_3_INSTALLER_SMOKE.json");
  const installerPath = join(releaseDirectory, "Forge-0.3.0-x64-setup.exe");
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-3-usability-status.mjs");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.3.0" }), "utf8");
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    regressionFile,
    JSON.stringify(
      {
        forgeVersion: "0.3.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple"),
            changedFiles: ["src/main/unexpected.ts"],
            wrongFileModified: false
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) => createRegressionRun(taskId, "simple")),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) => createRegressionRun(taskId, "medium")),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex"))
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeInstallerSmokeReport(smokeFile, installerFixture);

  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--json"], {
    cwd: directory,
    windowsHide: true
  });
  const summary = JSON.parse(stdout) as {
    classification: string;
    passed: boolean;
    blockers: string[];
    regression: {
      status: string;
      details?: {
        invalidMetadata: string[];
        invalidRunCount: number;
        invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
        duplicateTaskIds: string[];
        missingTaskIds: string[];
        unexpectedTaskIds: string[];
        blockingMetricIds: string[];
        unprovenMetricIds: string[];
        fileModificationEvidence: Array<{
          taskId: string;
          changedFiles: string[];
          wrongFileModified: boolean;
          unrelatedCodeChanged: boolean;
        }>;
        invalidFileModificationEvidence: Array<{
          index: number;
          taskId: string | null;
          changedFiles: string[];
          wrongFileModified: boolean;
          unrelatedCodeChanged: boolean;
          reasons: string[];
        }>;
      };
    };
    installerSmoke: { status: string };
  };

  assert.deepEqual(summary, {
    classification: "blocked",
    passed: false,
    blockers: ["regression-results-invalid"],
    regression: {
      status: "invalid",
      details: {
        invalidMetadata: [],
        invalidRunCount: 1,
        invalidRuns: [{ index: 0, taskId: "S1", reasons: ["changedFiles.outOfScope"] }],
        duplicateTaskIds: [],
        missingTaskIds: ["S1"],
        unexpectedTaskIds: [],
        blockingMetricIds: [],
        unprovenMetricIds: [],
        fileModificationEvidence: [],
        invalidFileModificationEvidence: [
          {
            index: 0,
            taskId: "S1",
            changedFiles: ["src/main/unexpected.ts"],
            wrongFileModified: false,
            unrelatedCodeChanged: false,
            reasons: ["changedFiles.outOfScope"]
          }
        ]
      }
    },
    installerSmoke: { status: "passed" }
  });

  const { stdout: textOutput } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: directory,
    windowsHide: true
  });

  assert.match(textOutput, /Invalid changed files: 0:S1 \[src\/main\/unexpected\.ts\] \[changedFiles\.outOfScope\]/u);
});

test("v0.3 usability status stays blocked when invalid evidence is mixed with missing evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v03-usability-status-invalid-and-missing-"));
  const docsDirectory = join(directory, "docs");
  const regressionFile = join(docsDirectory, "V0_3_REGRESSION_RESULTS.json");
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-3-usability-status.mjs");

  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.3.0" }), "utf8");
  await writeFile(
    regressionFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.1",
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

  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--json"], {
    cwd: directory,
    windowsHide: true
  });
  const summary = JSON.parse(stdout) as {
    classification: string;
    passed: boolean;
    blockers: string[];
    regression: {
      status: string;
      details?: {
        invalidMetadata: string[];
      };
    };
    installerSmoke: { status: string };
  };

  assert.deepEqual(summary, {
    classification: "blocked",
    passed: false,
    blockers: ["regression-results-invalid", "installer-smoke-missing"],
    regression: {
      status: "invalid",
      details: {
        invalidMetadata: ["forgeVersion"],
        invalidRunCount: 0,
        invalidRuns: [],
        duplicateTaskIds: [],
        missingTaskIds: [],
        unexpectedTaskIds: [],
        blockingMetricIds: [],
        unprovenMetricIds: [],
        fileModificationEvidence: [],
        invalidFileModificationEvidence: []
      }
    },
    installerSmoke: { status: "missing" }
  });

  const { stdout: textOutput } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: directory,
    windowsHide: true
  });

  assert.match(textOutput, /v0\.3 usability status: blocked/u);
  assert.match(textOutput, /Blockers: regression-results-invalid, installer-smoke-missing/u);
});

test("v0.3 usability status surfaces changed-file evidence for below-threshold regression metrics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v03-usability-status-below-regression-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const regressionFile = join(docsDirectory, "V0_3_REGRESSION_RESULTS.json");
  const smokeFile = join(docsDirectory, "V0_3_INSTALLER_SMOKE.json");
  const installerPath = join(releaseDirectory, "Forge-0.3.0-x64-setup.exe");
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-3-usability-status.mjs");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.3.0" }), "utf8");
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    regressionFile,
    JSON.stringify(
      {
        forgeVersion: "0.3.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple"),
            completedInFirstAttempt: false,
            wrongFileModified: true,
            unrelatedCodeChanged: true,
            changedFiles: ["src/main/unexpected.ts"],
            failureRecovered: true
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) => createRegressionRun(taskId, "simple")),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) => createRegressionRun(taskId, "medium")),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex"))
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeInstallerSmokeReport(smokeFile, installerFixture);

  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--json"], {
    cwd: directory,
    windowsHide: true
  });
  const summary = JSON.parse(stdout) as {
    classification: string;
    passed: boolean;
    blockers: string[];
    regression: {
      status: string;
      details?: {
        invalidMetadata: string[];
        invalidRunCount: number;
        invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
        duplicateTaskIds: string[];
        missingTaskIds: string[];
        unexpectedTaskIds: string[];
        blockingMetricIds: string[];
        unprovenMetricIds: string[];
        fileModificationEvidence: Array<{
          taskId: string;
          changedFiles: string[];
          wrongFileModified: boolean;
          unrelatedCodeChanged: boolean;
        }>;
      };
    };
    installerSmoke: { status: string };
  };

  assert.deepEqual(summary, {
    classification: "blocked",
    passed: false,
    blockers: ["regression-results-below-usable"],
    regression: {
      status: "failed",
      details: {
        invalidMetadata: [],
        invalidRunCount: 0,
        invalidRuns: [],
        duplicateTaskIds: [],
        missingTaskIds: [],
        unexpectedTaskIds: [],
        blockingMetricIds: ["simpleTaskFirstPassCompletionRate"],
        unprovenMetricIds: [],
        fileModificationEvidence: [
          {
            taskId: "S1",
            changedFiles: ["src/main/unexpected.ts"],
            wrongFileModified: true,
            unrelatedCodeChanged: true
          }
        ],
        invalidFileModificationEvidence: []
      }
    },
    installerSmoke: { status: "passed" }
  });

  const { stdout: textOutput } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: directory,
    windowsHide: true
  });

  assert.match(textOutput, /Regression details:/u);
  assert.match(textOutput, /Blocking metrics: simpleTaskFirstPassCompletionRate/u);
  assert.match(textOutput, /Changed files: S1 \[src\/main\/unexpected\.ts\] \(wrong-file, unrelated-change\)/u);
});

test("v0.3 usability status reports invalid installer smoke evidence separately from failed smoke checks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v03-usability-status-invalid-smoke-"));
  const releaseDirectory = join(directory, "release");
  const docsDirectory = join(directory, "docs");
  const regressionFile = join(docsDirectory, "V0_3_REGRESSION_RESULTS.json");
  const smokeFile = join(docsDirectory, "V0_3_INSTALLER_SMOKE.json");
  const installerPath = join(releaseDirectory, "Forge-0.3.0-x64-setup.exe");
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-3-usability-status.mjs");
  const installerFixture = "fake installer fixture";

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(docsDirectory, { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ version: "0.3.0" }), "utf8");
  await writeFile(installerPath, installerFixture, "utf8");
  await writeFile(
    regressionFile,
    JSON.stringify(
      {
        forgeVersion: "0.3.0",
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
        forgeVersion: "0.3.0",
        installerPath: "release/Forge-0.3.0-x64-setup.exe",
        installerSha256: createSha256(installerFixture),
        testedAt: "2026-06-05",
        platform: "not Windows",
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
    installerSmoke: {
      status: string;
      details?: {
        missingChecks: string[];
        failedChecks: string[];
        missingMetadata: string[];
        invalidMetadata: string[];
        installerExists: boolean;
        installerSha256Matches: boolean;
      };
    };
  };

  assert.deepEqual(summary, {
    classification: "blocked",
    passed: false,
    blockers: ["installer-smoke-invalid"],
    regression: { status: "passed" },
    installerSmoke: {
      status: "invalid",
      details: {
        missingChecks: [],
        failedChecks: [],
        missingMetadata: [],
        invalidMetadata: ["testedAt", "platform"],
        installerExists: true,
        installerSha256Matches: true
      }
    }
  });

  const { stdout: textOutput } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: directory,
    windowsHide: true
  });

  assert.match(textOutput, /Installer smoke details:/u);
  assert.match(textOutput, /Missing checks: none/u);
  assert.match(textOutput, /Failed checks: none/u);
  assert.match(textOutput, /Invalid metadata: testedAt, platform/u);
  assert.match(textOutput, /Installer artifact: found/u);
  assert.match(textOutput, /Installer SHA-256: matched/u);
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
    changedFiles: createChangedFilesForTask(taskId),
    validations: [
      { kind: "typecheck", command: "npm run typecheck", exitCode: 0, passed: true },
      { kind: "build", command: "npm run build", exitCode: 0, passed: true },
      { kind: "lint", command: "npm run lint", exitCode: 0, passed: true }
    ],
    failureRecovered: recoveredTask ? true : null
  };
}

function createChangedFilesForTask(taskId: string) {
  const changedFilesByTaskId: Record<string, string[]> = {
    S1: ["README.md"],
    S2: ["docs/RELEASE.md"],
    S3: ["README.md"],
    S4: ["docs/V0_3_REGRESSION_TASKS.md"],
    S5: ["README.md"],
    M1: ["tests/agentQualityMetrics.test.ts"],
    M2: ["tests/agentQualityMetrics.test.ts"],
    M3: ["README.md"],
    M4: ["docs/RELEASE.md"],
    M5: ["docs/V0_3_REGRESSION_TASKS.md"],
    C1: ["scripts/run-v0-3-quality-gate.mjs"],
    C2: ["src/renderer/src/components/ExtensionsPanel.tsx"],
    C3: ["tests/agentQualityMetricsLog.test.ts"]
  };

  return changedFilesByTaskId[taskId] ?? [`docs/${taskId}.md`];
}

async function writeInstallerSmokeReport(filePath: string, installerFixture: string) {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        forgeVersion: "0.3.0",
        installerPath: "release/Forge-0.3.0-x64-setup.exe",
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
}

function createSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
