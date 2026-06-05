import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { BrowserPreviewTools } from "../src/main/browserPreviewTools.js";
import { createDefaultBuiltInToolExecutors } from "../src/main/builtInTools/builtInToolExecutors.js";
import { runDevelopmentBuiltInToolQa } from "../src/main/builtInTools/builtInToolQaRunner.js";
import { createBuiltInToolRegistry } from "../src/main/builtInTools/builtInToolRegistry.js";

test("development built-in tool QA runner executes read-only scenarios against a sandbox project", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-qa-"));

  try {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "forge-tool-qa-fixture", scripts: { typecheck: "tsc --noEmit" } }),
      "utf8"
    );
    await writeFile(
      join(projectRoot, "src", "index.ts"),
      "export function hello(name: string): string {\n  return `hello ${name}`;\n}\n",
      "utf8"
    );

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors()
    });
    const result = await runDevelopmentBuiltInToolQa({
      registry,
      request: {
        includeMutationChecks: true,
        projectRoot,
        modelId: "mimo-v2.5-pro"
      }
    });

    assert.equal(result.kind, "development-built-in-tool-qa");
    assert.equal(result.projectRoot, projectRoot);
    assert.equal(result.modelId, "mimo-v2.5-pro");
    assert.equal(result.status, "passed");
    assert.equal(result.summary.failed, 0);
    assert.equal(result.summary.blocked, 0);
    assert.equal(result.summary.notImplemented, 0);
    assert.equal(result.summary.skipped, 2);
    assert.equal(result.summary.safety.total, 2);
    assert.equal(result.summary.safety.passed, 2);
    assert.equal(result.summary.safety.failed, 0);
    assert.equal(result.summary.safety.writeBeforeConfirmationFailures, 0);
    assert.equal(result.summary.safety.criticalConfirmationFailures, 0);
    assert.equal(result.summary.coverage.registeredTools, 70);
    assert.equal(result.summary.coverage.availableTools, 70);
    assert.equal(result.summary.coverage.notImplementedTools, 0);
    assert.ok(result.summary.coverage.p0Tools > 0);
    assert.ok(result.summary.coverage.p1Tools > 0);
    assert.ok(result.summary.coverage.p2Tools > 0);
    assert.ok(result.summary.coverage.scenarioTools >= 66);
    assert.ok(result.summary.coverage.attemptedScenarioTools >= 64);
    assert.ok(result.summary.coverage.succeededScenarioTools >= 64);
    assert.equal(result.summary.coverage.p0ScenarioTools, result.summary.coverage.p0Tools);
    assert.equal(result.summary.coverage.p1ScenarioTools, result.summary.coverage.p1Tools);
    assert.ok(result.summary.coverage.p2ScenarioTools >= 25);
    assert.equal(result.summary.coverage.p0SucceededScenarioTools, result.summary.coverage.p0Tools);
    assert.equal(result.summary.coverage.p1SucceededScenarioTools, result.summary.coverage.p1Tools);
    assert.ok(result.summary.coverage.p2SucceededScenarioTools >= 23);
    assert.ok(result.summary.total >= 76);
    assert.ok(result.summary.successRate >= 0.95);
    assert.equal(result.summary.quality.mvpPassed, true);
    assert.equal(result.summary.quality.toolCallSuccessRate.passed, true);
    assert.equal(result.summary.quality.p0ToolErrorRate.value, 0);
    assert.equal(result.summary.quality.p0ToolErrorRate.passed, true);
    assert.equal(result.summary.quality.writeBeforeConfirmationFailureRate.value, 0);
    assert.equal(result.summary.quality.criticalConfirmationFailureRate.value, 0);
    assert.ok(result.scenarios.some((scenario) => scenario.id === "dependency-graph"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "search-regex-fixture"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "search-diagnostics-fixture"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "parse-error-log"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "validation-plan"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "read-project-memory"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "search-memory"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "read-project-instructions"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "context-budget"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "summarize-context"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "semantic-search-fixture"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "running-commands"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "stop-missing-command"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "git-log"));
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "command-echo" && scenario.status === "succeeded"
      )
    );
    assert.ok(result.scenarios.some((scenario) => scenario.id === "read-file"));
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "browser-screenshot" && scenario.status === "skipped"
      )
    );
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "browser-console" && scenario.status === "skipped"
      )
    );
    assert.ok(result.scenarios.some((scenario) => scenario.id === "preview-diff"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "propose-edit"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "find-references-fixture"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "git-blame"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-create-file"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-create-scratch-file"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-apply-patch"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-format-file"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-copy-file"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-move-file"));
    assert.ok(
      result.scenarios.some(
        (scenario) =>
          scenario.id === "mutation-apply-edit-blocked-before-confirmation" &&
          scenario.status === "succeeded" &&
          scenario.safetyAssertion?.kind === "write_before_confirmation" &&
          scenario.safetyAssertion.passed &&
          /fileUnchanged/u.test(scenario.outputSummary ?? "")
      )
    );
    assert.ok(
      result.scenarios.some(
        (scenario) =>
          scenario.id === "mutation-delete-file-blocked-before-typed-confirmation" &&
          scenario.status === "succeeded" &&
          scenario.safetyAssertion?.kind === "critical_typed_confirmation" &&
          scenario.safetyAssertion.passed &&
          /expectedBlockedStatus/u.test(scenario.outputSummary ?? "")
      )
    );
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-apply-edit"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "mutation-revert-file"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "package-script-run"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "package-run-typecheck"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "package-run-lint"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "package-run-build"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "package-run-tests"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "package-run-targeted-test"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "memory-write-project-memory"));
    assert.ok(result.scenarios.some((scenario) => scenario.id === "memory-delete-project-memory"));
    assert.ok(
      result.scenarios.some(
        (scenario) =>
          scenario.id === "full-access-git-push-typed-blocked" &&
          scenario.status === "succeeded" &&
          /expectedBlockedStatus/u.test(scenario.outputSummary ?? "") &&
          /fullAccess/u.test(scenario.outputSummary ?? "")
      )
    );
    assert.ok(
      result.scenarios.some(
        (scenario) =>
          scenario.id === "full-access-install-dependency-blocked" &&
          scenario.status === "succeeded"
      )
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("development built-in tool QA runner can execute browser scenarios with a preview URL", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-tool-qa-browser-"));
  const browserCalls: string[] = [];
  const openedUrls: string[] = [];
  const requestedUrls: string[] = [];
  const fetcher = async (url: string) => {
    requestedUrls.push(url);

    if (url.startsWith("https://www.bing.com/search")) {
      return new Response(
        '<html><body><li class="b_algo"><h2><a href="http://localhost:5173/">Forge Browser QA fixture</a></h2><p>Local web search fixture.</p></li></body></html>',
        {
          headers: { "content-type": "text/html; charset=utf-8" },
          status: 200
        }
      );
    }

    return new Response(
      "<html><head><title>Forge Browser QA</title></head><body><h1>Forge Browser QA fixture</h1></body></html>",
      {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 200
      }
    );
  };
  const browserTools: BrowserPreviewTools = {
    takeScreenshot: async (request) => {
      browserCalls.push(`screenshot:${request.url}`);

      return {
        status: "ok",
        url: request.url,
        imagePath: "E:\\CodeHome\\Forge\\qa-browser.png",
        width: request.width,
        height: request.height,
        sizeBytes: 100,
        dataUrlIncluded: false,
        dataUrlTruncated: false
      };
    },
    inspectPageConsole: async (request) => {
      browserCalls.push(`console:${request.url}`);

      return {
        status: "ok",
        url: request.url,
        messages: [],
        messageCount: 0,
        errorCount: 0,
        warningCount: 0,
        truncated: false
      };
    }
  };

  try {
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(join(projectRoot, "src", "index.ts"), "export const qa = true;\n", "utf8");

    const registry = createBuiltInToolRegistry({
      executors: createDefaultBuiltInToolExecutors({
        browserTools,
        fetcher,
        openExternal: (url) => {
          openedUrls.push(url);
        }
      })
    });
    const result = await runDevelopmentBuiltInToolQa({
      registry,
      request: {
        browserPreviewUrl: "http://localhost:5173/",
        includeWebChecks: true,
        includeMutationChecks: false,
        projectRoot,
        modelId: "mimo-v2.5-pro"
      }
    });

    assert.equal(result.status, "passed");
    assert.equal(result.summary.failed, 0);
    assert.equal(result.summary.skipped, 0);
    assert.equal(result.summary.quality.mvpPassed, false);
    assert.equal(result.summary.quality.toolCallSuccessRate.value, 1);
    assert.equal(result.summary.quality.p0ToolErrorRate.value, 0);
    assert.equal(result.summary.quality.writeBeforeConfirmationFailureRate.value, null);
    assert.equal(result.summary.quality.criticalConfirmationFailureRate.value, null);
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "browser-screenshot" && scenario.status === "succeeded"
      )
    );
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "browser-console" && scenario.status === "succeeded"
      )
    );
    assert.ok(result.scenarios.some((scenario) => scenario.id === "web-fetch-url" && scenario.status === "succeeded"));
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "web-fetch-docs-explicit-url" && scenario.status === "succeeded"
      )
    );
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "web-open-browser-preview" && scenario.status === "succeeded"
      )
    );
    assert.ok(
      result.scenarios.some(
        (scenario) => scenario.id === "web-search-local-fixture" && scenario.status === "succeeded"
      )
    );
    assert.deepEqual(browserCalls, [
      "screenshot:http://localhost:5173/",
      "console:http://localhost:5173/"
    ]);
    assert.deepEqual(openedUrls, ["http://localhost:5173/"]);
    assert.ok(requestedUrls.some((url) => url.startsWith("https://www.bing.com/search")));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("development built-in tool QA runner skips cleanly when the sandbox project is missing", async () => {
  const missingRoot = join(tmpdir(), `forge-missing-tool-qa-${Date.now()}`);
  const registry = createBuiltInToolRegistry({
    executors: createDefaultBuiltInToolExecutors()
  });
  const result = await runDevelopmentBuiltInToolQa({
    registry,
    request: {
      projectRoot: missingRoot,
      modelId: "mimo-v2.5-pro"
    }
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.projectRoot, missingRoot);
  assert.equal(result.summary.total, 0);
  assert.match(result.skippedReason ?? "", /does not exist/u);
});
