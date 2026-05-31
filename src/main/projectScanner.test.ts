// 本文件说明: 主进程 项目扫描器测试
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanProjectFiles } from "./projectScanner";

const testRoot = join(process.cwd(), ".tmp-test", "project-scanner");

describe("projectScanner", () => {
  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("scans project files while respecting gitignore and hiding repository internals", async () => {
    await mkdir(join(testRoot, "src"), { recursive: true });
    await mkdir(join(testRoot, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(testRoot, ".git"), { recursive: true });
    await mkdir(join(testRoot, "out"), { recursive: true });
    await writeFile(join(testRoot, ".gitignore"), "node_modules/\nout/\n", "utf8");
    await writeFile(join(testRoot, "package.json"), "{}", "utf8");
    await writeFile(join(testRoot, "src", "App.tsx"), "export {}", "utf8");
    await writeFile(join(testRoot, "node_modules", "pkg", "index.js"), "", "utf8");
    await writeFile(join(testRoot, ".git", "config"), "", "utf8");
    await writeFile(join(testRoot, "out", "bundle.js"), "", "utf8");

    const result = await scanProjectFiles(testRoot);

    expect(result.rootPath).toBe(testRoot);
    expect(result.files.map((file) => file.relativePath).sort()).toEqual([
      ".gitignore",
      "package.json",
      "src/App.tsx"
    ]);
  });

  it("supports gitignore negation for visible project files", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, ".gitignore"), "*.log\n!keep.log\n", "utf8");
    await writeFile(join(testRoot, "debug.log"), "hidden", "utf8");
    await writeFile(join(testRoot, "keep.log"), "visible", "utf8");
    await writeFile(join(testRoot, "notes.txt"), "visible", "utf8");

    const result = await scanProjectFiles(testRoot);

    expect(result.files.map((file) => file.relativePath).sort()).toEqual([
      ".gitignore",
      "keep.log",
      "notes.txt"
    ]);
  });

  it("hides sensitive files from the Agent project index", async () => {
    await mkdir(join(testRoot, ".ssh"), { recursive: true });
    await mkdir(join(testRoot, "src"), { recursive: true });
    await writeFile(join(testRoot, ".env.local"), "OPENAI_API_KEY=secret", "utf8");
    await writeFile(join(testRoot, ".env.example"), "OPENAI_API_KEY=\n", "utf8");
    await writeFile(join(testRoot, ".ssh", "id_rsa"), "private key", "utf8");
    await writeFile(join(testRoot, "src", "App.tsx"), "export {}", "utf8");

    const result = await scanProjectFiles(testRoot);

    expect(result.files.map((file) => file.relativePath).sort()).toEqual([
      ".env.example",
      "src/App.tsx"
    ]);
  });

  it("marks the result as truncated when it reaches the file limit", async () => {
    await mkdir(testRoot, { recursive: true });
    await writeFile(join(testRoot, "a.ts"), "", "utf8");
    await writeFile(join(testRoot, "b.ts"), "", "utf8");

    const result = await scanProjectFiles(testRoot, { limit: 1 });

    expect(result.files).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("does not truncate the project index by default", async () => {
    await mkdir(testRoot, { recursive: true });

    for (let index = 0; index < 520; index += 1) {
      await writeFile(join(testRoot, `file-${index}.ts`), "", "utf8");
    }

    const result = await scanProjectFiles(testRoot);

    expect(result.files).toHaveLength(520);
    expect(result.truncated).toBe(false);
  });

  it("reads project instruction files for agent context", async () => {
    await mkdir(join(testRoot, ".cursor", "rules"), { recursive: true });
    await writeFile(join(testRoot, "AGENTS.md"), "Use PowerShell-safe commands\n", "utf8");
    await writeFile(join(testRoot, "CLAUDE.md"), "Prefer concise answers\n", "utf8");
    await writeFile(join(testRoot, ".cursor", "rules", "style.mdc"), "Use React patterns\n", "utf8");

    const result = await scanProjectFiles(testRoot);

    expect(result.instructionFiles).toEqual([
      {
        relativePath: "AGENTS.md",
        content: "Use PowerShell-safe commands",
        truncated: false
      },
      {
        relativePath: "CLAUDE.md",
        content: "Prefer concise answers",
        truncated: false
      },
      {
        relativePath: ".cursor/rules/style.mdc",
        content: "Use React patterns",
        truncated: false
      }
    ]);
  });

  it("throws a readable error when the project path no longer exists", async () => {
    await expect(scanProjectFiles(join(testRoot, "missing"))).rejects.toThrow(
      "项目路径不存在"
    );
  });
});
