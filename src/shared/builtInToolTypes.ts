// 本文件说明: 定义 Forge 内置工具的统一元数据, 风险, 确认和审计类型
export type BuiltInToolCategory =
  | "project"
  | "file"
  | "search"
  | "edit"
  | "terminal"
  | "git"
  | "diagnostics"
  | "auxiliary";

export type BuiltInToolRiskLevel = "low" | "medium" | "high" | "critical";

export type BuiltInToolAvailability = "available" | "not_implemented";

export type BuiltInToolPriority = "P0" | "P1" | "P2";

export type BuiltInToolCallStatus =
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled"
  | "not_implemented";

export type BuiltInToolConfirmation =
  | {
      kind: "single";
      title: string;
      consequence: string;
      reversible: boolean;
      targetLabel?: string;
    }
  | {
      kind: "double";
      title: string;
      consequence: string;
      reversible: boolean;
      targetLabel?: string;
    }
  | {
      kind: "typed";
      title: string;
      consequence: string;
      reversible: boolean;
      targetLabel: string;
      confirmationKeyword: string;
    };

export type BuiltInToolDefinition = {
  name: string;
  displayName?: string;
  description: string;
  category: BuiltInToolCategory;
  riskLevel: BuiltInToolRiskLevel;
  requiresConfirmation: boolean;
  inputSchema: unknown;
  outputSchema: unknown;
  availability: BuiltInToolAvailability;
  priority: BuiltInToolPriority;
  confirmation?: BuiltInToolConfirmation;
};

export type BuiltInToolCategoryDefinition = {
  id: BuiltInToolCategory;
  label: string;
  description: string;
};

export type BuiltInToolCatalogSnapshot = {
  categories: BuiltInToolCategoryDefinition[];
  tools: BuiltInToolDefinition[];
};

export type BuiltInToolExecutionContext = {
  projectRoot?: string | null;
  threadId?: string;
  confirmed?: boolean;
  fullAccess?: boolean;
  secondConfirmed?: boolean;
  typedConfirmation?: string;
};

export type BuiltInToolExecutionRequest = {
  toolName: string;
  input?: Record<string, unknown>;
  projectRoot?: string | null;
  threadId?: string;
  confirmed?: boolean;
  fullAccess?: boolean;
  secondConfirmed?: boolean;
  typedConfirmation?: string;
};

export type BuiltInTool = BuiltInToolDefinition & {
  execute: (
    input: Record<string, unknown>,
    context: BuiltInToolExecutionContext
  ) => Promise<unknown>;
};

export type BuiltInToolCallLogRecord = {
  id: string;
  toolName: string;
  category: BuiltInToolCategory;
  riskLevel: BuiltInToolRiskLevel;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: BuiltInToolCallStatus;
  threadId?: string;
  targetSummary?: string;
  errorMessage?: string;
};

export type NotImplementedToolResult = {
  status: "not_implemented";
  toolName: string;
  message: string;
  suggestedNextStep: string;
};

export type BuiltInToolBlockedResult = {
  status: "blocked";
  toolName: string;
  message: string;
  confirmation?: BuiltInToolConfirmation;
};

export type BuiltInToolFailureResult = {
  status: "failed";
  toolName: string;
  error: {
    code: "executor_missing" | "tool_execution_failed";
    message: string;
    recoverable: boolean;
  };
};
