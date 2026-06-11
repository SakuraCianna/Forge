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
  const previewStep = steps.find((step) => step.builtInToolName === "previewDiff");
  const editStep = steps.find((step) => step.builtInToolName === "applyEdit");
  const editAction = actions.find((action) => action.builtInToolName === "applyEdit");

  assert.equal(steps[0]?.kind, "inspect");
  assert.equal(steps[0]?.target, ".");
  assert.equal(previewStep?.builtInToolName, "previewDiff");
  assert.equal(previewStep?.builtInToolRiskLevel, "low");
  assert.equal(previewStep?.requiresConfirmation, false);
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

  assert.equal(steps.length, 4);
  assert.equal(steps[0]?.kind, "inspect");
  assert.equal(steps[0]?.target, ".");
  assert.equal(steps[1]?.builtInToolName, "previewDiff");
  assert.equal(steps[2]?.builtInToolName, "applyEdit");
  assert.equal(steps[3]?.kind, "verify");
  assert.equal(steps[3]?.target, "npm run build");
});

test("direct applyEdit plans gain a previewDiff step before mutation", () => {
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

  assert.equal(steps[0]?.kind, "inspect");
  assert.equal(steps[1]?.builtInToolName, "previewDiff");
  assert.deepEqual(steps[1]?.builtInToolInput, {
    relativePath: "src/main/index.ts",
    nextContent: "updated"
  });
  assert.equal(steps[2]?.builtInToolName, "applyEdit");
});

test("direct applyEdit plans keep an existing same-file preview", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "other",
          tool: "built_in_tool",
          toolName: "previewDiff",
          input: {
            relativePath: "src/main/index.ts",
            nextContent: "updated"
          }
        },
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

  assert.equal(steps.filter((step) => step.builtInToolName === "previewDiff").length, 1);
  assert.equal(steps[0]?.builtInToolName, "previewDiff");
  assert.equal(steps[1]?.builtInToolName, "applyEdit");
});

test("applyPatch plans do not receive invalid previewDiff input", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "other",
          tool: "built_in_tool",
          toolName: "applyPatch",
          input: {
            patch: "--- a/src/main.ts\n+++ b/src/main.ts\n@@\n-old\n+new\n"
          }
        }
      ]
    })
  );

  assert.equal(steps.some((step) => step.builtInToolName === "previewDiff"), false);
  assert.equal(steps.at(-1)?.builtInToolName, "applyPatch");
});

test("required verification policy infers Backend Maven verification", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "edit",
          description: "Update the backend controller",
          target: "Backend/src/main/java/com/example/student/StudentController.java"
        }
      ]
    }),
    4,
    "require"
  );

  assert.equal(steps.at(-1)?.kind, "verify");
  assert.equal(steps.at(-1)?.target, "mvn -f Backend/pom.xml test");
});

test("required verification policy infers nested frontend builds", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "edit",
          description: "Update the Vue page",
          target: "Frontend/src/App.vue"
        }
      ]
    }),
    4,
    "require"
  );

  assert.equal(steps.at(-1)?.kind, "verify");
  assert.equal(steps.at(-1)?.target, "npm --prefix Frontend run build");
});

test("required verification policy falls back to git status for documentation edits", () => {
  const steps = parseAgentPlanSteps(
    JSON.stringify({
      steps: [
        {
          kind: "edit",
          description: "Document the runtime policy",
          target: "docs/AGENT_RUNTIME.md"
        }
      ]
    }),
    4,
    "require"
  );

  assert.equal(steps.at(-1)?.kind, "verify");
  assert.equal(steps.at(-1)?.target, "git status --short");
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
