import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBuiltInToolRegistry,
  getBuiltInToolFromRegistry
} from "../src/main/builtInTools/builtInToolRegistry.js";
import { createDefaultBuiltInToolExecutors } from "../src/main/builtInTools/builtInToolExecutors.js";
import type { BrowserPreviewTools } from "../src/main/browserPreviewTools.js";
import type {
  RunningProjectCommand,
  RunProjectCommandOptions
} from "../src/main/commandRunner.js";
import type { ProjectScanResult } from "../src/shared/projectTypes.js";
import { builtInToolDefinitions } from "../src/shared/builtInToolCatalog.js";

test("every available built-in tool has a default executor", () => {
  const executors = createDefaultBuiltInToolExecutors();
  const missingExecutors = builtInToolDefinitions
    .filter((tool) => tool.availability === "available")
    .filter((tool) => !executors[tool.name])
    .map((tool) => tool.name);

  assert.deepEqual(missingExecutors, []);
});

test("default built-in tool executors run P0 file, search and diff tools", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-executors-"));

  try {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    await writeFile(join(projectRoot, "index.ts"), "export const answer = 42;\n", "utf8");

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readFileResult = await getBuiltInToolFromRegistry(registry, "readFile").execute(
      { relativePath: "index.ts" },
      { projectRoot }
    );
    const searchResult = await getBuiltInToolFromRegistry(registry, "searchText").execute(
      { query: "answer" },
      { projectRoot }
    );
    const previewResult = await getBuiltInToolFromRegistry(registry, "previewDiff").execute(
      { relativePath: "index.ts", nextContent: "export const answer = 43;\n" },
      { projectRoot }
    );

    assert.equal((readFileResult as { content: string }).content, "export const answer = 42;\n");
    assert.equal((searchResult as { matches: unknown[] }).matches.length, 1);
    assert.equal((previewResult as { changeKind: string }).changeKind, "edit");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("readManyFiles passes maxBytesPerFile through as the per-file size limit", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-read-many-"));

  try {
    await writeFile(join(projectRoot, "first.txt"), "first file content\n", "utf8");
    await writeFile(join(projectRoot, "second.txt"), "second file content\n", "utf8");

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const result = await getBuiltInToolFromRegistry(registry, "readManyFiles").execute(
      { relativePaths: ["first.txt", "second.txt"], maxBytesPerFile: 5 },
      { projectRoot }
    );

    assert.equal((result as { status: string }).status, "failed");
    assert.match(
      (result as { error: { message: string } }).error.message,
      /File is too large to preview/u
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project-wide built-in tool executors use the injected project scanner", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-scan-injection-"));

  try {
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "scan-fixture" }), "utf8");

    const scanCalls: Array<{ limit?: number; rootPath: string }> = [];
    const scanResult: ProjectScanResult = {
      rootPath: projectRoot,
      files: [
        {
          modifiedAtMs: 100,
          relativePath: "src/main.ts",
          size: 20
        },
        {
          modifiedAtMs: 101,
          relativePath: "src/main.test.ts",
          size: 30
        }
      ],
      truncated: false,
      instructionFiles: [
        {
          relativePath: "AGENTS.md",
          content: "Use project evidence.",
          truncated: false
        }
      ]
    };
    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors({
        scanProjectFiles: async (rootPath, options = {}) => {
          scanCalls.push({
            limit: options.limit,
            rootPath
          });

          return scanResult;
        }
      })
    });

    const projectTree = await getBuiltInToolFromRegistry(registry, "getProjectTree").execute(
      { limit: 123 },
      { projectRoot }
    );
    const entrypoints = await getBuiltInToolFromRegistry(registry, "getEntrypoints").execute(
      {},
      { projectRoot }
    );
    const summary = await getBuiltInToolFromRegistry(registry, "getProjectSummary").execute(
      {},
      { projectRoot }
    );
    const instructions = await getBuiltInToolFromRegistry(registry, "readProjectInstructions").execute(
      {},
      { projectRoot }
    );

    assert.deepEqual(scanCalls, [
      { rootPath: projectRoot, limit: 123 },
      { rootPath: projectRoot, limit: undefined },
      { rootPath: projectRoot, limit: 2_000 },
      { rootPath: projectRoot, limit: undefined }
    ]);
    assert.equal((projectTree as ProjectScanResult).files.length, 2);
    assert.deepEqual((entrypoints as { entrypoints: string[] }).entrypoints, ["src/main.ts"]);
    assert.equal((summary as { fileCount: number }).fileCount, 2);
    assert.deepEqual(
      (instructions as { instructionFiles: Array<{ relativePath: string }> }).instructionFiles.map(
        (file) => file.relativePath
      ),
      ["AGENTS.md"]
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("default built-in tool executors provide dependency, diagnostic and validation helpers", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-analysis-"));

  try {
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({
        name: "fixture",
        scripts: {
          build: "vite build",
          lint: "eslint .",
          test: "node --test",
          typecheck: "tsc --noEmit"
        }
      }),
      "utf8"
    );
    await writeFile(join(projectRoot, "tsconfig.json"), JSON.stringify({}), "utf8");
    await writeFile(join(projectRoot, "lib.ts"), "export const answer = 42;\n", "utf8");
    await writeFile(
      join(projectRoot, "index.ts"),
      "import { answer } from './lib';\nconsole.log(answer);\n",
      "utf8"
    );

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const dependencyGraph = await getBuiltInToolFromRegistry(registry, "getDependencyGraph").execute(
      { limit: 20 },
      { projectRoot }
    );
    const diagnosticSearch = await getBuiltInToolFromRegistry(registry, "searchDiagnostics").execute(
      { errorLog: "index.ts:2:1 - error TS2304: Cannot find name 'answer'." },
      { projectRoot }
    );
    const validationPlan = await getBuiltInToolFromRegistry(registry, "suggestValidationPlan").execute(
      { changedFiles: ["index.ts"] },
      { projectRoot }
    );

    assert.deepEqual(
      (dependencyGraph as { edges: Array<{ from: string; to?: string }> }).edges.map((edge) => ({
        from: edge.from,
        to: edge.to
      })),
      [
        {
          from: "index.ts",
          to: "lib.ts"
        }
      ]
    );
    assert.ok((diagnosticSearch as { terms: string[] }).terms.includes("TS2304"));
    assert.ok((diagnosticSearch as { matches: unknown[] }).matches.length >= 1);
    assert.deepEqual(
      (validationPlan as { recommendations: Array<{ toolName: string }> }).recommendations.map(
        (recommendation) => recommendation.toolName
      ),
      ["runTypecheck", "runLint", "runBuild", "runTests", "getGitStatus"]
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("git branch executors quote branch names before building shell commands", async () => {
  const commands: string[] = [];
  const runCommand = async (options: RunProjectCommandOptions) => {
    commands.push(options.command);

    return {
      command: options.command,
      cwd: options.cwd,
      exitCode: 0,
      stderr: "",
      stdout: "",
      timedOut: false
    };
  };
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors({ runCommand })
  });
  const createBranchTool = getBuiltInToolFromRegistry(registry, "createBranch");
  const checkoutBranchTool = getBuiltInToolFromRegistry(registry, "checkoutBranch");
  const branch = "feature/test'; Write-Output unsafe; '";
  const projectRoot = "E:\\CodeHome\\Forge";

  await createBranchTool.execute({ branch }, { projectRoot, confirmed: true });
  await checkoutBranchTool.execute({ branch }, { projectRoot, confirmed: true, typedConfirmation: "CHECKOUT" });

  assert.deepEqual(commands, [
    "git switch -c 'feature/test''; Write-Output unsafe; '''",
    "git switch 'feature/test''; Write-Output unsafe; '''"
  ]);
});

test("default built-in tool executors run local semantic search without reading sensitive files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-semantic-search-"));

  try {
    await writeFile(
      join(projectRoot, "authService.ts"),
      "export function createSessionToken(userId: string): string {\n  return `login-token-${userId}`;\n}\n",
      "utf8"
    );
    await writeFile(join(projectRoot, ".env"), "LOGIN_SECRET=do-not-read\n", "utf8");

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readEnvResult = await getBuiltInToolFromRegistry(registry, "readFile").execute(
      { relativePath: ".env" },
      { projectRoot }
    );
    const searchEnvResult = await getBuiltInToolFromRegistry(registry, "searchText").execute(
      { query: "do-not-read", limit: 5 },
      { projectRoot }
    );
    const result = await getBuiltInToolFromRegistry(registry, "searchSemantic").execute(
      { query: "登录逻辑在哪", limit: 5 },
      { projectRoot }
    );
    const matches = (result as { matches: Array<{ relativePath: string; preview: string }> }).matches;

    assert.equal((readEnvResult as { status: string }).status, "failed");
    assert.match(
      (readEnvResult as { error: { message: string } }).error.message,
      /protected by safety policy/u
    );
    assert.deepEqual((searchEnvResult as { matches: unknown[] }).matches, []);
    assert.equal((result as { status: string }).status, "ok");
    assert.equal((result as { mode: string }).mode, "local_semantic_fallback");
    assert.ok(matches.some((match) => match.relativePath === "authService.ts"));
    assert.ok(matches.every((match) => match.relativePath !== ".env"));
    assert.ok(matches.every((match) => !match.preview.includes("do-not-read")));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("default built-in tool executors fetch web docs and open local browser previews", async () => {
  const requestedUrls: string[] = [];
  const openedUrls: string[] = [];
  const fetcher = async (url: string) => {
    requestedUrls.push(url);

    if (url.startsWith("https://www.bing.com/search")) {
      return new Response(
        '<html><body><li class="b_algo"><h2><a href="https://example.com/docs">Forge Docs result</a></h2><p>Search fixture result</p></li></body></html>',
        {
          headers: {
            "content-type": "text/html; charset=utf-8"
          },
          status: 200
        }
      );
    }

    return new Response(
      "<html><head><title>Docs</title></head><body><h1>Forge Docs</h1><script>ignored()</script><p>Readable content</p></body></html>",
      {
        headers: {
          "content-type": "text/html; charset=utf-8"
        },
        status: 200
      }
    );
  };
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors({
      fetcher,
      openExternal: (url) => {
        openedUrls.push(url);
      }
    })
  });
  const fetchUrlResult = await getBuiltInToolFromRegistry(registry, "fetchUrl").execute(
    { maxChars: 80, url: "https://example.com/docs" },
    {}
  );
  const fetchDocsResult = await getBuiltInToolFromRegistry(registry, "fetchDocs").execute(
    { topic: "Electron" },
    {}
  );
  const openPreviewResult = await getBuiltInToolFromRegistry(registry, "openBrowserPreview").execute(
    { url: "http://localhost:5173/" },
    {}
  );
  const webSearchResult = await getBuiltInToolFromRegistry(registry, "webSearch").execute(
    { query: "Forge Docs", limit: 1 },
    {}
  );
  const blockedPreviewResult = await getBuiltInToolFromRegistry(registry, "openBrowserPreview").execute(
    { url: "https://example.com/" },
    {}
  );

  assert.equal((fetchUrlResult as { title: string }).title, "Docs");
  assert.match((fetchUrlResult as { content: string }).content, /Forge Docs/u);
  assert.equal((fetchDocsResult as { source: string }).source, "official-docs");
  assert.equal(requestedUrls[1], "https://www.electronjs.org/docs/latest/");
  assert.deepEqual(openPreviewResult, {
    status: "ok",
    url: "http://localhost:5173/",
    opened: true
  });
  assert.deepEqual(openedUrls, ["http://localhost:5173/"]);
  assert.ok(requestedUrls.some((url) => url.startsWith("https://www.bing.com/search")));
  assert.match(
    (webSearchResult as { results: Array<{ title: string }> }).results[0]?.title ?? "",
    /Forge Docs result/u
  );
  assert.equal((blockedPreviewResult as { status: string }).status, "failed");
});

