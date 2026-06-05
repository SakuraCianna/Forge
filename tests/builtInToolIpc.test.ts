import test from "node:test";
import assert from "node:assert/strict";
import { registerBuiltInToolHandlers } from "../src/main/builtInTools/builtInToolIpc.js";
import { createBuiltInToolRegistry } from "../src/main/builtInTools/builtInToolRegistry.js";
import { builtInToolChannels } from "../src/shared/ipcChannels.js";

test("built-in tool IPC registers catalog, logs, metrics, QA and execute handlers", async () => {
  const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
  let executeContextFullAccess: boolean | undefined;
  const registry = createBuiltInToolRegistry({
    executors: {
      readFile: async (_input, context) => {
        executeContextFullAccess = context.fullAccess;

        return { status: "ok" };
      }
    }
  });

  registerBuiltInToolHandlers(
    {
      auditLogStore: {
        list: async () => []
      },
      metricsLogStore: {
        append: async (observation) => ({
          ...observation,
          id: "metric-1"
        }),
        snapshot: async () => ({
          generatedAt: "2026-06-04T01:00:00.000Z",
          metrics: []
        })
      },
      registry
    },
    (channel, handler) => handlers.set(channel, handler)
  );

  assert.deepEqual([...handlers.keys()].sort(), [
    builtInToolChannels.catalog,
    builtInToolChannels.execute,
    builtInToolChannels.developmentQa,
    builtInToolChannels.logs,
    builtInToolChannels.metrics,
    builtInToolChannels.recordMetric
  ].sort());

  const catalog = await handlers.get(builtInToolChannels.catalog)?.(null);
  const executeResult = await handlers.get(builtInToolChannels.execute)?.(null, {
    toolName: "readFile",
    input: {},
    fullAccess: true
  });
  const qaResult = await handlers.get(builtInToolChannels.developmentQa)?.(null, {
    projectRoot: "Z:\\missing-forge-built-in-tool-qa"
  });
  const metricResult = await handlers.get(builtInToolChannels.recordMetric)?.(null, {
    kind: "validation_run",
    createdAt: "2026-06-04T01:00:00.000Z",
    validation: "typecheck",
    afterModification: true,
    passed: true
  });

  assert.equal((catalog as { tools: unknown[] }).tools.length, 70);
  assert.deepEqual(executeResult, { status: "ok" });
  assert.equal(executeContextFullAccess, true);
  assert.equal((qaResult as { status: string }).status, "skipped");
  assert.deepEqual(metricResult, {
    id: "metric-1",
    kind: "validation_run",
    createdAt: "2026-06-04T01:00:00.000Z",
    validation: "typecheck",
    afterModification: true,
    passed: true
  });
});
