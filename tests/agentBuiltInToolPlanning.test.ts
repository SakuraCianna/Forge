import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentPlanSteps } from "../src/main/agentPlanService.js";
import { createAgentActionsFromPlanSteps } from "../src/shared/agentExecutionPlan.js";

test("structured built-in tool plan steps become executable built-in actions", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "other",
          tool: "built_in_tool",
          toolName: "readFile",
          input: {
            path: "src/main/index.ts"
          }
        }
      ]
    })
  );
  const actions = createAgentActionsFromPlanSteps(steps);

  assert.equal(steps[0]?.builtInToolName, "readFile");
  assert.deepEqual(steps[0]?.builtInToolInput, {
    path: "src/main/index.ts",
    relativePath: "src/main/index.ts"
  });
  assert.equal(actions[0]?.kind, "built-in-tool");
  assert.equal(actions[0]?.builtInToolName, "readFile");
  assert.equal(actions[0]?.requiresConfirmation, false);
});

test("direct tool names are recognized as built-in tools", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "other",
          tool: "searchText",
          query: "BuiltInTool"
        }
      ]
    })
  );
  const actions = createAgentActionsFromPlanSteps(steps);

  assert.equal(steps[0]?.builtInToolName, "searchText");
  assert.deepEqual(steps[0]?.builtInToolInput, {
    query: "BuiltInTool"
  });
  assert.equal(actions[0]?.kind, "built-in-tool");
  assert.equal(actions[0]?.builtInToolName, "searchText");
});

test("high-risk built-in tool actions keep confirmation metadata", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "other",
          tool: "built_in_tool",
          toolName: "applyEdit",
          input: {
            relativePath: "src/main/index.ts",
            nextContent: "updated"
          }
        }
      ]
    })
  );
  const actions = createAgentActionsFromPlanSteps(steps);
  const editStep = steps.find((step) => step.builtInToolName === "applyEdit");
  const editAction = actions.find((action) => action.kind === "built-in-tool");

  assert.equal(steps[0]?.kind, "inspect");
  assert.equal(steps[0]?.target, ".");
  assert.equal(editStep?.builtInToolName, "applyEdit");
  assert.equal(editStep?.builtInToolRiskLevel, "high");
  assert.equal(editStep?.requiresConfirmation, true);
  assert.equal(editAction?.builtInToolName, "applyEdit");
  assert.equal(editAction?.builtInToolRiskLevel, "high");
  assert.equal(editAction?.requiresConfirmation, true);
});

test("required verification policy treats mutating built-in tools as project changes", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "other",
          tool: "built_in_tool",
          toolName: "applyEdit",
          input: {
            relativePath: "src/main/index.ts",
            nextContent: "updated"
          }
        }
      ]
    }),
    4,
    "require"
  );

  assert.equal(steps.length, 3);
  assert.equal(steps[0]?.kind, "inspect");
  assert.equal(steps[0]?.target, ".");
  assert.equal(steps[1]?.builtInToolName, "applyEdit");
  assert.equal(steps[2]?.kind, "verify");
  assert.equal(steps[2]?.target, "git status");
});

test("mutating file plans gain a project inspection step before edits", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "edit",
          description: "Update the application entrypoint",
          target: "src/main.ts"
        },
        {
          kind: "verify",
          description: "Run the build",
          target: "npm run build"
        }
      ]
    }),
    4,
    "suggest"
  );
  const actions = createAgentActionsFromPlanSteps(steps);

  assert.equal(steps[0]?.kind, "inspect");
  assert.equal(steps[0]?.target, ".");
  assert.equal(steps[1]?.kind, "edit");
  assert.equal(actions[0]?.kind, "list-directory");
  assert.equal(actions[0]?.target, ".");
});

test("mutating file plans keep an existing discovery step", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "inspect",
          description: "Read package configuration",
          target: "package.json"
        },
        {
          kind: "edit",
          description: "Update the application entrypoint",
          target: "src/main.ts"
        }
      ]
    }),
    4,
    "suggest"
  );

  assert.equal(steps.length, 2);
  assert.equal(steps[0]?.target, "package.json");
  assert.equal(steps[1]?.target, "src/main.ts");
});
