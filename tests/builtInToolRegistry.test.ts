import test from "node:test";
import assert from "node:assert/strict";
import {
  createBuiltInToolRegistry,
  getBuiltInToolFromRegistry
} from "../src/main/builtInTools/builtInToolRegistry.js";
import type { BuiltInToolCallLogRecord } from "../src/shared/builtInToolTypes.js";
import type { AgentQualityObservation } from "../src/shared/agentQualityMetrics.js";

test("built-in tool registry exposes execute functions for all tools", () => {
  const registry = createBuiltInToolRegistry();

  assert.equal(registry.length, 70);
  assert.equal(typeof getBuiltInToolFromRegistry(registry, "readFile").execute, "function");
});

test("available tools without executors return structured failure and audit status", async () => {
  const logInputs: Array<Omit<BuiltInToolCallLogRecord, "id">> = [];
  const registry = createBuiltInToolRegistry({
    auditLogStore: {
      append: async (record) => {
        logInputs.push(record);
        return { ...record, id: `log-${logInputs.length}` };
      }
    }
  });

  const result = await getBuiltInToolFromRegistry(registry, "takeScreenshot").execute({}, {});

  assert.deepEqual(result, {
    status: "failed",
    toolName: "takeScreenshot",
    error: {
      code: "executor_missing",
      message: "Built-in tool takeScreenshot is marked available but has no executor wired yet.",
      recoverable: true
    }
  });
  assert.equal(logInputs[0]?.status, "failed");
  assert.equal(logInputs[0]?.toolName, "takeScreenshot");
  assert.equal(
    logInputs[0]?.errorMessage,
    "Built-in tool takeScreenshot is marked available but has no executor wired yet."
  );
});

test("high risk tools are blocked before executor when confirmation is missing", async () => {
  let executorCalled = false;
  const logInputs: Array<Omit<BuiltInToolCallLogRecord, "id">> = [];
  const registry = createBuiltInToolRegistry({
    auditLogStore: {
      append: async (record) => {
        logInputs.push(record);
        return { ...record, id: `log-${logInputs.length}` };
      }
    },
    executors: {
      applyEdit: async () => {
        executorCalled = true;
        return { status: "ok" };
      }
    }
  });

  const result = await getBuiltInToolFromRegistry(registry, "applyEdit").execute({}, {});

  assert.equal(executorCalled, false);
  assert.deepEqual(result, {
    status: "blocked",
    toolName: "applyEdit",
    message: "Built-in tool applyEdit requires user confirmation before execution.",
    confirmation: {
      kind: "double",
      title: "应用修改",
      consequence: "会把已审查内容写入项目文件。",
      reversible: true,
      targetLabel: "文件"
    }
  });
  assert.equal(logInputs[0]?.status, "blocked");
  assert.equal(logInputs[0]?.errorMessage, "Built-in tool applyEdit requires user confirmation before execution.");
});

test("critical typed tools are blocked unless typed confirmation matches", async () => {
  let executorCalls = 0;
  const registry = createBuiltInToolRegistry({
    executors: {
      gitPush: async () => {
        executorCalls += 1;
        return { status: "ok" };
      }
    }
  });
  const tool = getBuiltInToolFromRegistry(registry, "gitPush");

  assert.deepEqual(await tool.execute({}, { confirmed: true }), {
    status: "blocked",
    toolName: "gitPush",
    message: "Built-in tool gitPush requires typed confirmation before execution.",
    confirmation: {
      kind: "typed",
      title: "推送远程",
      consequence: "会把本地提交推送到远程仓库。",
      reversible: false,
      targetLabel: "远程/分支",
      confirmationKeyword: "PUSH"
    }
  });
  assert.deepEqual(
    await tool.execute({}, { confirmed: true, typedConfirmation: "wrong" }),
    {
      status: "blocked",
      toolName: "gitPush",
      message: "Typed confirmation for built-in tool gitPush did not match.",
      confirmation: {
        kind: "typed",
        title: "推送远程",
        consequence: "会把本地提交推送到远程仓库。",
        reversible: false,
        targetLabel: "远程/分支",
        confirmationKeyword: "PUSH"
      }
    }
  );
  assert.deepEqual(await tool.execute({}, { confirmed: true, typedConfirmation: "PUSH" }), {
    status: "ok"
  });
  assert.equal(executorCalls, 1);
});

