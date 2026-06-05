// 本文件说明: 保存 AI Coding Agent MVP 指标观测事件, 用于本地统计和回归测试
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentQualityObservation } from "../shared/agentQualityMetrics.js";
import {
  createAgentQualityMetricSnapshot,
  isAgentQualityObservation
} from "../shared/agentQualityMetrics.js";

export type AgentQualityMetricLogRecord = AgentQualityObservation & {
  id: string;
};

type AgentQualityMetricsFile = {
  records: AgentQualityMetricLogRecord[];
};

export type AgentQualityMetricsLogStore = {
  append: (observation: AgentQualityObservation) => Promise<AgentQualityMetricLogRecord>;
  list: (limit?: number) => Promise<AgentQualityMetricLogRecord[]>;
  snapshot: () => Promise<ReturnType<typeof createAgentQualityMetricSnapshot>>;
};

const maxStoredRecords = 2_000;

export function createAgentQualityMetricsLogStore({
  directory,
  createId = () => randomUUID()
}: {
  directory: string;
  createId?: () => string;
}): AgentQualityMetricsLogStore {
  const filePath = join(directory, "agent-quality-metrics.json");

  async function append(
    observation: AgentQualityObservation
  ): Promise<AgentQualityMetricLogRecord> {
    const file = await readMetricsFile(filePath);
    const record = {
      ...observation,
      id: createId()
    };
    const nextRecords = [...file.records, record].slice(-maxStoredRecords);

    await writeMetricsFile(directory, filePath, { records: nextRecords });
    return record;
  }

  async function list(limit = 200): Promise<AgentQualityMetricLogRecord[]> {
    const normalizedLimit = Math.min(maxStoredRecords, Math.max(1, Math.round(limit)));
    const file = await readMetricsFile(filePath);

    return file.records.slice(-normalizedLimit).reverse();
  }

  async function snapshot(): Promise<ReturnType<typeof createAgentQualityMetricSnapshot>> {
    const file = await readMetricsFile(filePath);

    return createAgentQualityMetricSnapshot(file.records);
  }

  return {
    append,
    list,
    snapshot
  };
}

async function readMetricsFile(filePath: string): Promise<AgentQualityMetricsFile> {
  try {
    const rawValue = await readFile(filePath, "utf8");
    const parsed = JSON.parse(rawValue) as Partial<AgentQualityMetricsFile>;

    return {
      records: Array.isArray(parsed.records)
        ? parsed.records.filter(isAgentQualityMetricLogRecord)
        : []
    };
  } catch {
    return { records: [] };
  }
}

async function writeMetricsFile(
  directory: string,
  filePath: string,
  value: AgentQualityMetricsFile
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function isAgentQualityMetricLogRecord(value: unknown): value is AgentQualityMetricLogRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isAgentQualityObservation(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
