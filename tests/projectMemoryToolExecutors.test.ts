import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteProjectMemoryEntry,
  readProjectMemoryFile,
  searchProjectMemoryFile,
  writeProjectMemoryFile
} from "../src/main/builtInTools/projectMemoryToolExecutors.js";

test("project memory tool module keeps manual notes read-only while managing entries", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "forge-project-memory-tools-"));

  try {
    await writeFile(
      join(projectRoot, "MEMORY.md"),
      [
        "# MEMORY.md",
        "",
        "- Keep Forge commands PowerShell-safe.",
        "",
        "<!-- forge-memory:managed:start -->",
        "## Forge Managed Memories",
        "",
        '- <!-- forge-memory-entry id="ipc" createdAt="2026-06-15T09:00:00.000Z" updatedAt="2026-06-15T10:00:00.000Z" tags="architecture" --> Renderer file access goes through main-process IPC.',
        "",
        "<!-- forge-memory:managed:end -->",
        ""
      ].join("\n"),
      "utf8"
    );

    const initial = await readProjectMemoryFile(projectRoot);
    const written = await writeProjectMemoryFile(projectRoot, {
      id: "release-flow",
      content: "Use PR checks as release-flow evidence.",
      tags: ["auto-memory"]
    });
    const search = await searchProjectMemoryFile(projectRoot, "PowerShell release-flow");
    const deleted = await deleteProjectMemoryEntry(projectRoot, "release-flow");
    const afterDelete = await readProjectMemoryFile(projectRoot);
    const memoryMarkdown = await readFile(join(projectRoot, "MEMORY.md"), "utf8");

    assert.deepEqual(
      (initial.entries as Array<{ content: string; tags: string[] }>).map((entry) => ({
        content: entry.content,
        tags: entry.tags
      })),
      [
        {
          content: "Keep Forge commands PowerShell-safe.",
          tags: ["manual"]
        },
        {
          content: "Renderer file access goes through main-process IPC.",
          tags: ["architecture"]
        }
      ]
    );
    assert.equal((written.entry as { id: string }).id, "release-flow");
    assert.deepEqual(
      (search.matches as Array<{ id: string }>).map((entry) => entry.id),
      ["manual-1", "release-flow"]
    );
    assert.equal(deleted.deletedId, "release-flow");
    assert.deepEqual(
      (afterDelete.entries as Array<{ id: string }>).map((entry) => entry.id),
      ["manual-1", "ipc"]
    );
    assert.match(memoryMarkdown, /- Keep Forge commands PowerShell-safe\./u);
    assert.doesNotMatch(memoryMarkdown, /id="release-flow"/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
