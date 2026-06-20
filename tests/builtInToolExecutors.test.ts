import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("dependency graph reads source files up to its analysis budget", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-dependency-graph-budget-"));

  try {
    await writeFile(join(projectRoot, "lib.ts"), "export const answer = 42;\n", "utf8");
    await writeFile(
      join(projectRoot, "index.ts"),
      `import { answer } from "./lib";\n${"// filler line\n".repeat(20_000)}console.log(answer);\n`,
      "utf8"
    );

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const dependencyGraph = await getBuiltInToolFromRegistry(registry, "getDependencyGraph").execute(
      { limit: 20 },
      { projectRoot }
    );

    assert.ok(
      (dependencyGraph as { edges: Array<{ from: string; to?: string }> }).edges.some(
        (edge) => edge.from === "index.ts" && edge.to === "lib.ts"
      )
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
  const cachedFetchDocsResult = await getBuiltInToolFromRegistry(registry, "fetchDocs").execute(
    { topic: "Electron" },
    {}
  );
  const refreshedFetchDocsResult = await getBuiltInToolFromRegistry(registry, "fetchDocs").execute(
    { refresh: true, topic: "Electron" },
    {}
  );
  const nextDocsResult = await getBuiltInToolFromRegistry(registry, "fetchDocs").execute(
    { target: "Next.js app router" },
    {}
  );
  const springDocsResult = await getBuiltInToolFromRegistry(registry, "fetchDocs").execute(
    { topic: "Spring Boot REST" },
    {}
  );
  const openAiDocsResult = await getBuiltInToolFromRegistry(registry, "fetchDocs").execute(
    { topic: "OpenAI Responses API" },
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
  assert.equal((nextDocsResult as { source: string }).source, "official-docs");
  assert.equal((springDocsResult as { source: string }).source, "official-docs");
  assert.equal((openAiDocsResult as { source: string }).source, "official-docs");
  assert.equal(
    (fetchDocsResult as { officialDocs: { id: string } }).officialDocs.id,
    "electron"
  );
  assert.equal(
    (fetchDocsResult as { officialDocs: { label: string } }).officialDocs.label,
    "Electron"
  );
  assert.equal(
    (fetchDocsResult as { officialDocs: { host: string } }).officialDocs.host,
    "electronjs.org"
  );
  assert.match(
    (fetchDocsResult as { docsCatalogVersion: string }).docsCatalogVersion,
    /^\d{4}-\d{2}-\d{2}$/u
  );
  assert.equal((fetchDocsResult as { cache: { status: string } }).cache.status, "miss");
  assert.equal((cachedFetchDocsResult as { cache: { status: string } }).cache.status, "hit");
  assert.equal((refreshedFetchDocsResult as { cache: { status: string } }).cache.status, "refresh");
  assert.equal((fetchDocsResult as { sourceType: string }).sourceType, "official-docs");
  assert.equal((fetchDocsResult as { trustedSource: boolean }).trustedSource, true);
  assert.equal((nextDocsResult as { sourceLabel: string }).sourceLabel, "Next.js");
  assert.equal(
    (fetchDocsResult as { citations: Array<{ sourceLabel: string; sourceType: string; url: string }> }).citations[0]?.sourceLabel,
    "Electron"
  );
  assert.equal(
    (fetchDocsResult as { citations: Array<{ sourceLabel: string; sourceType: string; url: string }> }).citations[0]?.sourceType,
    "official-docs"
  );
  assert.equal(
    (fetchDocsResult as { citations: Array<{ sourceLabel: string; sourceType: string; url: string }> }).citations[0]?.url,
    "https://www.electronjs.org/docs/latest/"
  );
  assert.match(
    (fetchDocsResult as { citationSummary: string }).citationSummary,
    /Official docs: Electron/u
  );
  assert.equal(requestedUrls[1], "https://www.electronjs.org/docs/latest/");
  assert.equal(
    requestedUrls.filter((url) => url === "https://www.electronjs.org/docs/latest/").length,
    2
  );
  assert.ok(requestedUrls.includes("https://nextjs.org/docs"));
  assert.ok(requestedUrls.includes("https://docs.spring.io/spring-boot/index.html"));
  assert.ok(requestedUrls.includes("https://developers.openai.com/api/docs"));
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
  assert.equal(
    (webSearchResult as { results: Array<{ sourceType: string }> }).results[0]?.sourceType,
    "web"
  );
  assert.equal((blockedPreviewResult as { status: string }).status, "failed");
});

test("fetchDocs cache handles explicit URLs, disabled cache, failed fetches and bounded entries", async () => {
  const requestedUrls: string[] = [];
  const fetcher = async (url: string) => {
    requestedUrls.push(url);

    return new Response(
      `<html><head><title>${url}</title></head><body><p>Docs fixture for ${url}</p></body></html>`,
      {
        headers: {
          "content-type": "text/html; charset=utf-8"
        },
        status: url.includes("/fail") ? 500 : 200
      }
    );
  };
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors({ fetcher })
  });
  const fetchDocs = getBuiltInToolFromRegistry(registry, "fetchDocs");

  const explicitMiss = await fetchDocs.execute(
    { maxChars: 500, url: "https://react.dev/reference/react" },
    {}
  );
  const explicitHit = await fetchDocs.execute(
    { maxChars: 500, url: "https://react.dev/reference/react" },
    {}
  );
  const disabledCacheFirst = await fetchDocs.execute(
    { cache: false, url: "https://react.dev/learn" },
    {}
  );
  const disabledCacheSecond = await fetchDocs.execute(
    { cache: false, url: "https://react.dev/learn" },
    {}
  );
  const zeroTtlFirst = await fetchDocs.execute(
    { cacheTtlMs: 0, url: "https://react.dev/blog" },
    {}
  );
  const zeroTtlSecond = await fetchDocs.execute(
    { cacheTtlMs: 0, url: "https://react.dev/blog" },
    {}
  );
  const failedFetchFirst = await fetchDocs.execute(
    { url: "https://react.dev/fail" },
    {}
  );
  const failedFetchSecond = await fetchDocs.execute(
    { url: "https://react.dev/fail" },
    {}
  );

  for (let index = 0; index < 70; index += 1) {
    await fetchDocs.execute(
      { url: `https://react.dev/reference/cache-${index}` },
      {}
    );
  }

  const evictedExplicit = await fetchDocs.execute(
    { maxChars: 500, url: "https://react.dev/reference/react" },
    {}
  );

  assert.equal((explicitMiss as { cache: { status: string } }).cache.status, "miss");
  assert.equal((explicitHit as { cache: { status: string } }).cache.status, "hit");
  assert.equal((disabledCacheFirst as { cache: { status: string } }).cache.status, "disabled");
  assert.equal((disabledCacheSecond as { cache: { status: string } }).cache.status, "disabled");
  assert.equal((zeroTtlFirst as { cache: { status: string } }).cache.status, "miss");
  assert.equal((zeroTtlSecond as { cache: { status: string } }).cache.status, "miss");
  assert.equal((failedFetchFirst as { status: string }).status, "http_error");
  assert.equal((failedFetchSecond as { status: string }).status, "http_error");
  assert.equal((failedFetchFirst as { cache: { cachedAt: string | null } }).cache.cachedAt, null);
  assert.equal((failedFetchSecond as { cache: { cachedAt: string | null } }).cache.cachedAt, null);
  assert.equal((evictedExplicit as { cache: { status: string } }).cache.status, "miss");
  assert.equal(
    requestedUrls.filter((url) => url === "https://react.dev/reference/react").length,
    2
  );
  assert.equal(
    requestedUrls.filter((url) => url === "https://react.dev/learn").length,
    2
  );
  assert.equal(
    requestedUrls.filter((url) => url === "https://react.dev/blog").length,
    2
  );
  assert.equal(
    requestedUrls.filter((url) => url === "https://react.dev/fail").length,
    2
  );
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

test("project memory tools silently maintain project MEMORY.md entries", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-project-memory-"));

  try {
    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readTool = getBuiltInToolFromRegistry(registry, "readProjectMemory");
    const writeTool = getBuiltInToolFromRegistry(registry, "writeProjectMemory");
    const initial = await readTool.execute({}, { projectRoot });
    const written = await writeTool.execute(
      { id: "architecture", content: "Use Electron IPC for privileged tools.", tags: ["architecture"] },
      { projectRoot }
    );
    const afterWrite = await readTool.execute({}, { projectRoot });
    const memoryMarkdown = await readFile(join(projectRoot, "MEMORY.md"), "utf8");

    assert.deepEqual((initial as { entries: unknown[] }).entries, []);
    assert.equal((initial as { relativePath: string }).relativePath, "MEMORY.md");
    assert.equal((written as { status: string }).status, "ok");
    assert.equal((written as { relativePath: string }).relativePath, "MEMORY.md");
    assert.match(memoryMarkdown, /<!-- forge-memory:managed:start -->/u);
    assert.match(memoryMarkdown, /Use Electron IPC for privileged tools\./u);
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

test("project memory write redacts sensitive values before persisting MEMORY.md", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-project-memory-redact-"));

  try {
    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readTool = getBuiltInToolFromRegistry(registry, "readProjectMemory");
    const writeTool = getBuiltInToolFromRegistry(registry, "writeProjectMemory");

    const written = await writeTool.execute(
      {
        id: "secret-note",
        content:
          "OpenAI api_key=sk-test-secret-value, token: \"ghp_secret_value\", and password: hunter2 should never be stored.",
        tags: ["security"]
      },
      { projectRoot }
    );
    const memoryMarkdown = await readFile(join(projectRoot, "MEMORY.md"), "utf8");
    const afterWrite = await readTool.execute({}, { projectRoot });
    const [entry] = (afterWrite as { entries: Array<{ content: string }> }).entries;

    assert.equal((written as { status: string }).status, "ok");
    assert.ok(entry);
    assert.match(entry.content, /api_key=\[redacted\]/u);
    assert.match(entry.content, /token: "\[redacted\]"/u);
    assert.match(entry.content, /password: \[redacted\]/u);
    assert.doesNotMatch(memoryMarkdown, /sk-test-secret-value/u);
    assert.doesNotMatch(memoryMarkdown, /ghp_secret_value/u);
    assert.doesNotMatch(memoryMarkdown, /hunter2/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project memory write merges similar memories instead of appending duplicates", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-project-memory-merge-"));

  try {
    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readTool = getBuiltInToolFromRegistry(registry, "readProjectMemory");
    const writeTool = getBuiltInToolFromRegistry(registry, "writeProjectMemory");

    await writeTool.execute(
      { id: "ipc-boundary", content: "Use Electron IPC for privileged tools.", tags: ["architecture"] },
      { projectRoot }
    );
    const updated = await writeTool.execute(
      {
        id: "ipc-boundary-new",
        content: "Always use Electron IPC for privileged tools.",
        tags: ["auto-memory", "ipc"]
      },
      { projectRoot }
    );
    const afterWrite = await readTool.execute({}, { projectRoot });
    const memoryMarkdown = await readFile(join(projectRoot, "MEMORY.md"), "utf8");
    const entries = (afterWrite as { entries: Array<{ id: string; content: string; tags: string[] }> }).entries;

    assert.equal((updated as { entry: { id: string } }).entry.id, "ipc-boundary");
    assert.equal(entries.length, 1);
    assert.deepEqual(
      entries.map((entry) => ({
        content: entry.content,
        id: entry.id,
        tags: entry.tags
      })),
      [
        {
          content: "Always use Electron IPC for privileged tools.",
          id: "ipc-boundary",
          tags: ["architecture", "auto-memory", "ipc"]
        }
      ]
    );
    assert.equal(memoryMarkdown.match(/forge-memory-entry/gu)?.length, 1);
    assert.doesNotMatch(memoryMarkdown, /ipc-boundary-new/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project memory write keeps managed MEMORY.md concise by pruning oldest automatic entries", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-project-memory-trim-"));

  try {
    const entryLines = [
      '- <!-- forge-memory-entry id="explicit-rule" createdAt="2026-01-01T00:00:00.000Z" updatedAt="2026-01-01T00:00:00.000Z" tags="explicit" --> Preserve this explicit user rule.',
      ...Array.from({ length: 40 }, (_value, index) => {
        const minute = String(index).padStart(2, "0");

        return `- <!-- forge-memory-entry id="auto-${index}" createdAt="2026-01-01T00:${minute}:00.000Z" updatedAt="2026-01-01T00:${minute}:00.000Z" tags="auto-memory" --> Automatic memory ${index} stores unique-project-fact-${index}.`;
      })
    ];

    await writeFile(
      join(projectRoot, "MEMORY.md"),
      [
        "# MEMORY.md",
        "",
        "<!-- forge-memory:managed:start -->",
        "## Forge Managed Memories",
        "",
        "Forge updates this section automatically. Edit or delete entries when they are wrong.",
        "",
        ...entryLines,
        "",
        "<!-- forge-memory:managed:end -->",
        ""
      ].join("\n"),
      "utf8"
    );

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readTool = getBuiltInToolFromRegistry(registry, "readProjectMemory");
    const writeTool = getBuiltInToolFromRegistry(registry, "writeProjectMemory");

    const written = await writeTool.execute(
      {
        id: "auto-new",
        content: "Current release-flow evidence prefers pull request checks.",
        tags: ["auto-memory"]
      },
      { projectRoot }
    );

    const afterWrite = await readTool.execute({}, { projectRoot });
    const memoryMarkdown = await readFile(join(projectRoot, "MEMORY.md"), "utf8");
    const entryIds = (afterWrite as { entries: Array<{ id: string }> }).entries.map((entry) => entry.id);

    assert.equal(entryIds.length, 40);
    assert.ok(entryIds.includes("explicit-rule"));
    assert.ok(entryIds.includes("auto-new"));
    assert.ok(!entryIds.includes("auto-0"));
    assert.ok(!entryIds.includes("auto-1"));
    assert.equal(memoryMarkdown.match(/forge-memory-entry/gu)?.length, 40);
    assert.deepEqual((written as { prunedEntryIds: string[] }).prunedEntryIds, ["auto-0", "auto-1"]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project memory reads user-authored MEMORY.md notes without moving them into the managed block", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-project-memory-manual-"));

  try {
    await writeFile(
      join(projectRoot, "MEMORY.md"),
      [
        "# MEMORY.md",
        "",
        "- Forge agents should keep PowerShell commands Windows-safe.",
        "",
        "<!-- forge-memory:managed:start -->",
        "## Forge Managed Memories",
        "",
        '- <!-- forge-memory-entry id="ipc-boundary" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="architecture" --> Forge renderer must access fs through main-process IPC.',
        "",
        "<!-- forge-memory:managed:end -->",
        ""
      ].join("\n"),
      "utf8"
    );

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readTool = getBuiltInToolFromRegistry(registry, "readProjectMemory");
    const writeTool = getBuiltInToolFromRegistry(registry, "writeProjectMemory");
    const initial = await readTool.execute({}, { projectRoot });

    await writeTool.execute(
      { id: "release-flow", content: "Use PR checks as release-flow evidence.", tags: ["auto-memory"] },
      { projectRoot }
    );

    const afterWriteMarkdown = await readFile(join(projectRoot, "MEMORY.md"), "utf8");
    const afterWrite = await readTool.execute({}, { projectRoot });

    assert.deepEqual(
      (initial as { entries: Array<{ content: string; tags: string[] }> }).entries.map((entry) => ({
        content: entry.content,
        tags: entry.tags
      })),
      [
        {
          content: "Forge agents should keep PowerShell commands Windows-safe.",
          tags: ["manual"]
        },
        {
          content: "Forge renderer must access fs through main-process IPC.",
          tags: ["architecture"]
        }
      ]
    );
    assert.match(afterWriteMarkdown, /- Forge agents should keep PowerShell commands Windows-safe\./u);
    assert.equal(afterWriteMarkdown.match(/forge-memory-entry/gu)?.length, 2);
    assert.ok(
      (afterWrite as { entries: Array<{ content: string }> }).entries.some(
        (entry) => entry.content === "Forge agents should keep PowerShell commands Windows-safe."
      )
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("project memory reads legacy JSON entries before migrating writes to MEMORY.md", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-project-memory-legacy-"));

  try {
    await mkdir(join(projectRoot, ".forge"), { recursive: true });
    await writeFile(
      join(projectRoot, ".forge", "project-memory.json"),
      `${JSON.stringify(
        {
          entries: [
            {
              id: "legacy",
              content: "Legacy project memory survives migration.",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              tags: ["legacy"]
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const readTool = getBuiltInToolFromRegistry(registry, "readProjectMemory");
    const writeTool = getBuiltInToolFromRegistry(registry, "writeProjectMemory");
    const initial = await readTool.execute({}, { projectRoot });

    await writeTool.execute(
      { id: "current", content: "Current project memory uses MEMORY.md.", tags: ["current"] },
      { projectRoot }
    );

    const afterWrite = await readTool.execute({}, { projectRoot });
    const memoryMarkdown = await readFile(join(projectRoot, "MEMORY.md"), "utf8");

    assert.equal((initial as { legacyRelativePath: string }).legacyRelativePath, ".forge/project-memory.json");
    assert.deepEqual(
      (afterWrite as { entries: Array<{ id: string }> }).entries.map((entry) => entry.id),
      ["legacy", "current"]
    );
    assert.match(memoryMarkdown, /Legacy project memory survives migration\./u);
    assert.match(memoryMarkdown, /Current project memory uses MEMORY\.md\./u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
