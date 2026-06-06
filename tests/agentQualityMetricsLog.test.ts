import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentQualityMetricsLogStore } from "../src/main/agentQualityMetricsLog.js";
import {
  agentQualityMetricDefinitions,
  getAgentQualityMetricValue,
  type AgentQualityMetricValue,
  type AgentQualityObservation
} from "../src/shared/agentQualityMetrics.js";

test("agent quality metrics log stores observations and creates snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-agent-metrics-"));

  try {
    const store = createAgentQualityMetricsLogStore({
      directory,
      createId: () => "metric-1"
    });
    const record = await store.append({
      kind: "tool_call",
      createdAt: "2026-06-04T01:00:00.000Z",
      toolName: "readFile",
      category: "file",
      riskLevel: "low",
      priority: "P0",
      status: "succeeded",
      requiresConfirmation: false,
      confirmedBeforeExecution: false,
      sideEffect: "none"
    });
    const logs = await store.list(10);
    const snapshot = await store.snapshot();

    assert.equal(record.id, "metric-1");
    assert.equal(logs.length, 1);
    assert.equal(snapshot.metrics.find((metric) => metric.id === "toolCallSuccessRate")?.value, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("agent quality metrics snapshots expose review fields for every metric", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-agent-metrics-review-"));

  try {
    const store = createAgentQualityMetricsLogStore({
      directory,
      createId: createIncrementingMetricId()
    });

    for (const observation of createReviewableMetricObservations()) {
      await store.append(observation);
    }

    const snapshot = await store.snapshot();

    assert.deepEqual(
      snapshot.metrics.map((metric) => metric.id),
      agentQualityMetricDefinitions.map((definition) => definition.id)
    );

    for (const metric of snapshot.metrics) {
      assertMetricHasReviewFields(metric);
    }

    assert.deepEqual(
      pickReviewFields(getAgentQualityMetricValue(snapshot, "simpleTaskFirstPassCompletionRate")),
      {
        numerator: 1,
        denominator: 1,
        value: 1,
        mvpPassed: true,
        usablePassed: true,
        excellentPassed: true
      }
    );
    assert.deepEqual(
      pickReviewFields(getAgentQualityMetricValue(snapshot, "failureRecoveryRate")),
      {
        numerator: 1,
        denominator: 1,
        value: 1,
        mvpPassed: true,
        usablePassed: true,
        excellentPassed: true
      }
    );
    assert.deepEqual(
      pickReviewFields(getAgentQualityMetricValue(snapshot, "mediumTaskFirstPassCompletionRate")),
      {
        numerator: 0,
        denominator: 0,
        value: null,
        mvpPassed: null,
        usablePassed: null,
        excellentPassed: null
      }
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function createIncrementingMetricId(): () => string {
  let index = 0;

  return () => {
    index += 1;
    return `metric-${index}`;
  };
}

function createReviewableMetricObservations(): AgentQualityObservation[] {
  return [
    {
      kind: "task_outcome",
      createdAt: "2026-06-06T04:00:00.000Z",
      complexity: "simple",
      completedInFirstAttempt: true
    },
    {
      kind: "validation_run",
      createdAt: "2026-06-06T04:00:00.000Z",
      validation: "typecheck",
      afterModification: true,
      passed: true
    },
    {
      kind: "file_modification",
      createdAt: "2026-06-06T04:00:00.000Z",
      wrongFile: false,
      unrelatedChange: false
    },
    {
      kind: "failure_recovery",
      createdAt: "2026-06-06T04:00:00.000Z",
      recovered: true
    }
  ];
}

function assertMetricHasReviewFields(metric: AgentQualityMetricValue): void {
  assert.equal(typeof metric.numerator, "number");
  assert.equal(typeof metric.denominator, "number");
  assert.equal(metric.value === null || typeof metric.value === "number", true);
  assert.equal(metric.mvpPassed === null || typeof metric.mvpPassed === "boolean", true);
  assert.equal(metric.usablePassed === null || typeof metric.usablePassed === "boolean", true);
  assert.equal(metric.excellentPassed === null || typeof metric.excellentPassed === "boolean", true);
}

function pickReviewFields(metric: AgentQualityMetricValue): Omit<AgentQualityMetricValue, "id"> {
  return {
    numerator: metric.numerator,
    denominator: metric.denominator,
    value: metric.value,
    mvpPassed: metric.mvpPassed,
    usablePassed: metric.usablePassed,
    excellentPassed: metric.excellentPassed
  };
}
