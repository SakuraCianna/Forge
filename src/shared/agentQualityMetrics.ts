// 本文件说明: 定义 AI Coding Agent MVP 指标、观测事件和本地聚合计算
import type {
  BuiltInToolCallStatus,
  BuiltInToolCategory,
  BuiltInToolPriority,
  BuiltInToolRiskLevel
} from "./builtInToolTypes.js";

export type AgentQualityMetricTier = "mvp" | "usable" | "excellent";

export type AgentQualityMetricDirection = "min" | "max" | "equal";

export type AgentQualityMetricId =
  | "toolCallSuccessRate"
  | "p0ToolErrorRate"
  | "simpleTaskFirstPassCompletionRate"
  | "mediumTaskFirstPassCompletionRate"
  | "complexTaskFirstPassCompletionRate"
  | "postModificationTypecheckPassRate"
  | "postModificationBuildPassRate"
  | "postModificationLintPassRate"
  | "wrongFileModificationRate"
  | "unrelatedCodeChangeRate"
  | "highRiskMisfireRate"
  | "writeBeforeConfirmationRate"
  | "failureRecoveryRate";

export type AgentTaskComplexity = "simple" | "medium" | "complex";

export type AgentValidationKind = "typecheck" | "build" | "lint";

export type AgentQualityMetricDefinition = {
  id: AgentQualityMetricId;
  label: string;
  direction: AgentQualityMetricDirection;
  thresholds: Record<AgentQualityMetricTier, number>;
};

export type AgentQualityObservation =
  | {
      kind: "tool_call";
      createdAt: string;
      toolName: string;
      category: BuiltInToolCategory;
      riskLevel: BuiltInToolRiskLevel;
      priority: BuiltInToolPriority;
      status: BuiltInToolCallStatus;
      requiresConfirmation: boolean;
      confirmedBeforeExecution: boolean;
      sideEffect: AgentToolSideEffect;
    }
  | {
      kind: "task_outcome";
      createdAt: string;
      complexity: AgentTaskComplexity;
      completedInFirstAttempt: boolean;
    }
  | {
      kind: "validation_run";
      createdAt: string;
      validation: AgentValidationKind;
      afterModification: boolean;
      passed: boolean;
    }
  | {
      kind: "file_modification";
      createdAt: string;
      wrongFile: boolean;
      unrelatedChange: boolean;
    }
  | {
      kind: "failure_recovery";
      createdAt: string;
      recovered: boolean;
    };

export type AgentToolSideEffect =
  | "none"
  | "write"
  | "delete"
  | "move"
  | "command"
  | "git"
  | "network"
  | "memory";

export type AgentQualityMetricValue = {
  id: AgentQualityMetricId;
  numerator: number;
  denominator: number;
  value: number | null;
  mvpPassed: boolean | null;
  usablePassed: boolean | null;
  excellentPassed: boolean | null;
};

export type AgentQualityMetricSnapshot = {
  generatedAt: string;
  metrics: AgentQualityMetricValue[];
};

export const agentQualityMetricDefinitions: AgentQualityMetricDefinition[] = [
  metric("toolCallSuccessRate", "工具调用成功率", "min", 0.95, 0.98, 0.99),
  metric("p0ToolErrorRate", "P0 工具错误率", "max", 0.05, 0.02, 0.01),
  metric("simpleTaskFirstPassCompletionRate", "简单任务一次完成率", "min", 0.7, 0.85, 0.95),
  metric("mediumTaskFirstPassCompletionRate", "中等任务一次完成率", "min", 0.5, 0.7, 0.85),
  metric("complexTaskFirstPassCompletionRate", "复杂任务一次完成率", "min", 0.25, 0.45, 0.65),
  metric("postModificationTypecheckPassRate", "修改后 typecheck 通过率", "min", 0.75, 0.9, 0.97),
  metric("postModificationBuildPassRate", "修改后 build 通过率", "min", 0.7, 0.85, 0.95),
  metric("postModificationLintPassRate", "修改后 lint 通过率", "min", 0.7, 0.85, 0.95),
  metric("wrongFileModificationRate", "错误文件修改率", "max", 0.15, 0.08, 0.03),
  metric("unrelatedCodeChangeRate", "无关代码改动率", "max", 0.2, 0.1, 0.05),
  metric("highRiskMisfireRate", "高风险操作误触发率", "equal", 0, 0, 0),
  metric("writeBeforeConfirmationRate", "用户确认前写盘率", "equal", 0, 0, 0),
  metric("failureRecoveryRate", "失败后可恢复率", "min", 0.6, 0.8, 0.9)
];