test("default built-in tool executors run local browser screenshot and console helpers", async () => {
  const browserRequests: Array<{ kind: string; url: string; width: number; height: number }> = [];
  const browserTools: BrowserPreviewTools = {
    takeScreenshot: async (request) => {
      browserRequests.push({
        kind: "screenshot",
        url: request.url,
        width: request.width,
        height: request.height
      });

      return {
        status: "ok",
        url: request.url,
        imagePath: "E:\\CodeHome\\Forge\\fake-screenshot.png",
        width: request.width,
        height: request.height,
        sizeBytes: 1234,
        dataUrlIncluded: false,
        dataUrlTruncated: false
      };
    },
    inspectPageConsole: async (request) => {
      browserRequests.push({
        kind: "console",
        url: request.url,
        width: request.width,
        height: request.height
      });

      return {
        status: "ok",
        url: request.url,
        messages: [
          {
            level: "error",
            message: "boom",
            lineNumber: 3,
            sourceId: "http://localhost:5173/main.js"
          }
        ],
        messageCount: 1,
        errorCount: 1,
        warningCount: 0,
        truncated: false
      };
    }
  };
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors({ browserTools })
  });

  const screenshotResult = await getBuiltInToolFromRegistry(registry, "takeScreenshot").execute(
    { url: "http://localhost:5173/", width: 1400, height: 900 },
    {}
  );
  const consoleResult = await getBuiltInToolFromRegistry(registry, "inspectPageConsole").execute(
    { url: "http://127.0.0.1:5173/", limit: 10 },
    {}
  );
  const blockedScreenshot = await getBuiltInToolFromRegistry(registry, "takeScreenshot").execute(
    { url: "https://example.com/" },
    {}
  );

  assert.equal((screenshotResult as { status: string }).status, "ok");
  assert.equal((consoleResult as { errorCount: number }).errorCount, 1);
  assert.deepEqual(browserRequests, [
    {
      kind: "screenshot",
      url: "http://localhost:5173/",
      width: 1400,
      height: 900
    },
    {
      kind: "console",
      url: "http://127.0.0.1:5173/",
      width: 1280,
      height: 800
    }
  ]);
  assert.equal((blockedScreenshot as { status: string }).status, "failed");
});

