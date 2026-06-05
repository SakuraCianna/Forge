// 本文件说明: 从 Built-in Tool 元数据生成统一确认视图, 并解析确认上下文
import type {
  BuiltInToolConfirmation,
  BuiltInToolDefinition,
  BuiltInToolExecutionContext,
  BuiltInToolRiskLevel
} from "./builtInToolTypes.js";

export type BuiltInToolConfirmationView = {
  toolName: string;
  displayName: string;
  riskLevel: BuiltInToolRiskLevel;
  confirmationKind: BuiltInToolConfirmation["kind"] | "none";
  title: string;
  targetLabel: string;
  targetSummary: string;
  consequence: string;
  reversible: boolean;
  requiresTypedConfirmation: boolean;
  confirmationKeyword?: string;
};

export type BuiltInToolConfirmationResolution =
  | {
      ok: true;
      context: Pick<
        BuiltInToolExecutionContext,
        "confirmed" | "secondConfirmed" | "typedConfirmation"
      >;
    }
  | {
      ok: false;
      reason:
        | "confirmation_required"
        | "second_confirmation_required"
        | "typed_confirmation_required"
        | "typed_confirmation_mismatch";
      message: string;
    };

export function createBuiltInToolConfirmationView(
  definition: BuiltInToolDefinition,
  targetSummary: string
): BuiltInToolConfirmationView {
  const confirmation = definition.confirmation;

  return {
    toolName: definition.name,
    displayName: definition.displayName ?? definition.name,
    riskLevel: definition.riskLevel,
    confirmationKind: confirmation?.kind ?? "none",
    title: confirmation?.title ?? definition.displayName ?? definition.name,
    targetLabel: confirmation?.targetLabel ?? "target",
    targetSummary,
    consequence: confirmation?.consequence ?? definition.description,
    reversible: confirmation?.reversible ?? true,
    requiresTypedConfirmation: confirmation?.kind === "typed",
    ...(confirmation?.kind === "typed"
      ? { confirmationKeyword: confirmation.confirmationKeyword }
      : {})
  };
}

export function resolveBuiltInToolConfirmationContext(
  definition: BuiltInToolDefinition,
  context: Pick<
    BuiltInToolExecutionContext,
    "confirmed" | "secondConfirmed" | "typedConfirmation"
  >
): BuiltInToolConfirmationResolution {
  if (!definition.requiresConfirmation) {
    return { ok: true, context: {} };
  }

  if (!context.confirmed) {
    return {
      ok: false,
      reason: "confirmation_required",
      message: `Built-in tool ${definition.name} requires user confirmation before execution.`
    };
  }

  if (definition.riskLevel !== "critical") {
    return {
      ok: true,
      context: {
        confirmed: true,
        ...(context.secondConfirmed ? { secondConfirmed: true } : {})
      }
    };
  }

  if (definition.confirmation?.kind === "typed") {
    if (!context.typedConfirmation) {
      return {
        ok: false,
        reason: "typed_confirmation_required",
        message: `Built-in tool ${definition.name} requires typed confirmation before execution.`
      };
    }

    if (context.typedConfirmation !== definition.confirmation.confirmationKeyword) {
      return {
        ok: false,
        reason: "typed_confirmation_mismatch",
        message: `Typed confirmation for built-in tool ${definition.name} did not match.`
      };
    }

    return {
      ok: true,
      context: {
        confirmed: true,
        secondConfirmed: true,
        typedConfirmation: context.typedConfirmation
      }
    };
  }

  if (!context.secondConfirmed) {
    return {
      ok: false,
      reason: "second_confirmation_required",
      message: `Built-in tool ${definition.name} requires second confirmation before execution.`
    };
  }

  return {
    ok: true,
    context: {
      confirmed: true,
      secondConfirmed: true
    }
  };
}
