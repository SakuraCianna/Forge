import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const createdAt = "2026-06-05T12:00:00.000Z";

test("v0.2 regression results script converts manual runs into quality metrics", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-results-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        runs: [
          {
            taskId: "S1",
            createdAt,
            complexity: "simple",
            completedInFirstAttempt: true,
            wrongFileModified: false,
            unrelatedCodeChanged: false,
            changedFiles: ["README.md", "README.en.md"],
            validations: createAllValidationResults(true),
            failureRecovered: null
          },
          {
            taskId: "M1",
            createdAt,
            complexity: "medium",
            completedInFirstAttempt: false,
            wrongFileModified: true,
            unrelatedCodeChanged: false,
            changedFiles: ["src/main/builtInTools/builtInToolExecutors.ts"],
            validations: createAllValidationResults(true),
            failureRecovered: true
          },
          {
            taskId: "C1",
            createdAt,
            complexity: "complex",
            completedInFirstAttempt: false,
            wrongFileModified: false,
            unrelatedCodeChanged: true,
            changedFiles: ["scripts/run-v0-2-quality-gate.mjs", "README.md"],
            validations: createAllValidationResults(false),
            failureRecovered: false
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  assert.equal(
    packageJson.scripts?.["quality:regression"],
    "npm run test:compile && node scripts/summarize-v0-2-regression-results.mjs"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    status: string;
    source: string;
    totalRuns: number;
    totalObservations: number;
    fileModificationEvidence: Array<{
      taskId: string;
      changedFiles: string[];
      wrongFileModified: boolean;
      unrelatedCodeChanged: boolean;
    }>;
    metrics: Array<{
      id: string;
      denominator: number;
      numerator: number;
      value: number | null;
      usablePassed: boolean | null;
    }>;
  };

  assert.equal(summary.status, "ok");
  assert.equal(summary.source, resultsFile);
  assert.equal(summary.totalRuns, 3);
  assert.equal(summary.totalObservations, 17);
  assert.deepEqual(summary.fileModificationEvidence, [
    {
      taskId: "S1",
      changedFiles: ["README.md", "README.en.md"],
      wrongFileModified: false,
      unrelatedCodeChanged: false
    },
    {
      taskId: "M1",
      changedFiles: ["src/main/builtInTools/builtInToolExecutors.ts"],
      wrongFileModified: true,
      unrelatedCodeChanged: false
    },
    {
      taskId: "C1",
      changedFiles: ["scripts/run-v0-2-quality-gate.mjs", "README.md"],
      wrongFileModified: false,
      unrelatedCodeChanged: true
    }
  ]);
  assert.deepEqual(
    summary.metrics.find((metric) => metric.id === "simpleTaskFirstPassCompletionRate"),
    {
      id: "simpleTaskFirstPassCompletionRate",
      denominator: 1,
      numerator: 1,
      value: 1,
      usablePassed: true
    }
  );
  assert.deepEqual(
    summary.metrics.find((metric) => metric.id === "mediumTaskFirstPassCompletionRate"),
    {
      id: "mediumTaskFirstPassCompletionRate",
      denominator: 1,
      numerator: 0,
      value: 0,
      usablePassed: false
    }
  );
  assert.deepEqual(
    summary.metrics.find((metric) => metric.id === "failureRecoveryRate"),
    {
      id: "failureRecoveryRate",
      denominator: 2,
      numerator: 1,
      value: 0.5,
      usablePassed: false
    }
  );
  assert.equal(summary.metrics.find((metric) => metric.id === "toolCallSuccessRate")?.value, null);
});

test("v0.2 regression results script reports incomplete fixed task coverage", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-coverage-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        runs: [
          {
            taskId: "S1",
            createdAt,
            complexity: "simple",
            completedInFirstAttempt: true,
            wrongFileModified: false,
            unrelatedCodeChanged: false,
            changedFiles: ["README.md"],
            validations: createAllValidationResults(true),
            failureRecovered: null
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  assert.equal(
    packageJson.scripts?.["quality:regression:gate"],
    "npm run test:compile && node scripts/summarize-v0-2-regression-results.mjs --require-complete-set --require-usable-regression"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 1,
    completeTaskSet: false,
    missingTaskIds: ["S2", "S3", "S4", "S5", "M1", "M2", "M3", "M4", "M5", "C1", "C2", "C3"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--require-complete-set"],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when no results file exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-missing-"));
  const scriptPath = join(process.cwd(), "scripts", "summarize-v0-2-regression-results.mjs");

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, "--require-complete-set"], {
      cwd: directory,
      windowsHide: true
    }),
    /Command failed/
  );

  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, "--require-usable-regression"], {
      cwd: directory,
      windowsHide: true
    }),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when complete results are below usable tier", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-usable-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          ...["S1", "S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", false)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  assert.equal(
    packageJson.scripts?.["quality:regression:gate"],
    "npm run test:compile && node scripts/summarize-v0-2-regression-results.mjs --require-complete-set --require-usable-regression"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "scripts/summarize-v0-2-regression-results.mjs",
      "--file",
      resultsFile,
      "--json"
    ],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    gate: {
      regressionUsablePassed: boolean;
      blockingMetricIds: string[];
      unprovenMetricIds: string[];
    };
  };

  assert.deepEqual(summary.gate, {
    regressionUsablePassed: false,
    blockingMetricIds: ["simpleTaskFirstPassCompletionRate"],
    unprovenMetricIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when results contain invalid runs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-invalid-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          ...["S1", "S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true)),
          {
            taskId: "S2",
            createdAt,
            complexity: "simple",
            completedInFirstAttempt: true,
            wrongFileModified: false,
            unrelatedCodeChanged: false,
            changedFiles: ["docs/RELEASE.md"],
            validations: [{ kind: "unit", passed: true }],
            failureRecovered: true
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 14);
  assert.equal(summary.totalRuns, 13);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    {
      index: 13,
      taskId: "S2",
      reasons: ["validations.kind", "validations.command", "validations.exitCode"]
    }
  ]);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when changed files evidence is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-changed-files-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            taskId: "S1",
            createdAt,
            complexity: "simple",
            completedInFirstAttempt: true,
            wrongFileModified: false,
            unrelatedCodeChanged: false,
            validations: createAllValidationResults(true),
            failureRecovered: null
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["changedFiles"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when changed files contradict the wrong-file flag", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-changed-files-scope-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            changedFiles: ["src/main/unexpected.ts"],
            wrongFileModified: false
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["changedFiles.outOfScope"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when fixed task complexity mismatches task id", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-complexity-mismatch-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          createRegressionRun("S1", "complex", true),
          ...["S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["complexityForTaskId"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when run timestamp is not auditable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-created-at-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            createdAt: "2026-06-05"
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["createdAt"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when run timestamp is in the future", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-future-created-at-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            createdAt: "2999-06-05T12:00:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 1);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["createdAt"] }
  ]);
});