test("browser tools return structured unavailable results when no Electron provider is configured", async () => {
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors()
  });

  const screenshotResult = await getBuiltInToolFromRegistry(registry, "takeScreenshot").execute(
    { url: "http://localhost:5173/" },
    {}
  );
  const consoleResult = await getBuiltInToolFromRegistry(registry, "inspectPageConsole").execute(
    { url: "http://localhost:5173/" },
    {}
  );

  assert.equal((screenshotResult as { status: string }).status, "unavailable");
  assert.equal((consoleResult as { status: string }).status, "unavailable");
});

test("dependency install and targeted test executors build commands behind confirmation", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-command-executors-"));
  const commands: string[] = [];
  const runCommand = async (options: RunProjectCommandOptions) => {
    commands.push(options.command);

    return {
      command: options.command,
      cwd: options.cwd,
      exitCode: 0,
      stderr: "",
      stdout: "",
      timedOut: false
    };
  };

  try {
    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors({ runCommand })
    });
    const installTool = getBuiltInToolFromRegistry(registry, "installDependency");
    const targetedTestTool = getBuiltInToolFromRegistry(registry, "runTargetedTest");

    const blockedInstall = await installTool.execute(
      { packageName: "left-pad", dev: true },
      { projectRoot }
    );

    assert.equal((blockedInstall as { status: string }).status, "blocked");
    await installTool.execute(
      { packageName: "left-pad", dev: true },
      { projectRoot, confirmed: true }
    );
    await targetedTestTool.execute(
      { script: "test", target: "tests/example.test.ts" },
      { projectRoot, confirmed: true }
    );

    assert.deepEqual(commands, [
      "npm install --save-dev 'left-pad'",
      "npm run test -- 'tests/example.test.ts'"
    ]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("terminal run and stop executors stay behind confirmation", async () => {
  const commands: RunProjectCommandOptions[] = [];
  const cancelledRunIds: string[] = [];
  const runCommand = async (options: RunProjectCommandOptions) => {
    commands.push(options);

    return {
      command: options.command,
      cwd: options.cwd,
      exitCode: 0,
      stderr: "",
      stdout: "ok",
      timedOut: false
    };
  };
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors({
      cancelCommand: ({ runId }) => {
        cancelledRunIds.push(runId);

        return { ok: true, runId };
      },
      runCommand
    })
  });
  const runTool = getBuiltInToolFromRegistry(registry, "runCommand");
  const stopTool = getBuiltInToolFromRegistry(registry, "stopCommand");
  const projectRoot = "E:\\CodeHome\\Forge";

  const blockedRun = await runTool.execute(
    { command: "npm run build", runId: "run-1" },
    { projectRoot }
  );
  const confirmedRun = await runTool.execute(
    { command: "npm run build", runId: "run-1", timeoutMs: 30000 },
    { projectRoot, confirmed: true }
  );
  const blockedStop = await stopTool.execute({ runId: "run-1" }, {});
  const confirmedStop = await stopTool.execute({ runId: "run-1" }, { confirmed: true });

  assert.equal((blockedRun as { status: string }).status, "blocked");
  assert.deepEqual(commands.map((command) => command.command), ["npm run build"]);
  assert.equal(commands[0]?.runId, "run-1");
  assert.equal(commands[0]?.projectRoot, projectRoot);
  assert.equal(commands[0]?.timeoutMs, 30000);
  assert.equal((confirmedRun as { stdout: string }).stdout, "ok");
  assert.equal((blockedStop as { status: string }).status, "blocked");
  assert.deepEqual(confirmedStop, { ok: true, runId: "run-1" });
  assert.deepEqual(cancelledRunIds, ["run-1"]);
});

