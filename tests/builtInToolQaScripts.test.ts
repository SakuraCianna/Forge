import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("built-in tool browser QA scripts are wired through npm and Electron", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const nodeWrapper = await readFile("scripts/run-built-in-tool-browser-qa.mjs", "utf8");
  const electronRunner = await readFile("scripts/electron-built-in-tool-browser-qa.mjs", "utf8");

  assert.match(packageJson.scripts["qa:built-in-tools:browser"], /run-built-in-tool-browser-qa/u);
  assert.match(nodeWrapper, /createServer/u);
  assert.match(nodeWrapper, /FORGE_QA_BROWSER_TIMEOUT_MS/u);
  assert.match(nodeWrapper, /FORGE_QA_BROWSER_PREVIEW_URL/u);
  assert.match(nodeWrapper, /FORGE_QA_ELECTRON_RUNNER_TIMEOUT_MS/u);
  assert.match(nodeWrapper, /electron-built-in-tool-browser-qa\.mjs/u);
  assert.match(electronRunner, /disableHardwareAcceleration/u);
  assert.match(electronRunner, /FORGE_QA_ELECTRON_RUNNER_TIMEOUT_MS/u);
  assert.match(electronRunner, /window-all-closed/u);
  assert.match(electronRunner, /preventDefault/u);
  assert.match(electronRunner, /void runElectronBrowserQa\(\)/u);
  assert.doesNotMatch(electronRunner, /^await app\.whenReady\(\);$/mu);
  assert.match(electronRunner, /writeStdout/u);
  assert.match(electronRunner, /createElectronBrowserPreviewTools/u);
  assert.match(electronRunner, /includeWebChecks/u);
  assert.match(electronRunner, /createBrowserQaFetcher/u);
  assert.match(electronRunner, /function createTextResponse/u);
  assert.match(electronRunner, /function escapeHtml/u);
  assert.match(electronRunner, /openExternal/u);
  assert.match(electronRunner, /browser-screenshot/u);
  assert.match(electronRunner, /browser-console/u);
});

test("built-in tool QA sandbox preparation exports a GitHub Actions project root", async () => {
  const sandboxPrep = await readFile("scripts/prepare-built-in-tool-qa-sandbox.mjs", "utf8");

  assert.match(sandboxPrep, /quality-gate-sandbox/u);
  assert.match(sandboxPrep, /GITHUB_ENV/u);
  assert.match(sandboxPrep, /FORGE_QA_PROJECT_ROOT/u);
  assert.match(sandboxPrep, /prepareBuiltInToolQaSandbox/u);
  assert.doesNotMatch(sandboxPrep, /gh\s+release|git\s+push|Remove-Item|rm\s+-rf/u);
});

test("built-in tool QA sandbox preparation writes a usable GitHub Actions env file", async () => {
  const tempDir = await mkdtemp(join(".tmp-test", "qa-sandbox-env-"));
  const githubEnvPath = join(tempDir, "github-env.txt");

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/prepare-built-in-tool-qa-sandbox.mjs"],
      {
        env: {
          ...process.env,
          GITHUB_ENV: githubEnvPath
        },
        windowsHide: true
      }
    );
    const result = JSON.parse(stdout) as {
      exportedToGitHubEnv: boolean;
      projectRoot: string;
    };
    const githubEnv = await readFile(githubEnvPath, "utf8");
    const sandboxPackageJson = await readFile(join(result.projectRoot, "package.json"), "utf8");

    assert.equal(result.exportedToGitHubEnv, true);
    assert.match(result.projectRoot, /quality-gate-sandbox/u);
    assert.match(githubEnv, /^FORGE_QA_PROJECT_ROOT=.*quality-gate-sandbox\r?\n$/u);
    assert.match(sandboxPackageJson, /forge-v0-3-quality-gate-sandbox/u);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("Electron browser preview tools use the current console-message event shape", async () => {
  const browserPreviewTools = await readFile("src/main/browserPreviewTools.ts", "utf8");

  assert.match(browserPreviewTools, /webContents\.on\("console-message", \(details\) =>/u);
  assert.doesNotMatch(browserPreviewTools, /webContents\.on\("console-message", \(_event, details\) =>/u);
});
