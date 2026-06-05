// 本文件说明: 在 Electron 主进程中执行 Browser Built-in Tools QA
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { createElectronBrowserPreviewTools } from "../.tmp-test/src/main/browserPreviewTools.js";
import { createDefaultBuiltInToolExecutors } from "../.tmp-test/src/main/builtInTools/builtInToolExecutors.js";
import { createBuiltInToolRegistry } from "../.tmp-test/src/main/builtInTools/builtInToolRegistry.js";
import { runDevelopmentBuiltInToolQa } from "../.tmp-test/src/main/builtInTools/builtInToolQaRunner.js";

const browserPreviewUrl = process.env.FORGE_QA_BROWSER_PREVIEW_URL;
const verbose = process.env.FORGE_QA_BROWSER_VERBOSE === "true";
const runnerTimeoutMs = readPositiveIntegerEnv("FORGE_QA_ELECTRON_RUNNER_TIMEOUT_MS", 40_000);
const failsafeTimer = setTimeout(() => {
  console.error(`Electron Browser QA runner timed out after ${runnerTimeoutMs}ms.`);
  process.exitCode = 1;
  app.exit(1);
}, runnerTimeoutMs);

failsafeTimer.unref?.();
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.on("window-all-closed", (event) => {
  event.preventDefault();
});

void runElectronBrowserQa();

async function runElectronBrowserQa() {
  try {
    if (!browserPreviewUrl) {
      throw new Error("FORGE_QA_BROWSER_PREVIEW_URL is required for Electron Browser QA");
    }

    logProgress("waiting for Electron app ready");
    await app.whenReady();
    logProgress("Electron app ready");

    logProgress("creating built-in tool registry with Electron browser provider");
    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors({
        browserTools: createElectronBrowserPreviewTools({
          screenshotDirectory: join(tmpdir(), "forge-browser-qa-screenshots")
        }),
        fetcher: createBrowserQaFetcher(browserPreviewUrl),
        openExternal: async () => undefined
      })
    });
    logProgress("running development built-in tool QA");
    const result = await runDevelopmentBuiltInToolQa({
      registry,
      request: {
        browserPreviewUrl,
        includeBrowserChecks: true,
        includeMutationChecks: process.env.FORGE_QA_MUTATION_CHECKS !== "false",
        includeWebChecks: process.env.FORGE_QA_WEB_CHECKS !== "false",
        projectRoot: process.env.FORGE_QA_PROJECT_ROOT,
        modelId: process.env.FORGE_QA_MODEL_ID
      }
    });
    logProgress("development built-in tool QA finished");
    const browserScenarioStatuses = result.scenarios
      .filter((scenario) => scenario.id === "browser-screenshot" || scenario.id === "browser-console")
      .map((scenario) => scenario.status);

    await writeStdout(`${JSON.stringify(result, null, 2)}\n`);

    if (
      result.status !== "passed" ||
      browserScenarioStatuses.length !== 2 ||
      browserScenarioStatuses.some((status) => status !== "succeeded")
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(failsafeTimer);
    app.exit(process.exitCode ?? 0);
  }
}

function createBrowserQaFetcher(browserPreviewUrl) {
  return async (url, init) => {
    const requestedUrl = typeof url === "string" ? url : url.toString();

    if (requestedUrl.startsWith("https://www.bing.com/search")) {
      return createTextResponse(
        `<!doctype html><html><body><ol><li class="b_algo"><h2><a href="${escapeHtml(browserPreviewUrl)}">Forge Browser QA fixture</a></h2><p>Local Forge webSearch QA result.</p></li></ol></body></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        }
      );
    }

    return globalThis.fetch(url, init);
  };
}

function createTextResponse(text, { status, headers }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => text
  };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readPositiveIntegerEnv(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function logProgress(message) {
  if (verbose) {
    console.error(`[browser-qa] ${message}`);
  }
}

function writeStdout(message) {
  return new Promise((resolve) => {
    process.stdout.write(message, () => resolve());
  });
}
