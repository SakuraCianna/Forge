import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("extensions panel does not expose development built-in tool QA surfaces", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");
  const appSource = await readFile("src/renderer/src/App.tsx", "utf8");

  assert.doesNotMatch(source, /renderBuiltInToolsSection/u);
  assert.doesNotMatch(source, /groupBuiltInToolsByCategory/u);
  assert.doesNotMatch(source, /builtInToolCategories/u);
  assert.doesNotMatch(source, /agentQualityMetricDefinitions/u);
  assert.doesNotMatch(source, /qualityMetricsReview/u);
  assert.doesNotMatch(source, /runDevelopmentQa/u);
  assert.doesNotMatch(source, /Built-in Tools 内置工具/u);
  assert.doesNotMatch(source, /运行开发 QA/u);

  assert.doesNotMatch(appSource, /developmentQaResult/u);
  assert.doesNotMatch(appSource, /developmentQaRunning/u);
  assert.doesNotMatch(appSource, /runDevelopmentBuiltInToolQa/u);
  assert.doesNotMatch(appSource, /onRunDevelopmentQa/u);

  assert.match(source, /selectedManifest/u);
  assert.match(source, /onCreateExtension/u);
  assert.match(source, /ExtensionManifestDialog/u);
});

test("agent built-in tool confirmation UI exposes critical second-confirmation context", async () => {
  const queueSource = await readFile(
    "src/renderer/src/components/AgentConfirmationQueue.tsx",
    "utf8"
  );
  const appSource = await readFile("src/renderer/src/App.tsx", "utf8");
  const queueStateSource = await readFile(
    "src/renderer/src/agent/agentConfirmationQueue.ts",
    "utf8"
  );

  assert.match(queueStateSource, /createBuiltInToolConfirmationView/u);
  assert.match(queueStateSource, /builtInToolConfirmation/u);
  assert.match(queueSource, /builtInToolTargetLabel/u);
  assert.match(queueSource, /consequenceLabel/u);
  assert.match(queueSource, /reversibleLabel/u);
  assert.match(queueSource, /typedConfirmationLabel/u);
  assert.match(queueSource, /typeConfirmationKeyword/u);
  assert.match(appSource, /二次确认: \$\{view\.toolName\}/u);
  assert.match(appSource, /风险等级: \$\{view\.riskLevel\}/u);
  assert.match(appSource, /操作后果: \$\{view\.consequence\}/u);
  assert.match(appSource, /是否可撤销: \$\{reversibleLabel\}/u);
});
