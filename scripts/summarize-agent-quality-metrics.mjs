// 本文件说明: 读取本地 Agent 质量指标日志并输出可复盘摘要, 不上传数据
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createAgentQualityMetricSnapshot,
  isAgentQualityObservation
} from "../.tmp-test/src/shared/agentQualityMetrics.js";

const args = parseArgs(process.argv.slice(2));
const source = args.file ? resolve(args.file) : findDefaultMetricsFile();

if (!source) {
  writeSummary(
    {
      status: "missing",
      source: null,
      totalRecords: 0,
      metrics: []
    },
    args.json
  );
  process.exit(0);
}

try {
  const records = await readMetricRecords(source);
  const snapshot = createAgentQualityMetricSnapshot(records);
  const summary = {
    status: "ok",
    source,
    totalRecords: records.length,
    generatedAt: snapshot.generatedAt,
    metrics: snapshot.metrics.map((metric) => ({
      id: metric.id,
      denominator: metric.denominator,
      numerator: metric.numerator,
      value: metric.value,
      usablePassed: metric.usablePassed
    }))
  };

  writeSummary(summary, args.json);
} catch (error) {
  writeSummary(
    {
      status: "error",
      source,
      totalRecords: 0,
      message: error instanceof Error ? error.message : String(error),
      metrics: []
    },
    args.json
  );
  process.exitCode = 1;
}

function parseArgs(rawArgs) {
  const parsed = {
    file: process.env.FORGE_AGENT_METRICS_FILE,
    json: false
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--file") {
      const nextArg = rawArgs[index + 1];

      if (!nextArg) {
        throw new Error("--file requires a path");
      }

      parsed.file = nextArg;
      index += 1;
    }
  }

  return parsed;
}

async function readMetricRecords(filePath) {
  const rawValue = await readFile(filePath, "utf8");
  const parsed = JSON.parse(rawValue);
  const records = Array.isArray(parsed?.records) ? parsed.records : [];

  return records.filter(isAgentQualityObservation);
}

function findDefaultMetricsFile() {
  const candidates = [
    process.env.APPDATA ? join(process.env.APPDATA, "Forge", "agent-quality-metrics", "agent-quality-metrics.json") : null,
    process.env.APPDATA ? join(process.env.APPDATA, "forge", "agent-quality-metrics", "agent-quality-metrics.json") : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Forge", "agent-quality-metrics", "agent-quality-metrics.json") : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "forge", "agent-quality-metrics", "agent-quality-metrics.json") : null
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function writeSummary(summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify(summary));
    return;
  }

  if (summary.status === "missing") {
    console.log("Agent quality metrics: missing");
    console.log("No local agent-quality-metrics.json was found. Metrics with no samples remain unproven.");
    return;
  }

  if (summary.status === "error") {
    console.error(`Agent quality metrics: error reading ${summary.source}`);
    console.error(summary.message);
    return;
  }

  console.log(`Agent quality metrics: ${summary.totalRecords} records`);
  console.log(`Source: ${summary.source}`);

  for (const metric of summary.metrics) {
    const value = metric.value === null ? "unproven" : `${Math.round(metric.value * 100)}%`;
    const status = metric.usablePassed === null ? "unproven" : metric.usablePassed ? "usable" : "below-usable";

    console.log(`${metric.id}: ${value} (${metric.numerator}/${metric.denominator}) ${status}`);
  }
}
