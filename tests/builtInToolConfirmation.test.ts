import test from "node:test";
import assert from "node:assert/strict";
import { getBuiltInToolDefinition } from "../src/shared/builtInToolCatalog.js";
import {
  createBuiltInToolConfirmationView,
  resolveBuiltInToolConfirmationContext
} from "../src/shared/builtInToolConfirmation.js";

test("critical typed tools expose the target, consequence, reversibility and keyword in confirmation view", () => {
  const definition = getBuiltInToolDefinition("gitPush");
  const view = createBuiltInToolConfirmationView(definition, "origin/codex/Forge");

  assert.equal(view.toolName, "gitPush");
  assert.equal(view.riskLevel, "critical");
  assert.equal(view.confirmationKind, "typed");
  assert.equal(view.targetLabel, "远程/分支");
  assert.equal(view.targetSummary, "origin/codex/Forge");
  assert.equal(view.consequence, "会把本地提交推送到远程仓库。");
  assert.equal(view.reversible, false);
  assert.equal(view.requiresTypedConfirmation, true);
  assert.equal(view.confirmationKeyword, "PUSH");
});

test("critical typed confirmation must match before execution context can pass", () => {
  const definition = getBuiltInToolDefinition("deleteFile");

  assert.deepEqual(resolveBuiltInToolConfirmationContext(definition, { confirmed: false }), {
    ok: false,
    reason: "confirmation_required",
    message: "Built-in tool deleteFile requires user confirmation before execution."
  });
  assert.deepEqual(resolveBuiltInToolConfirmationContext(definition, { confirmed: true }), {
    ok: false,
    reason: "typed_confirmation_required",
    message: "Built-in tool deleteFile requires typed confirmation before execution."
  });
  assert.deepEqual(
    resolveBuiltInToolConfirmationContext(definition, {
      confirmed: true,
      typedConfirmation: "wrong"
    }),
    {
      ok: false,
      reason: "typed_confirmation_mismatch",
      message: "Typed confirmation for built-in tool deleteFile did not match."
    }
  );
  assert.deepEqual(
    resolveBuiltInToolConfirmationContext(definition, {
      confirmed: true,
      typedConfirmation: "DELETE"
    }),
    {
      ok: true,
      context: {
        confirmed: true,
        secondConfirmed: true,
        typedConfirmation: "DELETE"
      }
    }
  );
});

test("full access satisfies built-in tool confirmation without typed input", () => {
  const definition = getBuiltInToolDefinition("deleteFile");

  assert.deepEqual(resolveBuiltInToolConfirmationContext(definition, { fullAccess: true }), {
    ok: true,
    context: {
      confirmed: true,
      secondConfirmed: true
    }
  });
});

test("high-risk non-critical tools still require confirmation but not typed confirmation", () => {
  const definition = getBuiltInToolDefinition("applyEdit");

  assert.deepEqual(resolveBuiltInToolConfirmationContext(definition, { confirmed: false }), {
    ok: false,
    reason: "confirmation_required",
    message: "Built-in tool applyEdit requires user confirmation before execution."
  });
  assert.deepEqual(resolveBuiltInToolConfirmationContext(definition, { confirmed: true }), {
    ok: true,
    context: {
      confirmed: true
    }
  });
});
