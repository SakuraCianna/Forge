// 本文件说明: 定义开发 QA 沙箱中 Built-in Tool 验证运行的结构化结果
import type { BuiltInToolCallStatus } from "./builtInToolTypes.js";

export type BuiltInToolQaScenarioStatus = BuiltInToolCallStatus | "skipped";

export type BuiltInToolQaSafetyAssertionKind =
  | "critical_typed_confirmation"
  | "write_before_confirmation";

export type BuiltInToolQaRunRequest = {
  browserPreviewUrl?: string;
  includeBrowserChecks?: boolean;
  includeMutationChecks?: boolean;
  includeWebChecks?: boolean;
  projectRoot?: string;
  modelId?: string;
};

export type BuiltInToolQaMetricGate = {
  label: string;
  numerator: number;
  denominator: number;
  value: number | null;
  threshold: number;
  direction: "min" | "max" | "equal";
  passed: boolean | null;
};

export type BuiltInToolQaScenarioResult = {
  id: string;
  toolName: string;
  status: BuiltInToolQaScenarioStatus;
  durationMs: number;
  inputSummary: string;
  outputSummary?: string;
  errorMessage?: string;
  safetyAssertion?: {
    kind: BuiltInToolQaSafetyAssertionKind;
    passed: boolean;
    message: string;
    fileUnchanged?: boolean;
  };
};

export type BuiltInToolQaRunResult = {
  kind: "development-built-in-tool-qa";
  projectRoot: string;
  modelId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "passed" | "failed" | "skipped";
  skippedReason?: string;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    blocked: number;
    notImplemented: number;
    skipped: number;
    successRate: number;
    safety: {
      total: number;
      passed: number;
      failed: number;
      writeBeforeConfirmationFailures: number;
      criticalConfirmationFailures: number;
    };
    coverage: {
      registeredTools: number;
      availableTools: number;
      notImplementedTools: number;
      p0Tools: number;
      p1Tools: number;
      p2Tools: number;
      scenarioTools: number;
      attemptedScenarioTools: number;
      succeededScenarioTools: number;
      p0ScenarioTools: number;
      p1ScenarioTools: number;
      p2ScenarioTools: number;
        p0SucceededScenarioTools: number;
        p1SucceededScenarioTools: number;
        p2SucceededScenarioTools: number;
      };
      quality: {
        toolCallSuccessRate: BuiltInToolQaMetricGate;
        p0ToolErrorRate: BuiltInToolQaMetricGate;
        writeBeforeConfirmationFailureRate: BuiltInToolQaMetricGate;
        criticalConfirmationFailureRate: BuiltInToolQaMetricGate;
        mvpPassed: boolean;
      };
    };
  scenarios: BuiltInToolQaScenarioResult[];
};
