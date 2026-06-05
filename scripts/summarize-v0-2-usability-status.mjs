// 本文件说明: 汇总 v0.2.x 可用性证据状态, 不运行打包门禁, 不生成正式证据
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

const regressionResult = await runJsonScript("summarize-v0-2-regression-results.mjs", [
  "--require-complete-set",
  "--require-usable-regression",
  "--json"
]);
const installerSmokeResult = await runJsonScript("check-v0-2-installer-smoke.mjs", ["--json"]);
const regressionStatus = getRegressionStatus(regressionResult);
const installerSmokeStatus = getInstallerSmokeStatus(installerSmokeResult);
const blockers = [
  ...getRegressionBlockers(regressionStatus),
  ...getInstallerSmokeBlockers(installerSmokeStatus)
];
const summary = {
  classification: blockers.length === 0 ? "evidence-ready" : blockers.some((blocker) => blocker.endsWith("-missing")) ? "unproven" : "blocked",
  passed: blockers.length === 0,
  blockers,
  regression: {
    status: regressionStatus
  },
  installerSmoke: {
    status: installerSmokeStatus
  }
};

writeSummary(summary, args.json);

function parseArgs(rawArgs) {
  return {
    json: rawArgs.includes("--json")
  };
}

function runJsonScript(scriptName, scriptArgs) {
  return new Promise((resolveResult) => {
    let stdout = "";
    const child = spawn(process.execPath, [resolve(scriptDirectory, scriptName), ...scriptArgs], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      windowsHide: true
    });

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", () => {});
    child.on("error", (error) => {
      resolveResult({
        code: 1,
        summary: {
          status: "error",
          message: error.message
        }
      });
    });
    child.on("exit", (code) => {
      resolveResult({
        code: code ?? 1,
        summary: parseJsonSummary(stdout)
      });
    });
  });
}

function parseJsonSummary(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return {
      status: "error",
      message: "Unable to parse JSON summary"
    };
  }
}

function getRegressionStatus(result) {
  if (result.code === 0 && result.summary?.status === "ok") {
    return "passed";
  }

  if (result.summary?.status === "missing") {
    return "missing";
  }

  if (result.summary?.status === "error") {
    return "invalid";
  }

  if (result.summary?.status === "ok" && hasInvalidRegressionEvidence(result.summary)) {
    return "invalid";
  }

  return "failed";
}

function getInstallerSmokeStatus(result) {
  if (result.code === 0 && result.summary?.passed === true) {
    return "passed";
  }

  if (result.summary?.status === "missing") {
    return "missing";
  }

  if (result.summary?.status === "error") {
    return "invalid";
  }

  if (result.summary?.status === "ok" && hasInvalidInstallerSmokeEvidence(result.summary)) {
    return "invalid";
  }

  return "failed";
}

function hasInvalidRegressionEvidence(summary) {
  return (
    hasItems(summary?.metadata?.invalidMetadata) ||
    isPositiveNumber(summary?.invalidRunCount) ||
    isPositiveNumber(summary?.duplicateTaskCount) ||
    summary?.coverage?.completeTaskSet === false
  );
}

function hasInvalidInstallerSmokeEvidence(summary) {
  return (
    hasItems(summary?.missingMetadata) ||
    hasItems(summary?.invalidMetadata) ||
    hasItems(summary?.missingChecks) ||
    summary?.installerExists === false
  );
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function isPositiveNumber(value) {
  return typeof value === "number" && value > 0;
}

function getRegressionBlockers(status) {
  if (status === "passed") {
    return [];
  }

  if (status === "missing") {
    return ["regression-results-missing"];
  }

  if (status === "invalid") {
    return ["regression-results-invalid"];
  }

  return ["regression-results-below-usable"];
}

function getInstallerSmokeBlockers(status) {
  if (status === "passed") {
    return [];
  }

  if (status === "missing") {
    return ["installer-smoke-missing"];
  }

  if (status === "invalid") {
    return ["installer-smoke-invalid"];
  }

  return ["installer-smoke-failed"];
}

function writeSummary(summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify(summary));
    return;
  }

  console.log(`v0.2 usability status: ${summary.classification}`);
  console.log(`Regression evidence: ${summary.regression.status}`);
  console.log(`Installer smoke evidence: ${summary.installerSmoke.status}`);

  if (summary.blockers.length > 0) {
    console.log(`Blockers: ${summary.blockers.join(", ")}`);
  }
}