test("v0.2 regression results strict gate fails when run timestamp is not a real calendar date", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-invalid-calendar-date-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            createdAt: "2026-02-31T12:00:00.000Z"
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 1);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["createdAt"] }
  ]);
});

test("v0.2 regression results strict gate fails when first-pass completion contradicts validation failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-first-pass-validation-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            validations: [
              createValidationResult("typecheck", true),
              createValidationResult("build", true),
              createValidationResult("lint", false)
            ]
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["completedInFirstAttemptValidationMismatch"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when recovery is recorded without a failure path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-recovery-without-failure-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            failureRecovered: true
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) => ({
            ...createRegressionRun(taskId, "simple", true),
            failureRecovered: null
          })),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) => ({
            ...createRegressionRun(taskId, "medium", true),
            failureRecovered: null
          })),
          ...["C1", "C2", "C3"].map((taskId) => ({
            ...createRegressionRun(taskId, "complex", true),
            failureRecovered: null
          }))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["failureRecoveredWithoutFailure"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when required validation kinds are missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-missing-validation-kind-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            validations: [createValidationResult("lint", true)]
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["validations.missingTypecheck", "validations.missingBuild"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when validation kinds are duplicated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-duplicate-validation-kind-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            validations: [
              createValidationResult("typecheck", true),
              createValidationResult("build", true),
              createValidationResult("lint", true),
              createValidationResult("lint", true)
            ]
          },
          ...["S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", true)
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
    coverage: {
      requiredTaskCount: number;
      coveredTaskCount: number;
      completeTaskSet: boolean;
      missingTaskIds: string[];
      unexpectedTaskIds: string[];
    };
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 12);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["validations.duplicateLint"] }
  ]);
  assert.deepEqual(summary.coverage, {
    requiredTaskCount: 13,
    coveredTaskCount: 12,
    completeTaskSet: false,
    missingTaskIds: ["S1"],
    unexpectedTaskIds: []
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when validation command evidence is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-validation-evidence-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          ...["S1", "S2", "S3", "S4", "S5"].map((taskId) => ({
            ...createRegressionRun(taskId, "simple", true),
            validations: [{ kind: "lint", passed: true }]
          })),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) => ({
            ...createRegressionRun(taskId, "medium", true),
            validations: [{ kind: "typecheck", passed: true }]
          })),
          ...["C1", "C2", "C3"].map((taskId) => ({
            ...createRegressionRun(taskId, "complex", true),
            validations: [{ kind: "build", passed: true }]
          }))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 13);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.invalidRunCount, 13);
  assert.deepEqual(
    summary.invalidRuns.map((run) => run.taskId),
    ["S1", "S2", "S3", "S4", "S5", "M1", "M2", "M3", "M4", "M5", "C1", "C2", "C3"]
  );
  assert.deepEqual(
    summary.invalidRuns.map((run) => run.reasons),
    Array.from({ length: 13 }, () => ["validations.command", "validations.exitCode"])
  );

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when validation pass state contradicts exit code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-validation-exit-code-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            validations: [
              {
                kind: "lint",
                command: "npm run lint",
                exitCode: 1,
                passed: true
              }
            ]
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 1);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["validations.passedExitCodeMismatch"] }
  ]);
});

