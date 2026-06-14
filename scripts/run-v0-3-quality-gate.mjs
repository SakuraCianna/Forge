// 本文件说明: 串联 v0.3.x 发布候选质量门禁, 不执行发布、上传或 Git 写操作
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const commandDefinitions = [
  npmCommandSpec("npm test", ["test"]),
  npmCommandSpec("npm run release:check", ["run", "release:check"]),
  npmCommandSpec("npm run qa:built-in-tools", ["run", "qa:built-in-tools"]),
  npmCommandSpec("npm run qa:built-in-tools:browser", ["run", "qa:built-in-tools:browser"]),
  npmCommandSpec("npm run dist:win", ["run", "dist:win"])
];
const skipDist = process.env.FORGE_QUALITY_GATE_SKIP_DIST === "true";
const commands = skipDist
  ? commandDefinitions.filter((command) => command.label !== "npm run dist:win")
  : commandDefinitions;

if (process.env.FORGE_QUALITY_GATE_DRY_RUN === "true") {
  console.log(
    JSON.stringify({
      skipDist,
      commands: commands.map((command) => command.label)
    })
  );
  process.exit(0);
}

const commandEnv = await createCommandEnv();
const results = [];

for (const command of commands) {
  const startedAt = Date.now();
  console.log(`\n[quality:v0.3] Running ${command.label}`);
  const result = await runCommand(command);

  results.push({
    ...result,
    durationMs: Date.now() - startedAt
  });

  if (result.code !== 0) {
    break;
  }
}

console.log("\n[quality:v0.3] Summary");
for (const result of results) {
  const status = result.code === 0 ? "PASS" : "FAIL";
  const warnings = result.warningLabels.length > 0 ? ` warnings=${result.warningLabels.join(",")}` : "";

  console.log(`${status} ${result.label} ${result.durationMs}ms${warnings}`);
}

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
    const outputChunks = [];
    const child = spawn(command.executable, command.args, {
      env: commandEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    child.stdout?.on("data", (chunk) => {
      outputChunks.push(chunk);
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      outputChunks.push(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      console.error(error);
      resolve({
        code: 1,
        label: command.label,
        warningLabels: []
      });
    });
    child.on("exit", (code) => {
      resolve({
        code: code ?? 1,
        label: command.label,
        warningLabels: detectWarningLabels(Buffer.concat(outputChunks).toString("utf8"))
      });
    });
  });
}

function detectWarningLabels(output) {
  const labels = [];

  if (/duplicate dependency references/u.test(output)) {
    labels.push("duplicate-dependencies");
  }

  if (/DEP0190/u.test(output)) {
    labels.push("dep0190-shell-args");
  }

  return labels;
}

async function createCommandEnv() {
  const childEnv = { ...process.env };
  delete childEnv.FORGE_QUALITY_GATE_SKIP_DIST;

  const projectRoot =
    process.env.FORGE_QA_PROJECT_ROOT ?? (await createDefaultQaSandbox());

  return {
    ...childEnv,
    FORGE_QA_MODEL_ID: process.env.FORGE_QA_MODEL_ID ?? "mimo-v2.5-pro",
    FORGE_QA_PROJECT_ROOT: projectRoot
  };
}

async function createDefaultQaSandbox() {
  const projectRoot = resolve(".tmp-test", "quality-gate-sandbox");
  const sourceRoot = join(projectRoot, "src");

  await mkdir(sourceRoot, { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify(
      {
        name: "forge-v0-3-quality-gate-sandbox",
        scripts: {
          build: "node -e \"console.log('Forge quality gate build')\"",
          lint: "node -e \"console.log('Forge quality gate lint')\"",
          test: "node -e \"console.log('Forge quality gate test')\"",
          typecheck: "tsc --noEmit"
        },
        devDependencies: {
          typescript: "^6.0.3"
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    join(projectRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022"
        },
        include: ["src/**/*.ts"]
      },
      null,
      2
    ),
    "utf8"
  );
  await writeFile(
    join(sourceRoot, "index.ts"),
    "export function hello(name: string): string {\n  return `hello ${name}`;\n}\n",
    "utf8"
  );

  return projectRoot;
}
