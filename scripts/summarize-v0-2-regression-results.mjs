// 本文件说明: 汇总 v0.2.x 真实任务回归结果, 复用 Agent 质量指标口径, 不写入应用指标日志
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentQualityMetricSnapshot } from "../.tmp-test/src/shared/agentQualityMetrics.js";

const REQUIRED_TASK_IDS = ["S1", "S2", "S3", "S4", "S5", "M1", "M2", "M3", "M4", "M5", "C1", "C2", "C3"];
const REQUIRED_VALIDATION_KINDS = ["typecheck", "build", "lint"];
const REGRESSION_USABLE_METRIC_IDS = [
  "simpleTaskFirstPassCompletionRate",
  "mediumTaskFirstPassCompletionRate",
  "complexTaskFirstPassCompletionRate",
  "postModificationTypecheckPassRate",
  "postModificationBuildPassRate",
  "postModificationLintPassRate",
  "wrongFileModificationRate",
  "unrelatedCodeChangeRate",
  "failureRecoveryRate"
];

const args = parseArgs(process.argv.slice(2));
const source = args.file ? resolve(args.file) : findDefaultResultsFile();

if (!source) {
  writeSummary(
    {
      status: "missing",
      source: null,
      totalRawRuns: 0,
      totalRuns: 0,
      totalObservations: 0,
      invalidRunCount: 0,
      invalidRuns: [],
      duplicateTaskCount: 0,
      duplicateTaskIds: [],
      coverage: createCoverageSummary([]),
      gate: createRegressionUsableGate([]),
      metrics: []
    },
    args.json
  );
  if (args.requireCompleteSet || args.requireUsableRegression) {
    process.exitCode = 1;
  }
  process.exit();
}

try {
  const packageVersion = await readPackageVersion();
  const { runs, invalidRuns, totalRawRuns, forgeVersion } = await readRegressionRuns(source);
  const metadata = {
    forgeVersion,
    packageVersion,
    invalidMetadata: getInvalidMetadata(forgeVersion, packageVersion)
  };
  const observations = createObservationsFromRuns(runs);
  const snapshot = createAgentQualityMetricSnapshot(observations);
  const coverage = createCoverageSummary(runs);
  const duplicateTaskIds = getDuplicateTaskIds(runs);
  const metrics = snapshot.metrics.map((metric) => ({
    id: metric.id,
    denominator: metric.denominator,
    numerator: metric.numerator,
    value: metric.value,
    usablePassed: metric.usablePassed
  }));
  const gate = createRegressionUsableGate(metrics);
  const summary = {
    status: "ok",
    source,
    totalRawRuns,
    totalRuns: runs.length,
    totalObservations: observations.length,
    invalidRunCount: invalidRuns.length,
    invalidRuns,
    duplicateTaskCount: duplicateTaskIds.length,
    duplicateTaskIds,
    metadata,
    generatedAt: snapshot.generatedAt,
    coverage,
    gate,
    metrics
  };

  writeSummary(summary, args.json);
  if (args.requireCompleteSet && !coverage.completeTaskSet) {
    process.exitCode = 1;
  }
  if (args.requireUsableRegression && !gate.regressionUsablePassed) {
    process.exitCode = 1;
  }
  if ((args.requireCompleteSet || args.requireUsableRegression) && invalidRuns.length > 0) {
    process.exitCode = 1;
  }
  if ((args.requireCompleteSet || args.requireUsableRegression) && duplicateTaskIds.length > 0) {
    process.exitCode = 1;
  }
  if ((args.requireCompleteSet || args.requireUsableRegression) && metadata.invalidMetadata.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  writeSummary(
    {
      status: "error",
      source,
      totalRawRuns: 0,
      totalRuns: 0,
      totalObservations: 0,
      invalidRunCount: 0,
      invalidRuns: [],
      duplicateTaskCount: 0,
      duplicateTaskIds: [],
      coverage: createCoverageSummary([]),
      gate: createRegressionUsableGate([]),
      message: error instanceof Error ? error.message : String(error),
      metrics: []
    },
    args.json
  );
  process.exitCode = 1;
}

function parseArgs(rawArgs) {
  const parsed = {
    file: process.env.FORGE_REGRESSION_RESULTS_FILE,
    json: false,
    requireCompleteSet: false,
    requireUsableRegression: false
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--require-complete-set") {
      parsed.requireCompleteSet = true;
      continue;
    }

    if (arg === "--require-usable-regression") {
      parsed.requireUsableRegression = true;
      continue;
    }

    if (arg === "--file") {
      const nextArg = rawArgs[index + 1];

      if (!nextArg) {
        throw new Error("--file requires a path");
      }

      parsed.file = nextArg;
      index += 1;
    }
  }

  return parsed;
}

