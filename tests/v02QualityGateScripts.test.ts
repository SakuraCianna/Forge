import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("v0.2 quality gate script is wired and exposes a safe dry run", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["quality:v0.2"], "node scripts/run-v0-2-quality-gate.mjs");

  const scriptSource = await readFile("scripts/run-v0-2-quality-gate.mjs", "utf8");

  assert.match(scriptSource, /shell:\s*false/u);
  assert.doesNotMatch(scriptSource, /gh\s+release|git\s+push|Remove-Item|rm\s+-rf/u);

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/run-v0-2-quality-gate.mjs"],
    {
      env: {
        ...process.env,
        FORGE_QUALITY_GATE_DRY_RUN: "true",
        FORGE_QUALITY_GATE_SKIP_DIST: "false"
      },
      windowsHide: true
    }
  );

  const dryRun = JSON.parse(stdout) as { commands: string[]; skipDist: boolean };

  assert.equal(dryRun.skipDist, false);
  assert.deepEqual(dryRun.commands, [
    "npm test",
    "npm run release:check",
    "npm run qa:built-in-tools",
    "npm run qa:built-in-tools:browser",
    "npm run dist:win"
  ]);
});

test("v0.2 quality gate dry run can skip rebuilding the installer artifact", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/run-v0-2-quality-gate.mjs"],
    {
      env: {
        ...process.env,
        FORGE_QUALITY_GATE_DRY_RUN: "true",
        FORGE_QUALITY_GATE_SKIP_DIST: "true"
      },
      windowsHide: true
    }
  );

  const dryRun = JSON.parse(stdout) as { commands: string[]; skipDist: boolean };

  assert.equal(dryRun.skipDist, true);
  assert.deepEqual(dryRun.commands, [
    "npm test",
    "npm run release:check",
    "npm run qa:built-in-tools",
    "npm run qa:built-in-tools:browser"
  ]);
});
