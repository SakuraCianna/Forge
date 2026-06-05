import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentQualityMetricsLogStore } from "../src/main/agentQualityMetricsLog.js";

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
