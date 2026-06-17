// 本文件说明: 统一解析和渲染 Forge 项目 MEMORY.md 的手写记忆与托管记忆区块
import { redactSensitiveMemoryContent } from "./memoryRedaction.js";

export type ProjectMemoryMarkdownEntry = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
};

const projectMemoryManagedStartMarker = "<!-- forge-memory:managed:start -->";
const projectMemoryManagedEndMarker = "<!-- forge-memory:managed:end -->";
const projectMemoryEntryPrefix = "<!-- forge-memory-entry";
const maxProjectMemoryContentChars = 1_000;
const manualProjectMemoryTimestamp = "1970-01-01T00:00:00.000Z";
const ignoredManualProjectMemoryLines = new Set([
  "forge reads this file as project memory when scanning the workspace.",
  "forge may update the managed section silently during agent work. do not store secrets, tokens, cookies, private keys, or production credentials here.",
  "forge updates this section automatically. edit or delete entries when they are wrong.",
  "_no managed memories yet._"
]);

export function parseProjectMemoryMarkdownEntries(content: string): ProjectMemoryMarkdownEntry[] {
  return [
    ...parseManualProjectMemoryMarkdownEntries(content),
    ...parseManagedProjectMemoryMarkdownEntries(content)
  ];
}

export function parseManagedProjectMemoryMarkdownEntries(content: string): ProjectMemoryMarkdownEntry[] {
  const managedContent = readProjectMemoryManagedContent(content);

  if (!managedContent) {
    return [];
  }

  return managedContent
    .split(/\r?\n/u)
    .map((line) => parseProjectMemoryEntryLine(line.trim()))
    .filter((entry): entry is ProjectMemoryMarkdownEntry => Boolean(entry));
}

export function renderProjectMemoryMarkdown(
  currentContent: string | null,
  entries: ProjectMemoryMarkdownEntry[]
): string {
  const managedBlock = renderProjectMemoryManagedBlock(entries);

  if (!currentContent?.trim()) {
    return `${renderProjectMemoryDefaultHeader()}\n\n${managedBlock}\n`;
  }

  const normalizedContent = currentContent.replace(/\r\n/g, "\n").trimEnd();
  const startIndex = normalizedContent.indexOf(projectMemoryManagedStartMarker);
  const endIndex = normalizedContent.indexOf(projectMemoryManagedEndMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = normalizedContent.slice(0, startIndex).trimEnd();
    const after = normalizedContent
      .slice(endIndex + projectMemoryManagedEndMarker.length)
      .trimStart();

    return [
      before,
      managedBlock,
      after
    ].filter(Boolean).join("\n\n") + "\n";
  }

  return `${normalizedContent}\n\n${managedBlock}\n`;
}

function parseManualProjectMemoryMarkdownEntries(content: string): ProjectMemoryMarkdownEntry[] {
  return stripProjectMemoryManagedBlock(content)
    .split(/\r?\n/u)
    .map(normalizeManualProjectMemoryLine)
    .filter(Boolean)
    .slice(0, 20)
    .map((manualContent, index) => ({
      id: `manual-${index + 1}`,
      content: manualContent,
      createdAt: manualProjectMemoryTimestamp,
      updatedAt: manualProjectMemoryTimestamp,
      tags: ["manual"]
    }));
}

function stripProjectMemoryManagedBlock(content: string): string {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const startIndex = normalizedContent.indexOf(projectMemoryManagedStartMarker);
  const endIndex = normalizedContent.indexOf(projectMemoryManagedEndMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return normalizedContent;
  }

  return [
    normalizedContent.slice(0, startIndex),
    normalizedContent.slice(endIndex + projectMemoryManagedEndMarker.length)
  ].join("\n");
}

function normalizeManualProjectMemoryLine(line: string): string {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith("#") || trimmedLine.startsWith("<!--")) {
    return "";
  }

  const withoutListMarker = trimmedLine
    .replace(/^(?:[-*+]|\d+[.)])\s+/u, "")
    .replace(/^\[[ xX]\]\s+/u, "")
    .trim();
  const content = normalizeProjectMemoryContent(withoutListMarker);

  if (!content || ignoredManualProjectMemoryLines.has(content.toLocaleLowerCase())) {
    return "";
  }

  return content;
}

function readProjectMemoryManagedContent(content: string): string | null {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const startIndex = normalizedContent.indexOf(projectMemoryManagedStartMarker);
  const endIndex = normalizedContent.indexOf(projectMemoryManagedEndMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return normalizedContent.slice(
    startIndex + projectMemoryManagedStartMarker.length,
    endIndex
  );
}

function parseProjectMemoryEntryLine(line: string): ProjectMemoryMarkdownEntry | null {
  if (!line.startsWith(`- ${projectMemoryEntryPrefix}`)) {
    return null;
  }

  const match =
    /^- <!-- forge-memory-entry id="([^"]+)" createdAt="([^"]+)" updatedAt="([^"]+)" tags="([^"]*)" --> (.+)$/u.exec(
      line
    );

  if (!match) {
    return null;
  }

  const content = normalizeProjectMemoryContent(match[5]);

  if (!content) {
    return null;
  }

  return {
    id: match[1],
    createdAt: match[2],
    updatedAt: match[3],
    tags: normalizeProjectMemoryTags(match[4].split(",")),
    content
  };
}

function renderProjectMemoryDefaultHeader(): string {
  return [
    "# MEMORY.md",
    "",
    "Forge reads this file as project memory when scanning the workspace.",
    "Forge may update the managed section silently during agent work. Do not store secrets, tokens, cookies, private keys, or production credentials here."
  ].join("\n");
}

function renderProjectMemoryManagedBlock(entries: ProjectMemoryMarkdownEntry[]): string {
  const lines = [
    projectMemoryManagedStartMarker,
    "## Forge Managed Memories",
    "",
    "Forge updates this section automatically. Edit or delete entries when they are wrong.",
    ""
  ];

  if (entries.length === 0) {
    lines.push("_No managed memories yet._");
  } else {
    lines.push(...entries.map(renderProjectMemoryEntryLine));
  }

  lines.push("", projectMemoryManagedEndMarker);

  return lines.join("\n");
}

function renderProjectMemoryEntryLine(entry: ProjectMemoryMarkdownEntry): string {
  const tags = normalizeProjectMemoryTags(entry.tags).join(",");

  return [
    "-",
    `<!-- forge-memory-entry id="${entry.id}" createdAt="${entry.createdAt}" updatedAt="${entry.updatedAt}" tags="${tags}" -->`,
    entry.content
  ].join(" ");
}

function normalizeProjectMemoryContent(content: string): string {
  return redactSensitiveMemoryContent(content)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxProjectMemoryContentChars);
}

function normalizeProjectMemoryTags(tags: string[]): string[] {
  const seenTags = new Set<string>();
  const normalizedTags: string[] = [];

  for (const tag of tags) {
    const normalizedTag = tag
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40);

    if (!normalizedTag || seenTags.has(normalizedTag)) {
      continue;
    }

    seenTags.add(normalizedTag);
    normalizedTags.push(normalizedTag);
  }

  return normalizedTags.slice(0, 12);
}
