import test from "node:test";
import assert from "node:assert/strict";
import {
  parseManagedProjectMemoryMarkdownEntries,
  parseProjectMemoryMarkdownEntries,
  renderProjectMemoryMarkdown
} from "../src/shared/projectMemoryMarkdown.js";

test("project MEMORY.md parser reads manual notes and managed entries through one shared path", () => {
  const memoryMarkdown = [
    "# MEMORY.md",
    "",
    "Forge reads this file as project memory when scanning the workspace.",
    "- [x] Renderer must use main-process IPC and api_key=sk-test-secret-12345678.",
    "",
    "<!-- forge-memory:managed:start -->",
    "## Forge Managed Memories",
    "",
    '- <!-- forge-memory-entry id="managed-ipc" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="architecture,explicit" --> Managed memory keeps renderer file access behind IPC.',
    "",
    "<!-- forge-memory:managed:end -->",
    "",
    "Manual notes after the managed block are still recallable."
  ].join("\n");

  const entries = parseProjectMemoryMarkdownEntries(memoryMarkdown);

  assert.deepEqual(entries.map((entry) => entry.id), ["manual-1", "manual-2", "managed-ipc"]);
  assert.equal(
    entries[0]?.content,
    "Renderer must use main-process IPC and api_key=[redacted]"
  );
  assert.deepEqual(entries[0]?.tags, ["manual"]);
  assert.equal(entries[1]?.content, "Manual notes after the managed block are still recallable.");
  assert.deepEqual(entries[2]?.tags, ["architecture", "explicit"]);
  assert.deepEqual(
    parseManagedProjectMemoryMarkdownEntries(memoryMarkdown).map((entry) => entry.id),
    ["managed-ipc"]
  );
});

test("project MEMORY.md renderer replaces only the managed block", () => {
  const currentContent = [
    "# MEMORY.md",
    "",
    "Manual note before managed block stays in place.",
    "",
    "<!-- forge-memory:managed:start -->",
    "## Forge Managed Memories",
    "",
    '- <!-- forge-memory-entry id="old" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="old" --> Old managed memory.',
    "",
    "<!-- forge-memory:managed:end -->",
    "",
    "Manual note after managed block also stays in place."
  ].join("\n");

  const rendered = renderProjectMemoryMarkdown(currentContent, [
    {
      id: "new",
      content: "New managed memory.",
      createdAt: "2026-06-16T09:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z",
      tags: ["new", "explicit"]
    }
  ]);

  assert.match(rendered, /Manual note before managed block stays in place\./u);
  assert.match(rendered, /Manual note after managed block also stays in place\./u);
  assert.match(rendered, /id="new"/u);
  assert.match(rendered, /tags="new,explicit"/u);
  assert.doesNotMatch(rendered, /id="old"/u);
  assert.equal(rendered.endsWith("\n"), true);
});
