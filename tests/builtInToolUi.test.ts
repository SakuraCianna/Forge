import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("built-in tools UI exposes category grouping, risk, confirmation, availability and recent status", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");

  assert.match(source, /groupBuiltInToolsByCategory/u);
  assert.match(source, /builtInToolCategories\.map/u);
  assert.match(source, /group\.category\.label/u);
  assert.match(source, /tool\.displayName \?\? tool\.name/u);
  assert.match(source, /tool\.description/u);
  assert.match(source, /copy\.category/u);
  assert.match(source, /copy\.risk/u);
  assert.match(source, /tool\.riskLevel/u);
  assert.match(source, /tool\.requiresConfirmation/u);
  assert.match(source, /copy\.availability/u);
  assert.match(source, /tool\.availability/u);
  assert.match(source, /copy\.recentStatus/u);
  assert.match(source, /latestLog\.status/u);
  assert.match(source, /latestLog\.errorMessage/u);
});

test("built-in tools QA UI exposes safety assertion summary", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");

  assert.match(source, /summary\.safety\.total/u);
  assert.match(source, /summary\.safety\.passed/u);
  assert.match(source, /writeBeforeConfirmationFailures/u);
  assert.match(source, /criticalConfirmationFailures/u);
  assert.match(source, /qaWriteBeforeConfirmationFailures/u);
  assert.match(source, /qaCriticalConfirmationFailures/u);
});

test("built-in tools QA UI exposes catalog and priority coverage summary", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");

  assert.match(source, /summary\.coverage\.registeredTools/u);
  assert.match(source, /summary\.coverage\.availableTools/u);
  assert.match(source, /summary\.coverage\.scenarioTools/u);
  assert.match(source, /summary\.coverage\.attemptedScenarioTools/u);
  assert.match(source, /summary\.coverage\.succeededScenarioTools/u);
  assert.match(source, /summary\.coverage\.p0SucceededScenarioTools/u);
  assert.match(source, /summary\.coverage\.p1SucceededScenarioTools/u);
  assert.match(source, /qaRegisteredTools/u);
  assert.match(source, /qaAvailableTools/u);
  assert.match(source, /qaScenarioTools/u);
  assert.match(source, /qaAttemptedScenarioTools/u);
  assert.match(source, /qaSucceededScenarioTools/u);
  assert.match(source, /qaP0P1ScenarioTools/u);
});

test("built-in tools QA UI exposes MVP quality gate summary", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");

  assert.match(source, /summary\.quality\.mvpPassed/u);
  assert.match(source, /summary\.quality\.toolCallSuccessRate/u);
  assert.match(source, /summary\.quality\.p0ToolErrorRate/u);
  assert.match(source, /summary\.quality\.writeBeforeConfirmationFailureRate/u);
  assert.match(source, /summary\.quality\.criticalConfirmationFailureRate/u);
  assert.match(source, /qaMvpGate/u);
  assert.match(source, /qaToolCallSuccessRate/u);
  assert.match(source, /qaP0ToolErrorRate/u);
  assert.match(source, /qaWriteBeforeConfirmationFailureRate/u);
  assert.match(source, /qaCriticalConfirmationFailureRate/u);
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