export function createAgentQualityMetricSnapshot(
  observations: AgentQualityObservation[],
  generatedAt = new Date().toISOString()
): AgentQualityMetricSnapshot {
  return {
    generatedAt,
    metrics: agentQualityMetricDefinitions.map((definition) =>
      createMetricValue(definition, observations)
    )
  };
}

export function getAgentQualityMetricValue(
  snapshot: AgentQualityMetricSnapshot,
  id: AgentQualityMetricId
): AgentQualityMetricValue {
  const value = snapshot.metrics.find((metricValue) => metricValue.id === id);

  if (!value) {
    throw new Error(`Unknown agent quality metric: ${id}`);
  }

  return value;
}

export function deriveAgentToolSideEffect(toolName: string): AgentToolSideEffect {
  if (toolName === "deleteFile") {
    return "delete";
  }

  if (toolName === "moveFile") {
    return "move";
  }

  if (
    [
      "applyEdit",
      "applyPatch",
      "copyFile",
      "createFile",
      "createProjectInstructions",
      "formatFile",
      "insertText",
      "replaceText",
      "revertFile",
      "updateProjectInstructions",
      "writeProjectMemory"
    ].includes(toolName)
  ) {
    return "write";
  }

  if (
    [
      "checkoutBranch",
      "createBranch",
      "createCommit",
      "createWorktree",
      "gitPush",
      "revertChanges"
    ].includes(toolName)
  ) {
    return "git";
  }

  if (
    [
      "installDependency",
      "runBuild",
      "runCommand",
      "runLint",
      "runPackageScript",
      "runTargetedTest",
      "runTests",
      "runTypecheck",
      "stopCommand"
    ].includes(toolName)
  ) {
    return "command";
  }

  if (["fetchDocs", "fetchUrl", "openBrowserPreview", "takeScreenshot", "webSearch"].includes(toolName)) {
    return "network";
  }

  if (toolName === "deleteMemory") {
    return "memory";
  }

  return "none";
}

export function isAgentQualityObservation(value: unknown): value is AgentQualityObservation {
  if (!isRecord(value) || typeof value.createdAt !== "string") {
    return false;
  }

  if (value.kind === "tool_call") {
    return (
      typeof value.toolName === "string" &&
      isBuiltInToolCategory(value.category) &&
      isBuiltInToolRiskLevel(value.riskLevel) &&
      isBuiltInToolPriority(value.priority) &&
      isBuiltInToolCallStatus(value.status) &&
      typeof value.requiresConfirmation === "boolean" &&
      typeof value.confirmedBeforeExecution === "boolean" &&
      isAgentToolSideEffect(value.sideEffect)
    );
  }

  if (value.kind === "task_outcome") {
    return isAgentTaskComplexity(value.complexity) && typeof value.completedInFirstAttempt === "boolean";
  }

  if (value.kind === "validation_run") {
    return (
      isAgentValidationKind(value.validation) &&
      typeof value.afterModification === "boolean" &&
      typeof value.passed === "boolean"
    );
  }

  if (value.kind === "file_modification") {
    return typeof value.wrongFile === "boolean" && typeof value.unrelatedChange === "boolean";
  }

  if (value.kind === "failure_recovery") {
    return typeof value.recovered === "boolean";
  }

  return false;
}

function createMetricValue(
  definition: AgentQualityMetricDefinition,
  observations: AgentQualityObservation[]
): AgentQualityMetricValue {
  const { numerator, denominator } = calculateMetricRatio(definition.id, observations);
  const value = denominator > 0 ? numerator / denominator : null;

  return {
    id: definition.id,
    numerator,
    denominator,
    value,
    mvpPassed: value === null ? null : passesThreshold(value, definition, "mvp"),
    usablePassed: value === null ? null : passesThreshold(value, definition, "usable"),
    excellentPassed: value === null ? null : passesThreshold(value, definition, "excellent")
  };
}

