import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  deleteProjectFile,
  listProjectDirectory,
  previewProjectTextFileUpdate,
  searchProjectTextFiles
} from "./projectFileService";

describe("previewProjectTextFileUpdate", () => {
  it("marks missing files as create previews", async () => {
    const projectRoot = await createTempProject();

    try {
      const preview = await previewProjectTextFileUpdate({
        projectRoot,
        relativePath: "docs/new-note.md",
        nextContent: "# New note\n"
      });

      expect(preview.changeKind).toBe("create");
      expect(preview.currentContent).toBe("");
      expect(preview.relativePath).toBe("docs/new-note.md");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("marks existing file rewrites as edits, even when the new content is empty", async () => {
    const projectRoot = await createTempProject();

    try {
      await writeFile(join(projectRoot, "README.md"), "# Existing\n", "utf8");

      const preview = await previewProjectTextFileUpdate({
        projectRoot,
        relativePath: "README.md",
        nextContent: ""
      });

      expect(preview.changeKind).toBe("edit");
      expect(preview.currentContent).toBe("# Existing\n");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("deleteProjectFile", () => {
  it("deletes a normal project file and returns a delete result", async () => {
    const projectRoot = await createTempProject();

    try {
      await mkdir(join(projectRoot, "docs"), { recursive: true });
      await writeFile(join(projectRoot, "docs", "old.md"), "remove me", "utf8");

      const result = await deleteProjectFile({
        projectRoot,
        relativePath: "docs/old.md"
      });

      expect(result).toEqual({
        relativePath: "docs/old.md",
        size: 9
      });
      await expect(readFile(join(projectRoot, "docs", "old.md"), "utf8")).rejects.toMatchObject({
        code: "ENOENT"
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("refuses to delete paths that resolve outside the project", async () => {
    const projectRoot = await createTempProject();
    const outsideRoot = await createTempProject();

    try {
      const outsideFile = join(outsideRoot, "secret.txt");
      await writeFile(outsideFile, "keep", "utf8");

      await expect(
        deleteProjectFile({
          projectRoot,
          relativePath: relative(projectRoot, outsideFile)
        })
      ).rejects.toThrow("File path must stay inside the selected project");
      await expect(readFile(outsideFile, "utf8")).resolves.toBe("keep");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });
});

describe("listProjectDirectory", () => {
  it("keeps Agent directory lists gitignore-aware by default but can show ignored files for UI navigation", async () => {
    const projectRoot = await createTempProject();

    try {
      await writeFile(join(projectRoot, ".gitignore"), "ignored.txt\n.env\n", "utf8");
      await writeFile(join(projectRoot, "README.md"), "# Project\n", "utf8");
      await writeFile(join(projectRoot, "ignored.txt"), "visible only for the file tree\n", "utf8");
      await writeFile(join(projectRoot, ".env"), "SECRET=keep-local\n", "utf8");

      const agentResult = await listProjectDirectory({ projectRoot });
      const uiResult = await listProjectDirectory({ projectRoot, includeGitIgnored: true });

      expect(agentResult.entries.map((entry) => entry.relativePath)).toEqual([
        ".gitignore",
        "README.md"
      ]);
      expect(uiResult.entries.map((entry) => entry.relativePath)).toEqual([
        ".gitignore",
        "ignored.txt",
        "README.md"
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("paginates visible directory entries after sensitive path filtering", async () => {
    const projectRoot = await createTempProject();

    try {
      await writeFile(join(projectRoot, ".env"), "SECRET=skip\n", "utf8");
      await writeFile(join(projectRoot, "a.txt"), "A", "utf8");
      await writeFile(join(projectRoot, "b.txt"), "B", "utf8");
      await writeFile(join(projectRoot, "c.txt"), "C", "utf8");

      const firstPage = await listProjectDirectory({
        projectRoot,
        limit: 1,
        offset: 1
      });
      const secondPage = await listProjectDirectory({
        projectRoot,
        limit: 1,
        offset: firstPage.nextOffset
      });

      expect(firstPage).toMatchObject({
        entries: [{ relativePath: "b.txt" }],
        nextOffset: 2,
        truncated: true
      });
      expect(secondPage).toMatchObject({
        entries: [{ relativePath: "c.txt" }],
        truncated: false
      });
      expect(secondPage.nextOffset).toBeUndefined();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("searchProjectTextFiles", () => {
  it("uses the local text index while preserving gitignore and sensitive path filters", async () => {
    const projectRoot = await createTempProject();

    try {
      await mkdir(join(projectRoot, "docs"), { recursive: true });
      await writeFile(join(projectRoot, ".gitignore"), "ignored.md\n", "utf8");
      await writeFile(join(projectRoot, ".env"), "NEEDLE=secret\n", "utf8");
      await writeFile(join(projectRoot, "ignored.md"), "needle hidden\n", "utf8");
      await writeFile(
        join(projectRoot, "docs", "visible.md"),
        "needle first line\nsecond needle line\n",
        "utf8"
      );

      const firstResult = await searchProjectTextFiles({
        projectRoot,
        query: "needle",
        limit: 1
      });
      const secondResult = await searchProjectTextFiles({
        projectRoot,
        query: "second",
        limit: 5
      });

      expect(firstResult).toEqual({
        query: "needle",
        matches: [
          {
            relativePath: "docs/visible.md",
            lineNumber: 1,
            preview: "needle first line"
          }
        ],
        truncated: true
      });
      expect(secondResult.matches).toEqual([
        {
          relativePath: "docs/visible.md",
          lineNumber: 2,
          preview: "second needle line"
        }
      ]);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

async function createTempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "forge-project-file-service-"));
}
