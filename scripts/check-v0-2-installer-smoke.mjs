// 本文件说明: 校验 v0.2.x Windows 安装包人工烟测报告, 不安装应用, 不写入系统状态
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_CHECKS = [
  "appLaunches",
  "projectOpens",
  "filePreviewWorks",
  "safeCommandRuns",
  "generatedDiffAcceptRejectWorks",
  "gitStatusViewOpens",
  "highRiskRequiresConfirmation"
];
const REQUIRED_METADATA = ["installerPath", "testedAt", "platform"];

const args = parseArgs(process.argv.slice(2));
const reportPath = resolve(args.file ?? process.env.FORGE_INSTALLER_SMOKE_FILE ?? "docs/V0_2_INSTALLER_SMOKE.json");

try {
  const summary = await createSummary(reportPath);

  writeSummary(summary, args.json);
  process.exitCode = summary.passed ? 0 : 1;
} catch (error) {
  const summary = {
    status: "error",
    passed: false,
    missingChecks: REQUIRED_CHECKS,
    failedChecks: [],
    missingMetadata: REQUIRED_METADATA,
    invalidMetadata: [],
    installerExists: false,
    message: error instanceof Error ? error.message : String(error)
  };

  writeSummary(summary, args.json);
  process.exitCode = 1;
}

function parseArgs(rawArgs) {
  const parsed = {
    file: null,
    json: false
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--json") {
      parsed.json = true;
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

async function createSummary(filePath) {
  if (!existsSync(filePath)) {
    return {
      status: "missing",
      passed: false,
      missingChecks: REQUIRED_CHECKS,
      failedChecks: [],
      missingMetadata: REQUIRED_METADATA,
      invalidMetadata: [],
      installerExists: false
    };
  }

  const rawValue = await readFile(filePath, "utf8");
  const report = JSON.parse(rawValue);

  if (!isRecord(report) || Array.isArray(report)) {
    throw new Error("v0.2 installer smoke report must be a JSON object");
  }

  if (!isRecord(report.checks) || Array.isArray(report.checks)) {
    throw new Error("v0.2 installer smoke report must contain a checks object");
  }

  const packageVersion = await readPackageVersion();
  const checks = report.checks;
  const missingChecks = REQUIRED_CHECKS.filter((checkId) => typeof checks[checkId] !== "boolean");
  const failedChecks = REQUIRED_CHECKS.filter((checkId) => checks[checkId] === false);
  const installerPath = typeof report?.installerPath === "string" ? resolve(report.installerPath) : null;
  const installerExists = installerPath ? existsSync(installerPath) : false;
  const missingMetadata = REQUIRED_METADATA.filter((metadataId) => typeof report?.[metadataId] !== "string");
  const invalidMetadata = getInvalidMetadata(report, packageVersion);
  const passed =
    missingChecks.length === 0 &&
    failedChecks.length === 0 &&
    missingMetadata.length === 0 &&
    invalidMetadata.length === 0 &&
    installerExists;

  return {
    status: "ok",
    passed,
    missingChecks,
    failedChecks,
    missingMetadata,
    invalidMetadata,
    installerExists
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

  throw new Error("Unable to read package version for installer smoke validation");
}

function getInvalidMetadata(report, packageVersion) {
  const invalidMetadata = [];

  if (typeof report?.testedAt === "string" && Number.isNaN(Date.parse(report.testedAt))) {
    invalidMetadata.push("testedAt");
  }

  if (typeof report?.platform === "string" && !/windows/i.test(report.platform)) {
    invalidMetadata.push("platform");
  }

  const expectedInstallerPattern = new RegExp(
    `release[\\\\/]+Forge-${escapeRegExp(packageVersion)}-x64-setup\\.exe$`,
    "u"
  );

  if (typeof report?.installerPath === "string" && !expectedInstallerPattern.test(report.installerPath)) {
    invalidMetadata.push("installerPath");
  }

  return invalidMetadata;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function writeSummary(summary, asJson) {
  if (asJson) {
    const {
      status,
      passed,
      missingChecks,
      failedChecks,
      missingMetadata,
      invalidMetadata,
      installerExists,
      message
    } = summary;

    console.log(
      JSON.stringify({
        status,
        passed,
        missingChecks,
        failedChecks,
        missingMetadata,
        invalidMetadata,
        installerExists,
        message
      })
    );
    return;
  }

  console.log(`v0.2 installer smoke: ${summary.passed ? "passed" : "failed"}`);
  console.log(`Status: ${summary.status}`);
  console.log(`Installer artifact: ${summary.installerExists ? "found" : "missing"}`);

  if (summary.missingChecks.length > 0) {
    console.log(`Missing checks: ${summary.missingChecks.join(", ")}`);
  }

  if (summary.failedChecks.length > 0) {
    console.log(`Failed checks: ${summary.failedChecks.join(", ")}`);
  }

  if (summary.missingMetadata.length > 0) {
    console.log(`Missing metadata: ${summary.missingMetadata.join(", ")}`);
  }

  if (summary.invalidMetadata.length > 0) {
    console.log(`Invalid metadata: ${summary.invalidMetadata.join(", ")}`);
  }

  if (summary.message) {
    console.error(summary.message);
  }
}