async function readRegressionRuns(filePath) {
  const rawValue = await readFile(filePath, "utf8");
  const parsed = JSON.parse(rawValue);

  if (!isRecord(parsed) || !Array.isArray(parsed.runs)) {
    throw new Error("v0.2 regression results file must contain a runs array");
  }

  const rawRuns = parsed.runs;
  const runs = [];
  const invalidRuns = [];

  rawRuns.forEach((run, index) => {
    const reasons = getRegressionRunInvalidReasons(run);

    if (reasons.length === 0) {
      runs.push(run);
      return;
    }

    invalidRuns.push({
      index,
      taskId: isRecord(run) && typeof run.taskId === "string" ? run.taskId : null,
      reasons
    });
  });

  return {
    runs,
    invalidRuns,
    totalRawRuns: rawRuns.length,
    forgeVersion: typeof parsed.forgeVersion === "string" ? parsed.forgeVersion : null
  };
}

async function readPackageVersion() {
  const candidates = [
    resolve("package.json"),
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json")
  ];

  for (const packageJsonPath of candidates) {
    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const rawValue = await readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(rawValue);

    if (typeof packageJson?.version === "string" && packageJson.version.trim()) {
      return packageJson.version;
    }
  }

  throw new Error("Unable to read package version for regression result validation");
}

function getInvalidMetadata(forgeVersion, packageVersion) {
  return forgeVersion === packageVersion ? [] : ["forgeVersion"];
}

function createObservationsFromRuns(runs) {
  return runs.flatMap((run) => {
    const observations = [
      {
        kind: "task_outcome",
        createdAt: run.createdAt,
        complexity: run.complexity,
        completedInFirstAttempt: run.completedInFirstAttempt
      },
      {
        kind: "file_modification",
        createdAt: run.createdAt,
        wrongFile: run.wrongFileModified,
        unrelatedChange: run.unrelatedCodeChanged
      },
      ...run.validations.map((validation) => ({
        kind: "validation_run",
        createdAt: run.createdAt,
        validation: validation.kind,
        afterModification: validation.afterModification ?? true,
        passed: validation.passed
      }))
    ];

    if (typeof run.failureRecovered === "boolean") {
      observations.push({
        kind: "failure_recovery",
        createdAt: run.createdAt,
        recovered: run.failureRecovered
      });
    }

    return observations;
  });
}

function createCoverageSummary(runs) {
  const seenTaskIds = Array.from(new Set(runs.map((run) => run.taskId)));
  const requiredTaskIds = new Set(REQUIRED_TASK_IDS);
  const coveredRequiredTaskIds = REQUIRED_TASK_IDS.filter((taskId) => seenTaskIds.includes(taskId));
  const missingTaskIds = REQUIRED_TASK_IDS.filter((taskId) => !seenTaskIds.includes(taskId));
  const unexpectedTaskIds = seenTaskIds.filter((taskId) => !requiredTaskIds.has(taskId));
  const duplicateTaskIds = getDuplicateTaskIds(runs);

  return {
    requiredTaskCount: REQUIRED_TASK_IDS.length,
    coveredTaskCount: coveredRequiredTaskIds.length,
    completeTaskSet: missingTaskIds.length === 0 && unexpectedTaskIds.length === 0 && duplicateTaskIds.length === 0,
    missingTaskIds,
    unexpectedTaskIds
  };
}

function getDuplicateTaskIds(runs) {
  const seenTaskIds = new Set();
  const duplicateTaskIds = new Set();

  for (const run of runs) {
    if (seenTaskIds.has(run.taskId)) {
      duplicateTaskIds.add(run.taskId);
      continue;
    }

    seenTaskIds.add(run.taskId);
  }

  return Array.from(duplicateTaskIds);
}

