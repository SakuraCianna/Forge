import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("Electron browser preview tools use the current console-message event shape", async () => {
  const browserPreviewTools = await readFile("src/main/browserPreviewTools.ts", "utf8");

  assert.match(browserPreviewTools, /webContents\.on\("console-message", \(details\) =>/u);
  assert.doesNotMatch(browserPreviewTools, /webContents\.on\("console-message", \(_event, details\) =>/u);
});
