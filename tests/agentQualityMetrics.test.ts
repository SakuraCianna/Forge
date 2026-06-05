import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgentQualityMetricSnapshot,
  getAgentQualityMetricValue,
  isAgentQualityObservation,
  type AgentQualityObservation
} from "../src/shared/agentQualityMetrics.js";

const createdAt = "2026-06-04T01:00:00.000Z";
type ToolCallObservation = Extract<AgentQualityObservation, { kind: "tool_call" }>;

test("agent quality metrics calculate MVP and higher threshold status", () => {
  const observations: AgentQualityObservation[] = [
    ...Array.from({ length: 96 }, () => toolCall("readFile", "succeeded")),
    ...Array.from({ length: 4 }, () => toolCall("readFile", "failed")),
    ...Array.from({ length: 10 }, () => ({
      kind: "task_outcome" as const,
      createdAt,
      complexity: "simple" as const,
      completedInFirstAttempt: true
    })),
    {
      kind: "validation_run",
      createdAt,
      validation: "typecheck",
      afterModification: true,
      passed: true
    },
    {
      kind: "validation_run",
      createdAt,
      validation: "typecheck",
      afterModification: true,
      passed: false
    }
  ];
  const snapshot = createAgentQualityMetricSnapshot(observations, createdAt);
  const toolSuccess = getAgentQualityMetricValue(snapshot, "toolCallSuccessRate");
  const simpleCompletion = getAgentQualityMetricValue(
    snapshot,
    "simpleTaskFirstPassCompletionRate"
  );
  const typecheck = getAgentQualityMetricValue(snapshot, "postModificationTypecheckPassRate");

  assert.equal(toolSuccess.value, 0.96);
  assert.equal(toolSuccess.mvpPassed, true);
  assert.equal(toolSuccess.usablePassed, false);
  assert.equal(simpleCompletion.value, 1);
  assert.equal(simpleCompletion.excellentPassed, true);
  assert.equal(typecheck.value, 0.5);
  assert.equal(typecheck.mvpPassed, false);
});

test("safety metrics detect high risk and write-before-confirmation misfires", () => {
  const snapshot = createAgentQualityMetricSnapshot([
    toolCall("applyEdit", "blocked", {
      confirmedBeforeExecution: false,
      priority: "P0",
      requiresConfirmation: true,
      riskLevel: "high",
      sideEffect: "write"
    }),
    toolCall("applyEdit", "succeeded", {
      confirmedBeforeExecution: false,
      priority: "P0",
      requiresConfirmation: true,
      riskLevel: "high",
      sideEffect: "write"
    })
  ]);

  assert.equal(getAgentQualityMetricValue(snapshot, "highRiskMisfireRate").value, 0.5);
  assert.equal(getAgentQualityMetricValue(snapshot, "writeBeforeConfirmationRate").value, 0.5);
  assert.equal(getAgentQualityMetricValue(snapshot, "highRiskMisfireRate").mvpPassed, false);
  assert.equal(getAgentQualityMetricValue(snapshot, "writeBeforeConfirmationRate").mvpPassed, false);
});

test("agent quality observation validator rejects malformed metric records", () => {
  assert.equal(
    isAgentQualityObservation({
      kind: "validation_run",
      createdAt,
      validation: "build",
      afterModification: true,
      passed: true
    }),
    true
  );
  assert.equal(
    isAgentQualityObservation({
      kind: "validation_run",
      createdAt,
      validation: "deploy",
      afterModification: true,
      passed: true
    }),
    false
  );
  assert.equal(
    isAgentQualityObservation({
      kind: "tool_call",
      createdAt,
      toolName: "readFile",
      category: "file",
      riskLevel: "low",
      priority: "P0",
      status: "succeeded",
      requiresConfirmation: false,
      confirmedBeforeExecution: false,
      sideEffect: "unknown"
    }),
    false
  );
});

function toolCall(
  toolName: string,
  status: ToolCallObservation["status"],
  patch: Partial<ToolCallObservation> = {}
): ToolCallObservation {
  return {
    kind: "tool_call",
    createdAt,
    toolName,
    category: "file",
    riskLevel: "low",
    priority: "P0",
    status,
    requiresConfirmation: false,
    confirmedBeforeExecution: false,
    sideEffect: "none",
    ...patch
  };
}