function calculateMetricRatio(
  id: AgentQualityMetricId,
  observations: AgentQualityObservation[]
): { numerator: number; denominator: number } {
  if (id === "toolCallSuccessRate") {
    const calls = observations.filter(
      (observation): observation is Extract<AgentQualityObservation, { kind: "tool_call" }> =>
        observation.kind === "tool_call" &&
        observation.status !== "blocked" &&
        observation.status !== "cancelled"
    );

    return {
      numerator: calls.filter((call) => call.status === "succeeded").length,
      denominator: calls.length
    };
  }

  if (id === "p0ToolErrorRate") {
    const calls = observations.filter(
      (observation): observation is Extract<AgentQualityObservation, { kind: "tool_call" }> =>
        observation.kind === "tool_call" &&
        observation.priority === "P0" &&
        observation.status !== "blocked" &&
        observation.status !== "cancelled"
    );

    return {
      numerator: calls.filter((call) => call.status === "failed" || call.status === "not_implemented").length,
      denominator: calls.length
    };
  }

  if (
    id === "simpleTaskFirstPassCompletionRate" ||
    id === "mediumTaskFirstPassCompletionRate" ||
    id === "complexTaskFirstPassCompletionRate"
  ) {
    const complexity = id.replace("TaskFirstPassCompletionRate", "") as AgentTaskComplexity;
    const tasks = observations.filter(
      (observation): observation is Extract<AgentQualityObservation, { kind: "task_outcome" }> =>
        observation.kind === "task_outcome" && observation.complexity === complexity
    );

    return {
      numerator: tasks.filter((task) => task.completedInFirstAttempt).length,
      denominator: tasks.length
    };
  }

  if (
    id === "postModificationTypecheckPassRate" ||
    id === "postModificationBuildPassRate" ||
    id === "postModificationLintPassRate"
  ) {
    const validation = getValidationKindForMetric(id);
    const runs = observations.filter(
      (observation): observation is Extract<AgentQualityObservation, { kind: "validation_run" }> =>
        observation.kind === "validation_run" &&
        observation.afterModification &&
        observation.validation === validation
    );

    return {
      numerator: runs.filter((run) => run.passed).length,
      denominator: runs.length
    };
  }

  if (id === "wrongFileModificationRate" || id === "unrelatedCodeChangeRate") {
    const modifications = observations.filter(
      (observation): observation is Extract<AgentQualityObservation, { kind: "file_modification" }> =>
        observation.kind === "file_modification"
    );

    return {
      numerator: modifications.filter((modification) =>
        id === "wrongFileModificationRate"
          ? modification.wrongFile
          : modification.unrelatedChange
      ).length,
      denominator: modifications.length
    };
  }

  if (id === "highRiskMisfireRate") {
    const highRiskCalls = observations.filter(
      (observation): observation is Extract<AgentQualityObservation, { kind: "tool_call" }> =>
        observation.kind === "tool_call" &&
        (observation.riskLevel === "high" || observation.riskLevel === "critical")
    );

    return {
      numerator: highRiskCalls.filter(
        (call) => call.status === "succeeded" && !call.confirmedBeforeExecution
      ).length,
      denominator: highRiskCalls.length
    };
  }

  if (id === "writeBeforeConfirmationRate") {
    const writeLikeCalls = observations.filter(
      (observation): observation is Extract<AgentQualityObservation, { kind: "tool_call" }> =>
        observation.kind === "tool_call" &&
        ["delete", "git", "move", "write"].includes(observation.sideEffect)
    );

    return {
      numerator: writeLikeCalls.filter(
        (call) => call.status === "succeeded" && !call.confirmedBeforeExecution
      ).length,
      denominator: writeLikeCalls.length
    };
  }

  const recoveries = observations.filter(
    (observation): observation is Extract<AgentQualityObservation, { kind: "failure_recovery" }> =>
      observation.kind === "failure_recovery"
  );

  return {
    numerator: recoveries.filter((recovery) => recovery.recovered).length,
    denominator: recoveries.length
  };
}

function getValidationKindForMetric(id: AgentQualityMetricId): AgentValidationKind {
  if (id === "postModificationTypecheckPassRate") {
    return "typecheck";
  }

  if (id === "postModificationBuildPassRate") {
    return "build";
  }

  return "lint";
}

function passesThreshold(
  value: number,
  definition: AgentQualityMetricDefinition,
  tier: AgentQualityMetricTier
): boolean {
  const threshold = definition.thresholds[tier];

  if (definition.direction === "min") {
    return value >= threshold;
  }

  if (definition.direction === "max") {
    return value <= threshold;
  }

  return value === threshold;
}

function metric(
  id: AgentQualityMetricId,
  label: string,
  direction: AgentQualityMetricDirection,
  mvp: number,
  usable: number,
  excellent: number
): AgentQualityMetricDefinition {
  return {
    id,
    label,
    direction,
    thresholds: {
      mvp,
      usable,
      excellent
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function isBuiltInToolPriority(value: unknown): value is BuiltInToolPriority {
  return value === "P0" || value === "P1" || value === "P2";
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

function isAgentToolSideEffect(value: unknown): value is AgentToolSideEffect {
  return (
    value === "none" ||
    value === "write" ||
    value === "delete" ||
    value === "move" ||
    value === "command" ||
    value === "git" ||
    value === "network" ||
    value === "memory"
  );
}

function isAgentTaskComplexity(value: unknown): value is AgentTaskComplexity {
  return value === "simple" || value === "medium" || value === "complex";
}

function isAgentValidationKind(value: unknown): value is AgentValidationKind {
  return value === "typecheck" || value === "build" || value === "lint";
}
