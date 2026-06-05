import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
            complexity: "simple",
            completedInFirstAttempt: true,
            wrongFileModified: false,
            unrelatedCodeChanged: false,
            validations: [{ kind: "lint", passed: true }],
            failureRecovered: null
          },
          {
            taskId: "M1",
            complexity: "medium",
            completedInFirstAttempt: false,
            wrongFileModified: true,
            unrelatedCodeChanged: false,
            validations: [{ kind: "typecheck", passed: false }],
            failureRecovered: true
          },
          {
            taskId: "C1",
            complexity: "complex",
            completedInFirstAttempt: false,
            wrongFileModified: false,
            unrelatedCodeChanged: true,
            validations: [{ kind: "build", passed: true }],
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
  assert.equal(summary.totalObservations, 11);
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
            complexity: "simple",
            completedInFirstAttempt: true,
            wrongFileModified: false,
            unrelatedCodeChanged: false,
            validations: [{ kind: "lint", passed: true }],
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
            complexity: "simple",
            completedInFirstAttempt: true,
            wrongFileModified: false,
            unrelatedCodeChanged: false,
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
    invalidRuns: Array<{ index: number; taskId: string | null }>;
  };

  assert.equal(summary.totalRawRuns, 14);
  assert.equal(summary.totalRuns, 13);
  assert.equal(summary.invalidRunCount, 1);
  assert.deepEqual(summary.invalidRuns, [{ index: 13, taskId: "S2" }]);

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
            createRegressionRun(taskId, "medium", true)
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
    complexity,
    completedInFirstAttempt: completed,
    wrongFileModified: false,
    unrelatedCodeChanged: false,
    validations: [
      { kind: "typecheck", passed: true },
      { kind: "build", passed: true },
      { kind: "lint", passed: true }
    ],
    failureRecovered: true
  };
}
