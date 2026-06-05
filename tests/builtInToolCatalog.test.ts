import test from "node:test";
import assert from "node:assert/strict";
import {
  builtInToolCategories,
  builtInToolDefinitions,
  canAutoExecuteBuiltInTool,
  getBuiltInToolDefinition
} from "../src/shared/builtInToolCatalog.js";

const expectedToolNames = [
  "getProjectTree",
  "getProjectSummary",
  "getProjectMetadata",
  "getEntrypoints",
  "getDependencyGraph",
  "getFileSymbols",
  "findReferences",
  "getRelatedFiles",
  "listFiles",
  "readFile",
  "readManyFiles",
  "readFileChunk",
  "statFile",
  "detectFileType",
  "createFile",
  "deleteFile",
  "moveFile",
  "copyFile",
  "searchText",
  "globFiles",
  "searchRegex",
  "searchSemantic",
  "searchDiagnostics",
  "proposeEdit",
  "applyEdit",
  "applyPatch",
  "replaceText",
  "insertText",
  "formatFile",
  "revertFile",
  "previewDiff",
  "runCommand",
  "stopCommand",
  "listRunningCommands",
  "runPackageScript",
  "installDependency",
  "detectPackageManager",
  "getGitStatus",
  "getGitDiff",
  "getGitLog",
  "getGitBlame",
  "createCommit",
  "createBranch",
  "checkoutBranch",
  "createWorktree",
  "revertChanges",
  "gitPush",
  "getDiagnostics",
  "runTypecheck",
  "runLint",
  "runBuild",
  "runTests",
  "runTargetedTest",
  "parseErrorLog",
  "suggestValidationPlan",
  "webSearch",
  "fetchUrl",
  "fetchDocs",
  "openBrowserPreview",
  "takeScreenshot",
  "inspectPageConsole",
  "readProjectMemory",
  "writeProjectMemory",
  "searchMemory",
  "deleteMemory",
  "readProjectInstructions",
  "createProjectInstructions",
  "updateProjectInstructions",
  "getContextBudget",
  "summarizeContext"
] as const;

test("built-in tool catalog contains all 70 tools with required metadata", () => {
  assert.equal(builtInToolDefinitions.length, 70);
  assert.deepEqual(
    builtInToolDefinitions.map((tool) => tool.name),
    [...expectedToolNames]
  );
  assert.deepEqual(
    builtInToolCategories.map((category) => category.id),
    [
      "project",
      "file",
      "search",
      "edit",
      "terminal",
      "git",
      "diagnostics",
      "auxiliary"
    ]
  );

  for (const tool of builtInToolDefinitions) {
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.description.length > 0);
    assert.ok(tool.inputSchema);
    assert.ok(tool.outputSchema);
    assert.ok(["available", "not_implemented"].includes(tool.availability));
  }
});

test("all registered built-in tools are available", () => {
  assert.deepEqual(
    builtInToolDefinitions
      .filter((tool) => tool.availability !== "available")
      .map((tool) => tool.name),
    []
  );
});

test("high and critical mutation tools require confirmation even in full access mode", () => {
  const blockedTools = [
    "applyEdit",
    "applyPatch",
    "deleteFile",
    "moveFile",
    "revertFile",
    "installDependency",
    "createCommit",
    "checkoutBranch",
    "revertChanges",
    "gitPush"
  ];

  for (const toolName of blockedTools) {
    const definition = getBuiltInToolDefinition(toolName);

    assert.equal(definition.requiresConfirmation, true, toolName);
    assert.equal(
      canAutoExecuteBuiltInTool(definition, { fullAccess: true, confirmed: false }),
      false,
      toolName
    );
  }
});

test("all side-effect tools are blocked before confirmation even in full access mode", () => {
  const sideEffectTools = [
    "createFile",
    "deleteFile",
    "moveFile",
    "copyFile",
    "applyEdit",
    "applyPatch",
    "replaceText",
    "insertText",
    "formatFile",
    "revertFile",
    "runCommand",
    "stopCommand",
    "runPackageScript",
    "installDependency",
    "createCommit",
    "createBranch",
    "checkoutBranch",
    "createWorktree",
    "revertChanges",
    "gitPush",
    "runTypecheck",
    "runLint",
    "runBuild",
    "runTests",
    "runTargetedTest",
    "writeProjectMemory",
    "deleteMemory",
    "createProjectInstructions",
    "updateProjectInstructions"
  ];

  for (const toolName of sideEffectTools) {
    const definition = getBuiltInToolDefinition(toolName);

    assert.equal(definition.requiresConfirmation, true, toolName);
    assert.equal(
      canAutoExecuteBuiltInTool(definition, { fullAccess: true, confirmed: false }),
      false,
      toolName
    );
  }
});

test("confirmation-gated tools expose review metadata for the UI", () => {
  const gatedTools = builtInToolDefinitions.filter((tool) => tool.requiresConfirmation);

  assert.ok(gatedTools.length > 0);

  for (const definition of gatedTools) {
    assert.ok(definition.confirmation, definition.name);
    assert.ok(definition.confirmation.title.length > 0, definition.name);
    assert.ok(definition.confirmation.consequence.length > 0, definition.name);
    assert.equal(typeof definition.confirmation.reversible, "boolean", definition.name);
  }
});

test("critical tools reserve typed second confirmation metadata", () => {
  const criticalTools = ["deleteFile", "checkoutBranch", "revertChanges", "gitPush", "deleteMemory"];

  for (const toolName of criticalTools) {
    const definition = getBuiltInToolDefinition(toolName);

    assert.equal(definition.riskLevel, "critical", toolName);
    assert.equal(definition.confirmation?.kind, "typed", toolName);
    assert.equal(typeof definition.confirmation?.confirmationKeyword, "string", toolName);
  }
});

test("low-risk P2 analysis helpers are available instead of safe stubs", () => {
  for (const toolName of [
    "getDependencyGraph",
    "searchSemantic",
    "searchDiagnostics",
    "suggestValidationPlan"
  ]) {
    const definition = getBuiltInToolDefinition(toolName);

    assert.equal(definition.availability, "available", toolName);
    assert.equal(definition.riskLevel, "low", toolName);
    assert.equal(definition.requiresConfirmation, false, toolName);
  }
});

test("safe web and browser helpers are available instead of safe stubs", () => {
  for (const toolName of [
    "fetchUrl",
    "fetchDocs",
    "openBrowserPreview",
    "takeScreenshot",
    "inspectPageConsole"
  ]) {
    const definition = getBuiltInToolDefinition(toolName);

    assert.equal(definition.availability, "available", toolName);
    assert.equal(definition.riskLevel, "medium", toolName);
  }
});

test("terminal recovery helpers are available instead of safe stubs", () => {
  const definition = getBuiltInToolDefinition("listRunningCommands");

  assert.equal(definition.availability, "available");
  assert.equal(definition.riskLevel, "low");
  assert.equal(definition.requiresConfirmation, false);
});
