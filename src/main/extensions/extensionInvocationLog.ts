// 本文件说明: 记录 Extension 调用审计日志, 只保存摘要和状态
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  ExtensionActionDefinition,
  ExtensionInvocationLogRecord,
  ExtensionInvocationStatus,
  ExtensionManifest
} from "../../shared/extensionTypes.js";

type InvocationLogFile = {
  records: ExtensionInvocationLogRecord[];
};

export type ExtensionInvocationLogStore = {
  append: (record: Omit<ExtensionInvocationLogRecord, "id">) => Promise<ExtensionInvocationLogRecord>;
  update: (
    id: string,
    patch: Partial<
      Pick<
        ExtensionInvocationLogRecord,
        "status" | "outputSummary" | "errorMessage" | "completedAt" | "confirmedAt"
      >
    >
  ) => Promise<ExtensionInvocationLogRecord | null>;
  list: (limit?: number) => Promise<ExtensionInvocationLogRecord[]>;
};

const maxStoredRecords = 300;

export function createExtensionInvocationLogStore({
  directory,
  createId = () => randomUUID()
}: {
  directory: string;
  createId?: () => string;
}): ExtensionInvocationLogStore {
  const filePath = join(directory, "extension-invocations.json");

  async function append(
    record: Omit<ExtensionInvocationLogRecord, "id">
  ): Promise<ExtensionInvocationLogRecord> {
    const file = await readLogFile(filePath);
    const nextRecord = {
      ...record,
      id: createId()
    };
    const nextRecords = [...file.records, nextRecord].slice(-maxStoredRecords);

    await writeLogFile(directory, filePath, { records: nextRecords });
    return nextRecord;
  }

  async function update(
    id: string,
    patch: Partial<
      Pick<
        ExtensionInvocationLogRecord,
        "status" | "outputSummary" | "errorMessage" | "completedAt" | "confirmedAt"
      >
    >
  ): Promise<ExtensionInvocationLogRecord | null> {
    const file = await readLogFile(filePath);
    let updatedRecord: ExtensionInvocationLogRecord | null = null;
    const records = file.records.map((record) => {
      if (record.id !== id) {
        return record;
      }

      updatedRecord = {
        ...record,
        ...patch
      };
      return updatedRecord;
    });

    if (updatedRecord) {
      await writeLogFile(directory, filePath, { records });
    }

    return updatedRecord;
  }

  async function list(limit = 80): Promise<ExtensionInvocationLogRecord[]> {
    const normalizedLimit = Math.min(maxStoredRecords, Math.max(1, Math.round(limit)));
    const file = await readLogFile(filePath);

    return file.records.slice(-normalizedLimit).reverse();
  }

  return {
    append,
    update,
    list
  };
}

export function createExtensionLogRecordInput({
  action,
  confirmationToken,
  inputSummary,
  manifest,
  now,
  risk,
  status,
  threadId
}: {
  action: ExtensionActionDefinition;
  confirmationToken?: string;
  inputSummary: string;
  manifest: ExtensionManifest;
  now: string;
  risk: ExtensionActionDefinition["risk"];
  status: ExtensionInvocationStatus;
  threadId?: string;
}): Omit<ExtensionInvocationLogRecord, "id"> {
  return {
    extensionId: manifest.id,
    extensionName: manifest.name,
    actionId: action.id,
    actionLabel: action.label,
    threadId,
    status,
    risk,
    inputSummary,
    createdAt: now,
    confirmationToken
  };
}

async function readLogFile(filePath: string): Promise<InvocationLogFile> {
  try {
    const rawValue = await readFile(filePath, "utf8");
    const parsed = JSON.parse(rawValue) as Partial<InvocationLogFile>;

    return {
      records: Array.isArray(parsed.records)
        ? parsed.records.filter(isExtensionInvocationLogRecord)
        : []
    };
  } catch {
    return { records: [] };
  }
}

async function writeLogFile(
  directory: string,
  filePath: string,
  value: InvocationLogFile
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function isExtensionInvocationLogRecord(value: unknown): value is ExtensionInvocationLogRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.extensionId === "string" &&
    typeof value.actionId === "string" &&
    typeof value.inputSummary === "string" &&
    isInvocationStatus(value.status)
  );
}

function isInvocationStatus(value: unknown): value is ExtensionInvocationStatus {
  return (
    value === "pending-confirmation" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
