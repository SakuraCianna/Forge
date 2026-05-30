import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanProjectFiles } from "./projectScanner";

const testRoot = join(process.cwd(), ".tmp-test", "project-scanner");

describe("projectScanner", () => {
  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("scans project files while ignoring dependency and build folders", async () => {
    await mkdir(join(testRoot, "src"), { recursive: true });
    await mkdir(join(testRoot, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(testRoot, ".git"), { recursive: true });
    await mkdir(join(testRoot, "out"), { recursive: true });
    await writeFile(join(testRoot, "package.json"), "{}", "utf8");
    await writeFile(join(testRoot, "src", "App.tsx"), "export {}", "utf8");
    await writeFile(join(testRoot, "node_modules", "pkg", "index.js"), "", "utf8");
    await writeFile(join(testRoot, ".git", "config"), "", "utf8");
    await writeFile(join(testRoot, "out", "bundle.js"), "", "utf8");

    const result = await scanProjectFiles(testRoot);

    expect(result.rootPath).toBe(testRoot);
    expect(result.files.map((file) => file.relativePath).sort()).toEqual([
      "package.json",
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
      "Project path does not exist"
    );
  });
});