test("default built-in tool executors list running command snapshots", async () => {
  const runningCommand: RunningProjectCommand = {
    runId: "run-1",
    command: "npm run dev",
    cwd: "E:\\CodeHome\\Forge",
    projectRoot: "E:\\CodeHome\\Forge",
    startedAt: "2026-06-05T00:00:00.000Z",
    startedAtMs: 1780617600000,
    timeoutMs: 120000,
    runtime: "windows-native",
    shell: "powershell"
  };
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors({
      listRunningCommands: () => [runningCommand]
    })
  });

  const result = await getBuiltInToolFromRegistry(registry, "listRunningCommands").execute({}, {});

  assert.deepEqual(result, {
    status: "ok",
    commands: [runningCommand],
    count: 1
  });
});

test("default applyEdit executor writes only after registry confirmation", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-apply-edit-"));

  try {
    await writeFile(join(projectRoot, "index.ts"), "before\n", "utf8");

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const tool = getBuiltInToolFromRegistry(registry, "applyEdit");
    const blocked = await tool.execute(
      { relativePath: "index.ts", nextContent: "after\n" },
      { projectRoot }
    );
    const applied = await tool.execute(
      { relativePath: "index.ts", nextContent: "after\n" },
      { projectRoot, confirmed: true }
    );
    const readBack = await getBuiltInToolFromRegistry(registry, "readFile").execute(
      { relativePath: "index.ts" },
      { projectRoot }
    );

    assert.equal((blocked as { status: string }).status, "blocked");
    assert.equal((applied as { content: string }).content, "after\n");
    assert.equal((readBack as { content: string }).content, "after\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("default applyPatch executor applies unified diffs only after confirmation", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-apply-patch-"));

  try {
    await writeFile(join(projectRoot, "index.ts"), "export const answer = 42;\n", "utf8");

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const tool = getBuiltInToolFromRegistry(registry, "applyPatch");
    const patch = [
      "--- a/index.ts",
      "+++ b/index.ts",
      "@@ -1 +1 @@",
      "-export const answer = 42;",
      "+export const answer = 43;",
      ""
    ].join("\n");
    const blocked = await tool.execute({ patch }, { projectRoot });
    const applied = await tool.execute({ patch }, { projectRoot, confirmed: true });
    const readBack = await getBuiltInToolFromRegistry(registry, "readFile").execute(
      { relativePath: "index.ts" },
      { projectRoot }
    );

    assert.equal((blocked as { status: string }).status, "blocked");
    assert.equal((applied as { status: string }).status, "ok");
    assert.equal((readBack as { content: string }).content, "export const answer = 43;\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("default revertFile executor restores an explicit previousContent snapshot after confirmation", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-revert-file-"));

  try {
    await writeFile(join(projectRoot, "index.ts"), "after\n", "utf8");

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const tool = getBuiltInToolFromRegistry(registry, "revertFile");
    const blocked = await tool.execute(
      { relativePath: "index.ts", previousContent: "before\n" },
      { projectRoot }
    );
    const reverted = await tool.execute(
      { relativePath: "index.ts", previousContent: "before\n" },
      { projectRoot, confirmed: true }
    );

    assert.equal((blocked as { status: string }).status, "blocked");
    assert.equal((reverted as { content: string }).content, "before\n");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project memory tools read and write project-scoped memory with confirmation for writes", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-project-memory-"));

  try {
    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readTool = getBuiltInToolFromRegistry(registry, "readProjectMemory");
    const writeTool = getBuiltInToolFromRegistry(registry, "writeProjectMemory");
    const initial = await readTool.execute({}, { projectRoot });
    const blocked = await writeTool.execute(
      { id: "architecture", content: "Use Electron IPC for privileged tools.", tags: ["architecture"] },
      { projectRoot }
    );
    const written = await writeTool.execute(
      { id: "architecture", content: "Use Electron IPC for privileged tools.", tags: ["architecture"] },
      { projectRoot, confirmed: true }
    );
    const afterWrite = await readTool.execute({}, { projectRoot });

    assert.deepEqual((initial as { entries: unknown[] }).entries, []);
    assert.equal((blocked as { status: string }).status, "blocked");
    assert.equal((written as { status: string }).status, "ok");
    assert.deepEqual(
      (afterWrite as { entries: Array<{ id: string; content: string; tags: string[] }> }).entries.map(
        (entry) => ({
          content: entry.content,
          id: entry.id,
          tags: entry.tags
        })
      ),
      [
        {
          content: "Use Electron IPC for privileged tools.",
          id: "architecture",
          tags: ["architecture"]
        }
      ]
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
