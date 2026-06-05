// 本文件说明: 记录 Built-in Tool 调用审计日志, 只保存工具名、风险、状态和摘要
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  BuiltInToolCallLogRecord,
  BuiltInToolCallStatus,
  BuiltInToolCategory,
  BuiltInToolRiskLevel
} from "../../shared/builtInToolTypes.js";

type BuiltInToolAuditLogFile = {
  records: BuiltInToolCallLogRecord[];
};

export type BuiltInToolAuditLogStore = {
  append: (
    record: Omit<BuiltInToolCallLogRecord, "id">
  ) => Promise<BuiltInToolCallLogRecord>;
  list: (limit?: number) => Promise<BuiltInToolCallLogRecord[]>;
};

const maxStoredRecords = 500;

export function createBuiltInToolAuditLogStore({
  directory,
  createId = () => randomUUID()
}: {
  directory: string;
  createId?: () => string;
}): BuiltInToolAuditLogStore {
  const filePath = join(directory, "built-in-tool-calls.json");

  async function append(
    record: Omit<BuiltInToolCallLogRecord, "id">
  ): Promise<BuiltInToolCallLogRecord> {
    const file = await readLogFile(filePath);
    const nextRecord = {
      ...record,
      id: createId()
    };
    const nextRecords = [...file.records, nextRecord].slice(-maxStoredRecords);

    await writeLogFile(directory, filePath, { records: nextRecords });
    return nextRecord;
  }

  async function list(limit = 80): Promise<BuiltInToolCallLogRecord[]> {
    const normalizedLimit = Math.min(maxStoredRecords, Math.max(1, Math.round(limit)));
    const file = await readLogFile(filePath);

    return file.records.slice(-normalizedLimit).reverse();
  }

  return {
    append,
    list
  };
}

export function createBuiltInToolCallLogRecordInput({
  category,
  endTime,
  errorMessage,
  riskLevel,
  startTime,
  status,
  targetSummary,
  threadId,
  toolName
}: {
  toolName: string;
  category: BuiltInToolCategory;
  riskLevel: BuiltInToolRiskLevel;
  startTime: string;
  endTime: string;
  status: BuiltInToolCallStatus;
  threadId?: string;
  targetSummary?: string;
  errorMessage?: string;
}): Omit<BuiltInToolCallLogRecord, "id"> {
  return {
    toolName,
    category,
    riskLevel,
    startTime,
    endTime,
    durationMs: calculateDurationMs(startTime, endTime),
    status,
    ...(threadId ? { threadId } : {}),
    ...(targetSummary ? { targetSummary } : {}),
    ...(errorMessage ? { errorMessage } : {})
  };
}

async function readLogFile(filePath: string): Promise<BuiltInToolAuditLogFile> {
  try {
    const rawValue = await readFile(filePath, "utf8");
    const parsed = JSON.parse(rawValue) as Partial<BuiltInToolAuditLogFile>;

    return {
      records: Array.isArray(parsed.records)
        ? parsed.records.filter(isBuiltInToolCallLogRecord)
        : []
    };
  } catch {
    return { records: [] };
  }
}

async function writeLogFile(
  directory: string,
  filePath: string,
  value: BuiltInToolAuditLogFile
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function calculateDurationMs(startTime: string, endTime: string): number {
  const durationMs = Date.parse(endTime) - Date.parse(startTime);

  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
}

function isBuiltInToolCallLogRecord(value: unknown): value is BuiltInToolCallLogRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.toolName === "string" &&
    isBuiltInToolCategory(value.category) &&
    isBuiltInToolRiskLevel(value.riskLevel) &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string" &&
    typeof value.durationMs === "number" &&
    isBuiltInToolCallStatus(value.status)
  );
}

function isBuiltInToolCategory(value: unknown): value is BuiltInToolCategory {
  return (
    value === "project" ||
    value === "file" ||
    value === "search" ||
    value === "edit" ||
    value === "terminal" ||
    value === "git" ||
    value === "diagnostics" ||
    value === "auxiliary"
  );
}

function isBuiltInToolRiskLevel(value: unknown): value is BuiltInToolRiskLevel {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}

function isBuiltInToolCallStatus(value: unknown): value is BuiltInToolCallStatus {
  return (
    value === "succeeded" ||
    value === "failed" ||
    value === "blocked" ||
    value === "cancelled" ||
    value === "not_implemented"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