test("v0.2 regression results strict gate fails when validation command does not match its kind", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-validation-command-kind-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            validations: [
              {
                kind: "typecheck",
                command: "npm test",
                exitCode: 0,
                passed: true
              },
              createValidationResult("build", true),
              createValidationResult("lint", true)
            ]
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 1);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["validations.commandForKind"] }
  ]);
});

test("v0.2 regression results strict gate fails when validation is not after modification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-validation-after-modification-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("S1", "simple", true),
            validations: [
              {
                ...createValidationResult("typecheck", true),
                afterModification: false
              },
              createValidationResult("build", true),
              createValidationResult("lint", true)
            ]
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 1);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "S1", reasons: ["validations.afterModification"] }
  ]);
});

test("v0.2 regression results strict gate fails when fixed tasks are duplicated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-duplicate-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          ...["S1", "S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", taskId !== "M1")
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true)),
          createRegressionRun("S1", "simple", true)
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    duplicateTaskCount: number;
    duplicateTaskIds: string[];
    coverage: {
      completeTaskSet: boolean;
    };
    gate: {
      regressionUsablePassed: boolean;
    };
  };

  assert.equal(summary.coverage.completeTaskSet, false);
  assert.equal(summary.gate.regressionUsablePassed, true);
  assert.equal(summary.duplicateTaskCount, 1);
  assert.deepEqual(summary.duplicateTaskIds, ["S1"]);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when failed path omits recovery outcome", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-missing-recovery-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.0",
        runs: [
          {
            ...createRegressionRun("M1", "medium", false),
            failureRecovered: null
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    totalRawRuns: number;
    totalRuns: number;
    invalidRunCount: number;
    invalidRuns: Array<{ index: number; taskId: string | null; reasons: string[] }>;
  };

  assert.equal(summary.totalRawRuns, 1);
  assert.equal(summary.totalRuns, 0);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [
    { index: 0, taskId: "M1", reasons: ["failureRecoveredMissingAfterFailure"] }
  ]);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results strict gate fails when report version does not match package version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-version-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        forgeVersion: "0.2.1",
        runs: [
          ...["S1", "S2", "S3", "S4", "S5"].map((taskId) =>
            createRegressionRun(taskId, "simple", true)
          ),
          ...["M1", "M2", "M3", "M4", "M5"].map((taskId) =>
            createRegressionRun(taskId, "medium", taskId !== "M1")
          ),
          ...["C1", "C2", "C3"].map((taskId) => createRegressionRun(taskId, "complex", true))
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    metadata: {
      forgeVersion: string | null;
      packageVersion: string;
      invalidMetadata: string[];
    };
    gate: {
      regressionUsablePassed: boolean;
    };
  };

  assert.deepEqual(summary.metadata, {
    forgeVersion: "0.2.1",
    packageVersion: "0.2.0",
    invalidMetadata: ["forgeVersion"]
  });
  assert.equal(summary.gate.regressionUsablePassed, true);

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        "scripts/summarize-v0-2-regression-results.mjs",
        "--file",
        resultsFile,
        "--require-complete-set",
        "--require-usable-regression"
      ],
      { windowsHide: true }
    ),
    /Command failed/
  );
});

