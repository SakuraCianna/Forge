// 本文件说明: 启动临时本地页面, 再用 Electron 运行真实 Browser Built-in Tools QA
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronQaScriptPath = resolve(repoRoot, "scripts", "electron-built-in-tool-browser-qa.mjs");
const electronQaTimeoutMs = readPositiveIntegerEnv("FORGE_QA_BROWSER_TIMEOUT_MS", 45_000);
const fixture = await startBrowserQaFixtureServer();

try {
  process.exitCode = await runElectronBrowserQa(fixture.url);
} finally {
  await fixture.close();
}

function startBrowserQaFixtureServer() {
  const server = createServer((request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8"
    });
    response.end(createBrowserQaFixtureHtml(request.url ?? "/"));
  });

  return new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        rejectStart(new Error("Could not resolve Browser QA fixture server port"));
        return;
      }

      resolveStart({
        url: `http://127.0.0.1:${address.port}/`,
        close: () =>
          new Promise((resolveClose) => {
            let settled = false;
            const finish = () => {
              if (!settled) {
                settled = true;
                resolveClose();
              }
            };
            const closeTimer = setTimeout(finish, 1_500);

            closeTimer.unref?.();
            server.closeAllConnections?.();
            server.close(finish);
          })
      });
    });
  });
}

function runElectronBrowserQa(browserPreviewUrl) {
  return new Promise((resolveExit) => {
    let settled = false;
    const child = spawn(electronPath, [electronQaScriptPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        FORGE_QA_BROWSER_CHECKS: "true",
        FORGE_QA_ELECTRON_RUNNER_TIMEOUT_MS: String(Math.max(5_000, electronQaTimeoutMs - 5_000)),
        FORGE_QA_BROWSER_PREVIEW_URL: browserPreviewUrl
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      console.error(`Electron Browser QA timed out after ${electronQaTimeoutMs}ms.`);

      if (!child.killed) {
        child.kill();
      }

      const forceFinishTimer = setTimeout(() => finish(1), 5_000);
      forceFinishTimer.unref?.();
    }, electronQaTimeoutMs);

    timeout.unref?.();

    child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));

    child.on("error", (error) => {
      console.error(error);
      finish(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`Electron Browser QA exited with signal ${signal}`);
      }

      finish(code ?? 1);
    });

    function finish(code) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolveExit(code);
    }
  });
}

function readPositiveIntegerEnv(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createBrowserQaFixtureHtml(pathname) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Forge Browser QA</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Arial, sans-serif;
        background: #f7f7f3;
        color: #202123;
      }
      main {
        width: min(720px, calc(100vw - 48px));
        border: 1px solid #d8d7cf;
        border-radius: 8px;
        padding: 32px;
        background: #ffffff;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }
      code {
        background: #efeee8;
        padding: 2px 6px;
        border-radius: 4px;
      }
    </style>
    <script>
      console.info("Forge Browser QA fixture loaded");
      console.warn("Forge Browser QA warning sample");
    </script>
  </head>
  <body>
    <main>
      <h1>Forge Browser QA</h1>
      <p>This local fixture verifies <code>takeScreenshot</code> and <code>inspectPageConsole</code>.</p>
      <p>Path: <code>${escapeHtml(pathname)}</code></p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
