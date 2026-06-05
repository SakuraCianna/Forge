// 本文件说明: 串联 v0.2.x 可用级门禁, 不执行发布、上传或 Git 写操作
import { spawn } from "node:child_process";

const commands = [
  npmCommandSpec("npm run quality:regression:gate", ["run", "quality:regression:gate"]),
  npmCommandSpec("npm run quality:installer-smoke", ["run", "quality:installer-smoke"]),
  npmCommandSpec("npm run quality:v0.2", ["run", "quality:v0.2"])
];

if (process.env.FORGE_USABILITY_GATE_DRY_RUN === "true") {
  console.log(
    JSON.stringify({
      commands: commands.map((command) => command.label)
    })
  );
  process.exit(0);
}

const results = [];

for (const command of commands) {
  const startedAt = Date.now();
  console.log(`\n[quality:v0.2:usable] Running ${command.label}`);
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

console.log("\n[quality:v0.2:usable] Summary");
for (const result of results) {
  console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${result.label} ${result.durationMs}ms`);
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
    const child = spawn(command.executable, command.args, {
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
