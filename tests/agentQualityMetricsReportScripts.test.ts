import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("agent quality metrics summary script reports metric values from a log file", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const directory = await mkdtemp(join(tmpdir(), "forge-agent-metrics-report-"));
  const metricsFile = join(directory, "agent-quality-metrics.json");

  await writeFile(
    metricsFile,
    JSON.stringify(
      {
        records: [
          {
            id: "metric-1",
            kind: "tool_call",
            createdAt: "2026-06-05T01:00:00.000Z",
            toolName: "readFile",
            category: "file",
            riskLevel: "low",
            priority: "P0",
            status: "succeeded",
            requiresConfirmation: false,
            confirmedBeforeExecution: false,
            sideEffect: "none"
          },
          {
            id: "metric-2",
            kind: "task_outcome",
            createdAt: "2026-06-05T01:01:00.000Z",
            complexity: "simple",
            completedInFirstAttempt: true
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );

  assert.equal(
    packageJson.scripts?.["quality:metrics"],
    "npm run test:compile && node scripts/summarize-agent-quality-metrics.mjs"
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/summarize-agent-quality-metrics.mjs", "--file", metricsFile, "--json"],
    { windowsHide: true }
  );
  const summary = JSON.parse(stdout) as {
    status: string;
    source: string;
    totalRecords: number;
    metrics: Array<{
      id: string;
      denominator: number;
      numerator: number;
      value: number | null;
      usablePassed: boolean | null;
    }>;
  };

  assert.equal(summary.status, "ok");
  assert.equal(summary.source, metricsFile);
  assert.equal(summary.totalRecords, 2);
  assert.deepEqual(
    summary.metrics.find((metric) => metric.id === "toolCallSuccessRate"),
    {
      id: "toolCallSuccessRate",
      denominator: 1,
      numerator: 1,
      value: 1,
      usablePassed: true
    }
  );
  assert.deepEqual(
    summary.metrics.find((metric) => metric.id === "simpleTaskFirstPassCompletionRate"),
    {
      id: "simpleTaskFirstPassCompletionRate",
      denominator: 1,
      numerator: 1,
      value: 1,
      usablePassed: true
    }
  );
  assert.equal(
    summary.metrics.find((metric) => metric.id === "mediumTaskFirstPassCompletionRate")?.value,
    null
  );
});
