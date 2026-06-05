// 本文件说明: 将 70 个 Built-in Tools 压缩成模型可读的工具目录提示
import {
  builtInToolCategories,
  builtInToolDefinitions
} from "./builtInToolCatalog.js";
import type {
  BuiltInToolAvailability,
  BuiltInToolCategory,
  BuiltInToolDefinition
} from "./builtInToolTypes.js";

type FormatBuiltInToolPromptOptions = {
  includeUnavailable?: boolean;
};

const categoryOrder = new Map<BuiltInToolCategory, number>(
  builtInToolCategories.map((category, index) => [category.id, index])
);

export function formatBuiltInToolCatalogForPrompt({
  includeUnavailable = true
}: FormatBuiltInToolPromptOptions = {}): string {
  const tools = [...builtInToolDefinitions]
    .filter((tool) => includeUnavailable || tool.availability === "available")
    .sort((left, right) => {
      const categoryDelta =
        (categoryOrder.get(left.category) ?? 999) - (categoryOrder.get(right.category) ?? 999);

      return categoryDelta || left.name.localeCompare(right.name);
    });

  const toolLines = tools.map(formatBuiltInToolLine).join("\n");

  return [
    "Forge Built-in Tools:",
    "Use low-risk read/inspect tools before planning edits. Do not use shell commands for reading, globbing, searching, git status, or diagnostics when a built-in tool exists.",
    "Before any code or file mutation, first read the relevant file(s). For multi-file edits, plan previewDiff or proposeEdit before applyEdit/applyPatch.",
    "Never read, search, summarize, or inject sensitive project files such as .env, private keys, certificates, tokens, cookies, or credential directories into context.",
    "After any write, delete, move, dependency, or Git mutation, include a concrete validation step when the Agent profile requires verification.",
    'Structured plan format: { "kind": "other", "tool": "built_in_tool", "toolName": "<exactName>", "input": { ... } }.',
    "High and critical tools require user confirmation. Full Access does not bypass write, delete, patch, dependency, commit, branch, revert, or push confirmation.",
    "critical tools require typed second confirmation. Never mark them as done until Forge returns a success result.",
    "If a tool is not_implemented, do not pretend it succeeded; choose another available tool, stop, or ask the user.",
    "Fields: name | category | risk | confirmation | availability | summary",
    toolLines
  ].join("\n");
}

function formatBuiltInToolLine(tool: BuiltInToolDefinition): string {
  return [
    `- ${tool.name}`,
    tool.category,
    tool.riskLevel,
    tool.requiresConfirmation ? "confirm" : "auto-low-only",
    formatAvailability(tool.availability),
    compactWhitespace(tool.description)
  ].join(" | ");
}

function formatAvailability(availability: BuiltInToolAvailability): string {
  return availability === "available" ? "available" : "not_implemented";
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
