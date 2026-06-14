// 本文件说明: 串联 v0.3.x 可用级门禁, 不执行发布、上传或 Git 写操作
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const evidencePreflightCommand = commandSpec(
  "node scripts/summarize-v0-3-usability-status.mjs --json",
  process.execPath,
  [resolve(scriptDirectory, "summarize-v0-3-usability-status.mjs"), "--json"]
);
const commands = [
  npmCommandSpec("npm run quality:regression:gate", ["run", "quality:regression:gate"]),
  npmCommandSpec("npm run quality:installer-smoke", ["run", "quality:installer-smoke"]),
  {
    ...npmCommandSpec("npm run quality:v0.3 (skip dist)", ["run", "quality:v0.3"]),
    env: {
      FORGE_QUALITY_GATE_SKIP_DIST: "true"
    }
  }
];

if (process.env.FORGE_USABILITY_GATE_DRY_RUN === "true") {
  console.log(
    JSON.stringify({
      commands: [evidencePreflightCommand, ...commands].map((command) => command.label)
    })
  );
  process.exit(0);
}

const results = [];
const preflightStartedAt = Date.now();
const preflightResult = await runJsonCommand(evidencePreflightCommand);
const evidenceSummary = parseEvidenceSummary(preflightResult.stdout);
const evidencePassed = preflightResult.code === 0 && evidenceSummary?.passed === true;

console.log(
  `[quality:v0.3:usable] Evidence preflight: ${typeof evidenceSummary?.classification === "string"
    ? evidenceSummary.classification
    : "error"}`
);

if (Array.isArray(evidenceSummary?.blockers) && evidenceSummary.blockers.length > 0) {
  console.log(`Blockers: ${evidenceSummary.blockers.join(", ")}`);
}

results.push({
  label: "evidence preflight",
  code: evidencePassed ? 0 : 1,
  durationMs: Date.now() - preflightStartedAt
});

if (!evidencePassed) {
  console.log("\n[quality:v0.3:usable] Summary");
  writeCommandResults(results);
  process.exit(1);
}

for (const command of commands) {
  const startedAt = Date.now();
  console.log(`\n[quality:v0.3:usable] Running ${command.label}`);
  const code = await runCommand(command);

  results.push({
    label: command.label,
    code,
    durationMs: Date.now() - startedAt
  });

  if (code !== 0) {
    break;
  }
}

console.log("\n[quality:v0.3:usable] Summary");
writeCommandResults(results);

process.exitCode = results.some((result) => result.code !== 0) ? 1 : 0;

function commandSpec(label, executable, args) {
  return {
    label,
    executable,
    args
  };
}

function npmCommandSpec(label, args) {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    return commandSpec(label, process.execPath, [npmExecPath, ...args]);
  }

  return commandSpec(label, "npm", args);
}

function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      env: {
        ...process.env,
        ...(command.env ?? {})
      },
      shell: false,
      stdio: "inherit",
      windowsHide: true
    });

    child.on("error", (error) => {
      console.error(error);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function runJsonCommand(command) {
  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command.executable, command.args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      windowsHide: true
    });

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolveResult({
        code: 1,
        stdout: "",
        stderr: error.message
      });
    });
    child.on("exit", (code) => {
      resolveResult({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function parseEvidenceSummary(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return {
      classification: "error",
      passed: false,
      blockers: ["usability-status-unreadable"]
    };
  }
}

function writeCommandResults(commandResults) {
  for (const result of commandResults) {
    console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${result.label} ${result.durationMs}ms`);
  }
}
