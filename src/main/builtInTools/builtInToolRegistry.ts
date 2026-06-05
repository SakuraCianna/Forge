// 本文件说明: 将 Built-in Tool 元数据包装成可执行 registry, 统一处理确认、错误和审计日志
import {
  builtInToolDefinitions,
  createNotImplementedToolResult
} from "../../shared/builtInToolCatalog.js";
import { resolveBuiltInToolConfirmationContext } from "../../shared/builtInToolConfirmation.js";
import type {
  BuiltInTool,
  BuiltInToolBlockedResult,
  BuiltInToolCallStatus,
  BuiltInToolDefinition,
  BuiltInToolExecutionContext,
  BuiltInToolFailureResult
} from "../../shared/builtInToolTypes.js";
import { deriveAgentToolSideEffect, type AgentQualityObservation } from "../../shared/agentQualityMetrics.js";
import type { AgentQualityMetricsLogStore } from "../agentQualityMetricsLog.js";
import {
  createBuiltInToolCallLogRecordInput,
  type BuiltInToolAuditLogStore
} from "./builtInToolAuditLog.js";

export type BuiltInToolExecutor = (
  input: Record<string, unknown>,
  context: BuiltInToolExecutionContext
) => Promise<unknown>;

export type BuiltInToolExecutorMap = Partial<Record<string, BuiltInToolExecutor>>;

export type BuiltInToolRegistryOptions = {
  auditLogStore?: Pick<BuiltInToolAuditLogStore, "append">;
  executors?: BuiltInToolExecutorMap;
  metricsLogStore?: Pick<AgentQualityMetricsLogStore, "append">;
  now?: () => Date;
};

export function createBuiltInToolRegistry({
  auditLogStore,
  executors = {},
  metricsLogStore,
  now = () => new Date()
}: BuiltInToolRegistryOptions = {}): BuiltInTool[] {
  return builtInToolDefinitions.map((definition) => ({
    ...definition,
    execute: (input, context) =>
      executeBuiltInTool(definition, input, context, {
        auditLogStore,
        executor: executors[definition.name],
        metricsLogStore,
        now
      })
  }));
}

export function getBuiltInToolFromRegistry(
  registry: BuiltInTool[],
  toolName: string
): BuiltInTool {
  const tool = registry.find((candidate) => candidate.name === toolName);

  if (!tool) {
    throw new Error(`Unknown built-in tool: ${toolName}`);
  }

  return tool;
}

async function executeBuiltInTool(
  definition: BuiltInToolDefinition,
  input: Record<string, unknown>,
  context: BuiltInToolExecutionContext,
  {
    auditLogStore,
    executor,
    metricsLogStore,
    now
  }: {
    auditLogStore?: Pick<BuiltInToolAuditLogStore, "append">;
    executor?: BuiltInToolExecutor;
    metricsLogStore?: Pick<AgentQualityMetricsLogStore, "append">;
    now: () => Date;
  }
): Promise<unknown> {
  const startTime = now().toISOString();
  let status: BuiltInToolCallStatus = "succeeded";
  let errorMessage: string | undefined;

  try {
    const confirmationResolution = resolveBuiltInToolConfirmationContext(definition, context);

    if (!confirmationResolution.ok) {
      status = "blocked";
      const blockedResult: BuiltInToolBlockedResult = {
        status: "blocked",
        toolName: definition.name,
        message: confirmationResolution.message,
        ...(definition.confirmation ? { confirmation: definition.confirmation } : {})
      };
      errorMessage = blockedResult.message;
      return blockedResult;
    }

    if (definition.availability === "not_implemented") {
      status = "not_implemented";
      return createNotImplementedToolResult(definition);
    }

    if (!executor) {
      status = "failed";
      const failureResult = createToolFailureResult(
        definition.name,
        "executor_missing",
        `Built-in tool ${definition.name} is marked available but has no executor wired yet.`
      );
      errorMessage = failureResult.error.message;
      return failureResult;
    }

    const result = await executor(input, context);
    return result;
  } catch (error) {
    status = "failed";
    const failureResult = createToolFailureResult(
      definition.name,
      "tool_execution_failed",
      error instanceof Error ? error.message : String(error)
    );
    errorMessage = failureResult.error.message;
    return failureResult;
  } finally {
    const endTime = now().toISOString();

    await auditLogStore?.append(
      createBuiltInToolCallLogRecordInput({
        toolName: definition.name,
        category: definition.category,
        riskLevel: definition.riskLevel,
        startTime,
        endTime,
        status,
        ...(context.threadId ? { threadId: context.threadId } : {}),
        ...(errorMessage ? { errorMessage } : {})
      })
    );
    await metricsLogStore?.append(
      createToolCallMetricObservation({
        context,
        createdAt: endTime,
        definition,
        status
      })
    );
  }
}

function createToolFailureResult(
  toolName: string,
  code: BuiltInToolFailureResult["error"]["code"],
  message: string
): BuiltInToolFailureResult {
  return {
    status: "failed",
    toolName,
    error: {
      code,
      message,
      recoverable: true
    }
  };
}

function createToolCallMetricObservation({
  context,
  createdAt,
  definition,
  status
}: {
  context: BuiltInToolExecutionContext;
  createdAt: string;
  definition: BuiltInToolDefinition;
  status: BuiltInToolCallStatus;
}): AgentQualityObservation {
  return {
    kind: "tool_call",
    createdAt,
    toolName: definition.name,
    category: definition.category,
    riskLevel: definition.riskLevel,
    priority: definition.priority,
    status,
    requiresConfirmation: definition.requiresConfirmation,
    confirmedBeforeExecution: Boolean(
      context.confirmed &&
        (definition.riskLevel !== "critical" ||
          context.secondConfirmed ||
          (definition.confirmation?.kind === "typed" &&
            context.typedConfirmation === definition.confirmation.confirmationKeyword))
    ),
    sideEffect: deriveAgentToolSideEffect(definition.name)
  };
}
