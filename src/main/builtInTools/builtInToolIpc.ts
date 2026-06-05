// 本文件说明: 注册 Built-in Tools IPC, 统一暴露工具目录、执行、审计日志和质量指标
import {
  builtInToolCategories,
  builtInToolDefinitions
} from "../../shared/builtInToolCatalog.js";
import { builtInToolChannels } from "../../shared/ipcChannels.js";
import type {
  BuiltInTool,
  BuiltInToolCatalogSnapshot,
  BuiltInToolExecutionRequest
} from "../../shared/builtInToolTypes.js";
import type { BuiltInToolQaRunRequest } from "../../shared/builtInToolQaTypes.js";
import {
  isAgentQualityObservation,
  type AgentQualityObservation
} from "../../shared/agentQualityMetrics.js";
import type { AgentQualityMetricsLogStore } from "../agentQualityMetricsLog.js";
import type { BuiltInToolAuditLogStore } from "./builtInToolAuditLog.js";
import { getBuiltInToolFromRegistry } from "./builtInToolRegistry.js";
import { runDevelopmentBuiltInToolQa } from "./builtInToolQaRunner.js";

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export function registerBuiltInToolHandlers(
  {
    auditLogStore,
    metricsLogStore,
    registry
  }: {
    auditLogStore: Pick<BuiltInToolAuditLogStore, "list">;
    metricsLogStore: Pick<AgentQualityMetricsLogStore, "append" | "snapshot">;
    registry: BuiltInTool[];
  },
  registerHandler: RegisterHandler
): void {
  registerHandler(builtInToolChannels.catalog, async () => createBuiltInToolCatalogSnapshot());
  registerHandler(builtInToolChannels.logs, async (_event, limit) =>
    auditLogStore.list(readOptionalNumber(limit))
  );
  registerHandler(builtInToolChannels.metrics, async () => metricsLogStore.snapshot());
  registerHandler(builtInToolChannels.recordMetric, async (_event, observation) =>
    metricsLogStore.append(assertAgentQualityObservation(observation))
  );
  registerHandler(builtInToolChannels.developmentQa, async (_event, request) =>
    runDevelopmentBuiltInToolQa({
      registry,
      request: assertQaRunRequest(request)
    })
  );
  registerHandler(builtInToolChannels.execute, async (_event, request) => {
    const executionRequest = assertExecutionRequest(request);
    const tool = getBuiltInToolFromRegistry(registry, executionRequest.toolName);

    return tool.execute(executionRequest.input ?? {}, {
      confirmed: executionRequest.confirmed,
      fullAccess: executionRequest.fullAccess,
      projectRoot: executionRequest.projectRoot,
      secondConfirmed: executionRequest.secondConfirmed,
      threadId: executionRequest.threadId,
      typedConfirmation: executionRequest.typedConfirmation
    });
  });
}

function assertAgentQualityObservation(value: unknown): AgentQualityObservation {
  if (!isAgentQualityObservation(value)) {
    throw new Error("Invalid agent quality metric observation");
  }

  return value;
}

function assertQaRunRequest(value: unknown): BuiltInToolQaRunRequest | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid built-in tool QA run request");
  }

  return {
    browserPreviewUrl: readOptionalString(value.browserPreviewUrl),
    includeBrowserChecks: readOptionalBoolean(value.includeBrowserChecks),
    includeMutationChecks: readOptionalBoolean(value.includeMutationChecks),
    includeWebChecks: readOptionalBoolean(value.includeWebChecks),
    projectRoot: readOptionalString(value.projectRoot),
    modelId: readOptionalString(value.modelId)
  };
}

function createBuiltInToolCatalogSnapshot(): BuiltInToolCatalogSnapshot {
  return {
    categories: builtInToolCategories,
    tools: builtInToolDefinitions
  };
}

function assertExecutionRequest(value: unknown): BuiltInToolExecutionRequest {
  if (!isRecord(value) || typeof value.toolName !== "string") {
    throw new Error("Invalid built-in tool execution request");
  }

  return {
    toolName: value.toolName,
    input: isRecord(value.input) ? value.input : undefined,
    projectRoot:
      typeof value.projectRoot === "string" || value.projectRoot === null
        ? value.projectRoot
        : undefined,
    threadId: readOptionalString(value.threadId),
    confirmed: readOptionalBoolean(value.confirmed),
    fullAccess: readOptionalBoolean(value.fullAccess),
    secondConfirmed: readOptionalBoolean(value.secondConfirmed),
    typedConfirmation: readOptionalString(value.typedConfirmation)
  };
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
