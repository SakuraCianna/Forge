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

test("extensions panel keeps the service list scrollable when many extensions are installed", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");

  assert.match(
    source,
    /<aside className="flex min-h-0 flex-col border-r border-\[#ececf1\] bg-\[#fbfbfc\] p-4">/u
  );
  assert.match(
    source,
    /className="min-h-0 flex-1 scroll-pb-8 space-y-2 overflow-auto pb-8 pr-1"/u
  );
});

test("extensions panel shows a detailed per-extension capability summary", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");

  assert.match(source, /selectedExtensionDetail/u);
  assert.match(source, /createExtensionDetail/u);
  assert.match(source, /当前可执行/u);
  assert.match(source, /网页登录授权或连接器托管凭据/u);
  assert.match(source, /权限策略和二次确认/u);
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
