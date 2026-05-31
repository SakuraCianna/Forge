// 本文件说明: 主进程 项目文件服务测试
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  globProjectFiles,
  listProjectDirectory,
  previewProjectTextFileUpdate,
  readProjectTextFile,
  searchProjectTextFiles,
  writeProjectTextFile
} from "./projectFileService";

const testRoot = join(process.cwd(), ".tmp-test", "project-files");

describe("projectFileService", () => {
  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("reads a text file inside the selected project", async () => {
    await mkdir(join(testRoot, "src"), { recursive: true });
    await writeFile(join(testRoot, "src", "App.tsx"), "export const App = () => null;", "utf8");

    const result = await readProjectTextFile({
      projectRoot: testRoot,
      relativePath: "src/App.tsx"
    });

    expect(result).toEqual({
      relativePath: "src/App.tsx",
      content: "export const App = () => null;",
      size: 30
    });
  });

  it("rejects path traversal outside the selected project", async () => {
    await mkdir(testRoot, { recursive: true });

    await expect(
      readProjectTextFile({
        projectRoot: testRoot,
        relativePath: "../package.json"
      })
    ).rejects.toThrow("文件路径必须位于当前项目内");
  });

  it("rejects sensitive files before reading or writing content", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, ".env.local"), "OPENAI_API_KEY=secret", "utf8");

    await expect(
      readProjectTextFile({
        projectRoot: testRoot,
        relativePath: ".env.local"
      })
    ).rejects.toThrow("文件路径被安全策略保护");

    await expect(
      previewProjectTextFileUpdate({
        projectRoot: testRoot,
        relativePath: ".env.local",
        nextContent: "OPENAI_API_KEY=changed"
      })
    ).rejects.toThrow("文件路径被安全策略保护");

    await expect(
      writeProjectTextFile({
        projectRoot: testRoot,
        relativePath: "keys/service-account-prod.json",
        nextContent: "{}"
      })
    ).rejects.toThrow("文件路径被安全策略保护");
  });

  it("allows documented environment templates", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, ".env.example"), "OPENAI_API_KEY=\n", "utf8");

    const result = await readProjectTextFile({
      projectRoot: testRoot,
      relativePath: ".env.example"
    });

    expect(result.relativePath).toBe(".env.example");
    expect(result.content).toBe("OPENAI_API_KEY=\n");
  });

  it("lists project directories without reading file content or sensitive entries", async () => {
    await mkdir(join(testRoot, "src", "components"), { recursive: true });
    await mkdir(join(testRoot, "src", "node_modules"), { recursive: true });
    await writeFile(join(testRoot, "src", "App.tsx"), "export const App = true;", "utf8");
    await writeFile(join(testRoot, "src", ".env.local"), "SECRET=true", "utf8");
    await writeFile(join(testRoot, "src", "node_modules", "dep.ts"), "dep", "utf8");

    const result = await listProjectDirectory({
      projectRoot: testRoot,
      relativePath: "src"
    });

    expect(result).toEqual({
      relativePath: "src",
      entries: [
        {
          name: "App.tsx",
          relativePath: "src/App.tsx",
          kind: "file",
          size: 24
        },
        {
          name: "components",
          relativePath: "src/components",
          kind: "directory"
        }
      ],
      truncated: false
    });
  });

  it("truncates project directory listings at the configured limit", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "a.ts"), "", "utf8");
    await writeFile(join(testRoot, "b.ts"), "", "utf8");

    const result = await listProjectDirectory({
      projectRoot: testRoot,
      limit: 1
    });

    expect(result.entries).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("rejects directory traversal when listing project directories", async () => {
    await mkdir(testRoot, { recursive: true });

    await expect(
      listProjectDirectory({
        projectRoot: testRoot,
        relativePath: "../"
      })
    ).rejects.toThrow("目录路径不能包含上级目录");
  });

  it("searches project text files without exposing sensitive files", async () => {
    await mkdir(join(testRoot, "src"), { recursive: true });
    await writeFile(join(testRoot, "src", "App.tsx"), "const target = true;\n", "utf8");
    await writeFile(join(testRoot, ".env.local"), "TARGET_SECRET=secret\n", "utf8");

    const result = await searchProjectTextFiles({
      projectRoot: testRoot,
      query: "target"
    });

    expect(result).toEqual({
      query: "target",
      matches: [
        {
          relativePath: "src/App.tsx",
          lineNumber: 1,
          preview: "const target = true;"
        }
      ],
      truncated: false
    });
  });

  it("matches project files with glob patterns without reading content", async () => {
    await mkdir(join(testRoot, "src", "nested"), { recursive: true });
    await writeFile(join(testRoot, "src", "App.tsx"), "export const app = true;", "utf8");
    await writeFile(join(testRoot, "src", "nested", "Panel.tsx"), "export const panel = true;", "utf8");
    await writeFile(join(testRoot, "src", "state.ts"), "export const state = true;", "utf8");
    await writeFile(join(testRoot, ".env.local"), "SECRET=true", "utf8");

    const result = await globProjectFiles({
      projectRoot: testRoot,
      pattern: "src/**/*.tsx"
    });

    expect(result).toEqual({
      pattern: "src/**/*.tsx",
      matches: [
        {
          relativePath: "src/App.tsx",
          size: 24
        },
        {
          relativePath: "src/nested/Panel.tsx",
          size: 26
        }
      ],
      truncated: false
    });
  });

  it("normalizes bare glob patterns to search the whole project", async () => {
    await mkdir(join(testRoot, "src"), { recursive: true });
    await writeFile(join(testRoot, "src", "App.test.ts"), "test", "utf8");

    const result = await globProjectFiles({
      projectRoot: testRoot,
      pattern: "*.test.ts"
    });

    expect(result.matches.map((match) => match.relativePath)).toEqual(["src/App.test.ts"]);
    expect(result.pattern).toBe("**/*.test.ts");
  });

  it("truncates project glob results at the configured limit", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "a.ts"), "", "utf8");
    await writeFile(join(testRoot, "b.ts"), "", "utf8");

    const result = await globProjectFiles({
      projectRoot: testRoot,
      pattern: "*.ts",
      limit: 1
    });

    expect(result.matches).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("truncates project text search results at the configured limit", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "notes.txt"), "target one\ntarget two\n", "utf8");

    const result = await searchProjectTextFiles({
      projectRoot: testRoot,
      query: "target",
      limit: 1
    });

    expect(result.matches).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("rejects files over the configured size limit", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "large.txt"), "x".repeat(8), "utf8");

    await expect(
      readProjectTextFile({
        projectRoot: testRoot,
        relativePath: "large.txt",
        maxBytes: 4
      })
    ).rejects.toThrow("文件过大，无法预览");
  });

  it("previews a text file update with a line diff", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "notes.txt"), "old\nsame", "utf8");

    const preview = await previewProjectTextFileUpdate({
      projectRoot: testRoot,
      relativePath: "notes.txt",
      nextContent: "new\nsame"
    });

    expect(preview.relativePath).toBe("notes.txt");
    expect(preview.diff).toEqual([
      { kind: "remove", oldLineNumber: 1, text: "old" },
      { kind: "add", newLineNumber: 1, text: "new" },
      { kind: "context", oldLineNumber: 2, newLineNumber: 2, text: "same" }
    ]);
  });

  it("previews a new text file update from empty content", async () => {
    await mkdir(testRoot, { recursive: true });

    const preview = await previewProjectTextFileUpdate({
      projectRoot: testRoot,
      relativePath: "docs/usage.md",
      nextContent: "# Usage\n"
    });

    expect(preview).toEqual({
      relativePath: "docs/usage.md",
      currentContent: "",
      nextContent: "# Usage\n",
      diff: [
        { kind: "add", newLineNumber: 1, text: "# Usage" },
        { kind: "add", newLineNumber: 2, text: "" }
      ]
    });
  });

  it("writes a text file update inside the selected project", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "notes.txt"), "old", "utf8");

    await writeProjectTextFile({
      projectRoot: testRoot,
      relativePath: "notes.txt",
      nextContent: "new"
    });

    await expect(readFile(join(testRoot, "notes.txt"), "utf8")).resolves.toBe("new");
  });

  it("creates a new text file and missing parent directories inside the selected project", async () => {
    await mkdir(testRoot, { recursive: true });

    await writeProjectTextFile({
      projectRoot: testRoot,
      relativePath: "docs/usage.md",
      nextContent: "# Usage\n"
    });

    await expect(readFile(join(testRoot, "docs", "usage.md"), "utf8")).resolves.toBe(
      "# Usage\n"
    );
  });
});