function createRegressionUsableGate(metrics) {
  const regressionMetrics = REGRESSION_USABLE_METRIC_IDS.map((metricId) =>
    metrics.find((metric) => metric.id === metricId)
  );
  const unprovenMetricIds = REGRESSION_USABLE_METRIC_IDS.filter((_, index) => {
    const metric = regressionMetrics[index];

    return !metric || metric.usablePassed === null;
  });
  const blockingMetricIds = REGRESSION_USABLE_METRIC_IDS.filter((_, index) => {
    const metric = regressionMetrics[index];

    return metric?.usablePassed === false;
  });

  return {
    regressionUsablePassed: unprovenMetricIds.length === 0 && blockingMetricIds.length === 0,
    blockingMetricIds,
    unprovenMetricIds
  };
}

function findDefaultResultsFile() {
  const candidates = [
    "docs/V0_2_REGRESSION_RESULTS.json",
    "docs/v0-2-regression-results.json"
  ].map((candidate) => resolve(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function getRegressionRunInvalidReasons(value) {
  if (!isRecord(value)) {
    return ["run"];
  }

  const reasons = [];

  if (typeof value.taskId !== "string") {
    reasons.push("taskId");
  }

  if (!isTaskComplexity(value.complexity)) {
    reasons.push("complexity");
  }

  if (typeof value.createdAt !== "string" || !isIsoTimestampWithTimezone(value.createdAt)) {
    reasons.push("createdAt");
  }

  const expectedComplexity = typeof value.taskId === "string"
    ? getExpectedTaskComplexity(value.taskId)
    : null;
  if (expectedComplexity && isTaskComplexity(value.complexity) && value.complexity !== expectedComplexity) {
    reasons.push("complexityForTaskId");
  }

  if (typeof value.completedInFirstAttempt !== "boolean") {
    reasons.push("completedInFirstAttempt");
  }

  if (typeof value.wrongFileModified !== "boolean") {
    reasons.push("wrongFileModified");
  }

  if (typeof value.unrelatedCodeChanged !== "boolean") {
    reasons.push("unrelatedCodeChanged");
  }

  if (!Array.isArray(value.validations)) {
    reasons.push("validations");
  } else {
    let hasInvalidValidation = false;

    for (const validation of value.validations) {
      const validationReasons = getValidationInvalidReasons(validation);
      hasInvalidValidation = hasInvalidValidation || validationReasons.length > 0;
      addUniqueReasons(reasons, validationReasons);
    }

    if (!hasInvalidValidation) {
      addUniqueReasons(reasons, getValidationKindCardinalityReasons(value.validations));
    }

    if (!hasInvalidValidation && value.completedInFirstAttempt === true && hasFailedValidationResult(value.validations)) {
      reasons.push("completedInFirstAttemptValidationMismatch");
    }

    if (
      !hasInvalidValidation &&
      typeof value.failureRecovered === "boolean" &&
      value.completedInFirstAttempt === true &&
      !hasFailedValidationResult(value.validations)
    ) {
      reasons.push("failureRecoveredWithoutFailure");
    }
  }

  if (
    value.failureRecovered !== null &&
    value.failureRecovered !== undefined &&
    typeof value.failureRecovered !== "boolean"
  ) {
    reasons.push("failureRecovered");
  }

  return reasons;
}

function getValidationKindCardinalityReasons(validations) {
  const kindCounts = new Map();

  for (const validation of validations) {
    kindCounts.set(validation.kind, (kindCounts.get(validation.kind) ?? 0) + 1);
  }

  return REQUIRED_VALIDATION_KINDS.flatMap((kind) => {
    const count = kindCounts.get(kind) ?? 0;

    if (count === 0) {
      return [`validations.missing${toTitleCase(kind)}`];
    }

    if (count > 1) {
      return [`validations.duplicate${toTitleCase(kind)}`];
    }

    return [];
  });
}

function getValidationInvalidReasons(value) {
  if (!isRecord(value)) {
    return ["validations"];
  }

  const reasons = [];

  if (!isValidationKind(value.kind)) {
    reasons.push("validations.kind");
  }

  if (typeof value.command !== "string" || value.command.trim().length === 0) {
    reasons.push("validations.command");
  }

  if (!Number.isInteger(value.exitCode) || value.exitCode < 0) {
    reasons.push("validations.exitCode");
  }

  if (typeof value.passed !== "boolean") {
    reasons.push("validations.passed");
  }

  if (
    Number.isInteger(value.exitCode) &&
    value.exitCode >= 0 &&
    typeof value.passed === "boolean" &&
    value.passed !== (value.exitCode === 0)
  ) {
    reasons.push("validations.passedExitCodeMismatch");
  }

  return reasons;
}

function addUniqueReasons(target, reasons) {
  for (const reason of reasons) {
    if (!target.includes(reason)) {
      target.push(reason);
    }
  }
}

function toTitleCase(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function isTaskComplexity(value) {
  return value === "simple" || value === "medium" || value === "complex";
}

function getExpectedTaskComplexity(taskId) {
  if (!REQUIRED_TASK_IDS.includes(taskId)) {
    return null;
  }

  if (taskId.startsWith("S")) {
    return "simple";
  }

  if (taskId.startsWith("M")) {
    return "medium";
  }

  if (taskId.startsWith("C")) {
    return "complex";
  }

  return null;
}

function isValidationKind(value) {
  return value === "typecheck" || value === "build" || value === "lint";
}

function hasFailedValidationResult(validations) {
  return validations.some((validation) => isRecord(validation) && validation.passed === false);
}

function isIsoTimestampWithTimezone(value) {
  if (Number.isNaN(Date.parse(value))) {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value);
}

function writeSummary(summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify(summary));
    return;
  }

  if (summary.status === "missing") {
    console.log("v0.2 regression results: missing");
    console.log("No regression results file was found. Real task metrics remain unproven.");
    return;
  }

  if (summary.status === "error") {
    console.error(`v0.2 regression results: error reading ${summary.source}`);
    console.error(summary.message);
    return;
  }

  console.log(`v0.2 regression results: ${summary.totalRuns} runs`);
  console.log(`Source: ${summary.source}`);
  console.log(`Raw runs: ${summary.totalRawRuns}`);

  if (summary.invalidRunCount > 0) {
    console.log(
      `Invalid runs: ${summary.invalidRuns
        .map((run) => {
          const label = `${run.index}${run.taskId ? `:${run.taskId}` : ""}`;
          const reasons = Array.isArray(run.reasons) && run.reasons.length > 0
            ? ` [${run.reasons.join(", ")}]`
            : "";

          return `${label}${reasons}`;
        })
        .join(", ")}`
    );
  }

  if (summary.duplicateTaskCount > 0) {
    console.log(`Duplicate tasks: ${summary.duplicateTaskIds.join(", ")}`);
  }

  if (summary.metadata?.invalidMetadata.length > 0) {
    console.log(`Invalid metadata: ${summary.metadata.invalidMetadata.join(", ")}`);
  }

  console.log(
    `Coverage: ${summary.coverage.coveredTaskCount}/${summary.coverage.requiredTaskCount} fixed tasks ${
      summary.coverage.completeTaskSet ? "complete" : "incomplete"
    }`
  );

  if (summary.coverage.missingTaskIds.length > 0) {
    console.log(`Missing tasks: ${summary.coverage.missingTaskIds.join(", ")}`);
  }

  if (summary.coverage.unexpectedTaskIds.length > 0) {
    console.log(`Unexpected tasks: ${summary.coverage.unexpectedTaskIds.join(", ")}`);
  }

  console.log(
    `Regression usable gate: ${summary.gate.regressionUsablePassed ? "passed" : "failed"}`
  );

  if (summary.gate.blockingMetricIds.length > 0) {
    console.log(`Below usable metrics: ${summary.gate.blockingMetricIds.join(", ")}`);
  }

  if (summary.gate.unprovenMetricIds.length > 0) {
    console.log(`Unproven metrics: ${summary.gate.unprovenMetricIds.join(", ")}`);
  }

  for (const metric of summary.metrics) {
    const value = metric.value === null ? "unproven" : `${Math.round(metric.value * 100)}%`;
    const status = metric.usablePassed === null ? "unproven" : metric.usablePassed ? "usable" : "below-usable";

    console.log(`${metric.id}: ${value} (${metric.numerator}/${metric.denominator}) ${status}`);
  }
}
