// 本文件说明: 将 Built-in Tool 映射到 Agent Profile 的粗粒度工具权限
import { getBuiltInToolDefinition } from "./builtInToolCatalog.js";
import { deriveAgentToolSideEffect } from "./agentQualityMetrics.js";
import type { AgentToolPermission } from "./agentTypes.js";
import type { BuiltInToolDefinition } from "./builtInToolTypes.js";

const auxiliaryWebTools = new Set([
  "fetchDocs",
  "fetchUrl",
  "inspectPageConsole",
  "openBrowserPreview",
  "takeScreenshot",
  "webSearch"
]);

const commandDiagnosticTools = new Set([
  "runBuild",
  "runLint",
  "runTargetedTest",
  "runTests",
  "runTypecheck"
]);

export function getRequiredAgentPermissionForBuiltInTool(
  toolName: string
): AgentToolPermission {
  return getRequiredAgentPermissionForBuiltInToolDefinition(getBuiltInToolDefinition(toolName));
}

export function getRequiredAgentPermissionForBuiltInToolDefinition(
  definition: BuiltInToolDefinition
): AgentToolPermission {
  if (definition.category === "terminal") {
    return "command";
  }

  if (definition.category === "git") {
    return "git";
  }

  if (definition.category === "diagnostics") {
    return commandDiagnosticTools.has(definition.name) ? "command" : "read";
  }

  if (definition.category === "auxiliary") {
    if (auxiliaryWebTools.has(definition.name)) {
      return "web";
    }

    const sideEffect = deriveAgentToolSideEffect(definition.name);

    return sideEffect === "none" ? "read" : "edit";
  }

  if (definition.category === "edit") {
    return "edit";
  }

  if (definition.category === "file") {
    const sideEffect = deriveAgentToolSideEffect(definition.name);

    return sideEffect === "none" ? "read" : "edit";
  }

  return "read";
}
