// 本文件说明: 校验 v0.2.x Windows 安装包人工烟测报告, 不安装应用, 不写入系统状态
import { createHash } from "node:crypto";
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
const REQUIRED_METADATA = ["forgeVersion", "installerPath", "installerSha256", "testedAt", "platform"];
const ISO_TIMESTAMP_WITH_TIMEZONE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

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
    installerSha256Matches: false,
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
      installerExists: false,
      installerSha256Matches: false
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
  const missingMetadata = REQUIRED_METADATA.filter((metadataId) => typeof report?.[metadataId] !== "string");
  const installerPath = getInstallerPath(report, packageVersion);
  const installerExists = installerPath ? existsSync(installerPath) : false;
  const installerSha256Matches = await verifyInstallerSha256(report, installerPath, installerExists);
  const invalidMetadata = getInvalidMetadata(report, packageVersion, installerPath, installerSha256Matches);
  const passed =
    missingChecks.length === 0 &&
    failedChecks.length === 0 &&
    missingMetadata.length === 0 &&
    invalidMetadata.length === 0 &&
    installerExists &&
    installerSha256Matches;

  return {
    status: "ok",
    passed,
    missingChecks,
    failedChecks,
    missingMetadata,
    invalidMetadata,
    installerExists,
    installerSha256Matches
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

async function verifyInstallerSha256(report, installerPath, installerExists) {
  if (
    !installerPath ||
    !installerExists ||
    typeof report?.installerSha256 !== "string" ||
    !isSha256(report.installerSha256)
  ) {
    return false;
  }

  const installerHash = createHash("sha256")
    .update(await readFile(installerPath))
    .digest("hex");

  return installerHash === report.installerSha256.toLowerCase();
}

function getInvalidMetadata(report, packageVersion, installerPath, installerSha256Matches) {
  const invalidMetadata = [];

  if (typeof report?.forgeVersion === "string" && report.forgeVersion !== packageVersion) {
    invalidMetadata.push("forgeVersion");
  }

  if (typeof report?.testedAt === "string" && !isAuditableSmokeTimestamp(report.testedAt)) {
    invalidMetadata.push("testedAt");
  }

  if (typeof report?.platform === "string" && !isWindowsPlatform(report.platform)) {
    invalidMetadata.push("platform");
  }

  if (typeof report?.installerPath === "string" && !installerPath) {
    invalidMetadata.push("installerPath");
  }

  if (
    typeof report?.installerSha256 === "string" &&
    (!isSha256(report.installerSha256) || !installerSha256Matches)
  ) {
    invalidMetadata.push("installerSha256");
  }

  return invalidMetadata;
}

function getInstallerPath(report, packageVersion) {
  const expectedInstallerPath = `release/Forge-${packageVersion}-x64-setup.exe`;

  if (typeof report?.installerPath !== "string") {
    return null;
  }

  const normalizedPath = report.installerPath.replace(/\\/gu, "/");

  if (normalizedPath !== expectedInstallerPath) {
    return null;
  }

  return resolve(expectedInstallerPath);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/iu.test(value);
}

function isIsoTimestampWithTimezone(value) {
  const match = ISO_TIMESTAMP_WITH_TIMEZONE_PATTERN.exec(value);

  if (!match || !isValidCalendarDate(match[1], match[2], match[3])) {
    return false;
  }

  if (Number.isNaN(Date.parse(value))) {
    return false;
  }

  return true;
}

function isAuditableSmokeTimestamp(value) {
  return isIsoTimestampWithTimezone(value) && Date.parse(value) <= Date.now();
}

function isValidCalendarDate(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return day <= daysInMonth;
}

function isWindowsPlatform(value) {
  return /^Windows(?:[\s_-]|$)/iu.test(value.trim());
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
      installerSha256Matches,
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
        installerSha256Matches,
        message
      })
    );
    return;
  }

  console.log(`v0.2 installer smoke: ${summary.passed ? "passed" : "failed"}`);
  console.log(`Status: ${summary.status}`);
  console.log(`Installer artifact: ${summary.installerExists ? "found" : "missing"}`);
  console.log(`Installer SHA-256: ${summary.installerSha256Matches ? "matched" : "missing-or-mismatched"}`);

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