test("confirmed available tools call their executor and write audit success", async () => {
  const logInputs: Array<Omit<BuiltInToolCallLogRecord, "id">> = [];
  const metricInputs: AgentQualityObservation[] = [];
  const registry = createBuiltInToolRegistry({
    auditLogStore: {
      append: async (record) => {
        logInputs.push(record);
        return { ...record, id: `log-${logInputs.length}` };
      }
    },
    metricsLogStore: {
      append: async (record) => {
        metricInputs.push(record);
        return { ...record, id: `metric-${metricInputs.length}` };
      }
    },
    executors: {
      readFile: async (input) => ({
        status: "ok",
        path: input.relativePath
      })
    }
  });

  const result = await getBuiltInToolFromRegistry(registry, "readFile").execute(
    { relativePath: "src/main/index.ts" },
    { threadId: "thread-1" }
  );

  assert.deepEqual(result, {
    status: "ok",
    path: "src/main/index.ts"
  });
  assert.equal(logInputs[0]?.status, "succeeded");
  assert.equal(logInputs[0]?.toolName, "readFile");
  assert.equal(logInputs[0]?.threadId, "thread-1");
  assert.equal(metricInputs[0]?.kind, "tool_call");
  assert.equal(metricInputs[0]?.toolName, "readFile");
  assert.equal(metricInputs[0]?.status, "succeeded");
  assert.equal(metricInputs[0]?.priority, "P0");
});

test("executor errors return structured recoverable failures and audit failed status", async () => {
  const logInputs: Array<Omit<BuiltInToolCallLogRecord, "id">> = [];
  const metricInputs: AgentQualityObservation[] = [];
  const registry = createBuiltInToolRegistry({
    auditLogStore: {
      append: async (record) => {
        logInputs.push(record);
        return { ...record, id: `log-${logInputs.length}` };
      }
    },
    metricsLogStore: {
      append: async (record) => {
        metricInputs.push(record);
        return { ...record, id: `metric-${metricInputs.length}` };
      }
    },
    executors: {
      readFile: async () => {
        throw new Error("File is outside the selected project");
      }
    },
    now: (() => {
      const dates = [
        new Date("2026-06-05T01:00:00.000Z"),
        new Date("2026-06-05T01:00:01.250Z")
      ];

      return () => dates.shift() ?? new Date("2026-06-05T01:00:01.250Z");
    })()
  });

  const result = await getBuiltInToolFromRegistry(registry, "readFile").execute(
    { relativePath: "../secret.txt" },
    { threadId: "thread-1" }
  );

  assert.deepEqual(result, {
    status: "failed",
    toolName: "readFile",
    error: {
      code: "tool_execution_failed",
      message: "File is outside the selected project",
      recoverable: true
    }
  });
  assert.equal(logInputs[0]?.toolName, "readFile");
  assert.equal(logInputs[0]?.category, "file");
  assert.equal(logInputs[0]?.riskLevel, "low");
  assert.equal(logInputs[0]?.startTime, "2026-06-05T01:00:00.000Z");
  assert.equal(logInputs[0]?.endTime, "2026-06-05T01:00:01.250Z");
  assert.equal(logInputs[0]?.durationMs, 1250);
  assert.equal(logInputs[0]?.status, "failed");
  assert.equal(logInputs[0]?.errorMessage, "File is outside the selected project");
  const metric = metricInputs[0];

  assert.ok(metric);
  assert.equal(metric.kind, "tool_call");

  if (metric.kind === "tool_call") {
    assert.equal(metric.status, "failed");
    assert.equal(metric.toolName, "readFile");
  }
});