test("v0.2 regression results script rejects malformed report shape", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-v02-regression-malformed-"));
  const resultsFile = join(directory, "regression-results.json");

  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        runs: "S1"
      },
      null,
      2
    ),
    "utf8"
  );

  await assert.rejects(
    async () => {
      await execFileAsync(
        process.execPath,
        ["scripts/summarize-v0-2-regression-results.mjs", "--file", resultsFile, "--json"],
        { windowsHide: true }
      );
    },
    (error: unknown) => {
      const stdout = (error as { stdout?: string }).stdout ?? "";
      const summary = JSON.parse(stdout) as {
        status: string;
        message: string;
      };

      assert.equal(summary.status, "error");
      assert.match(summary.message, /runs array/);

      return true;
    }
  );
});

function createRegressionRun(taskId: string, complexity: "simple" | "medium" | "complex", completed: boolean) {
  return {
    taskId,
    createdAt,
    complexity,
    completedInFirstAttempt: completed,
    wrongFileModified: false,
    unrelatedCodeChanged: false,
    changedFiles: createChangedFilesForTask(taskId),
    validations: createAllValidationResults(true),
    failureRecovered: completed ? null : true
  };
}

function createChangedFilesForTask(taskId: string) {
  const changedFilesByTaskId: Record<string, string[]> = {
    S1: ["README.md"],
    S2: ["docs/RELEASE.md"],
    S3: ["README.md"],
    S4: ["docs/superpowers/plans/2026-06-05-v0-2-stabilization.md"],
    S5: ["README.md"],
    M1: ["tests/agentQualityMetrics.test.ts"],
    M2: ["tests/agentQualityMetrics.test.ts"],
    M3: ["README.md"],
    M4: ["docs/RELEASE.md"],
    M5: ["docs/superpowers/plans/2026-06-05-v0-2-stabilization.md"],
    C1: ["scripts/run-v0-2-quality-gate.mjs"],
    C2: ["src/renderer/src/components/ExtensionsPanel.tsx"],
    C3: ["tests/agentQualityMetricsLog.test.ts"]
  };

  return changedFilesByTaskId[taskId] ?? [`docs/${taskId}.md`];
}

function createAllValidationResults(passed: boolean) {
  return [
    createValidationResult("typecheck", passed),
    createValidationResult("build", passed),
    createValidationResult("lint", passed)
  ];
}

function createValidationResult(kind: "typecheck" | "build" | "lint", passed: boolean) {
  return {
    kind,
    command: {
      typecheck: "npm run typecheck",
      build: "npm run build",
      lint: "npm run lint"
    }[kind],
    exitCode: passed ? 0 : 1,
    passed
  };
}
