import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanProjectFiles } from "./projectScanner";

describe("scanProjectFiles", () => {
  it("includes gitignored files for navigation while keeping sensitive paths hidden", async () => {
    const projectRoot = await createTempProject();

    try {
      await writeFile(join(projectRoot, ".gitignore"), "ignored/\n*.log\nAGENTS.md\n", "utf8");
      await writeFile(join(projectRoot, "AGENTS.md"), "Use Forge test rules.\n", "utf8");
      await writeFile(join(projectRoot, ".env"), "SECRET=keep-local\n", "utf8");
      await writeFile(join(projectRoot, ".env.example"), "SECRET=\n", "utf8");
      await writeFile(join(projectRoot, "debug.log"), "visible in file tree\n", "utf8");
      await mkdir(join(projectRoot, ".git"), { recursive: true });
      await mkdir(join(projectRoot, "ignored"), { recursive: true });
      await writeFile(join(projectRoot, ".git", "config"), "[core]\n", "utf8");
      await writeFile(join(projectRoot, "ignored", "generated.txt"), "also visible\n", "utf8");

      const result = await scanProjectFiles(projectRoot);
      const paths = result.files.map((file) => file.relativePath).sort();

      expect(paths).toContain(".gitignore");
      expect(paths).toContain(".env.example");
      expect(paths).toContain("AGENTS.md");
      expect(paths).toContain("debug.log");
      expect(paths).toContain("ignored/generated.txt");
      expect(paths).not.toContain(".env");
      expect(paths.some((path) => path.startsWith(".git/"))).toBe(false);
      expect(result.instructionFiles?.map((file) => file.relativePath)).toContain("AGENTS.md");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("reuses unchanged file metadata from a previous index", async () => {
    const projectRoot = await createTempProject();

    try {
      await writeFile(join(projectRoot, "README.md"), "# Project\n", "utf8");

      const firstScan = await scanProjectFiles(projectRoot);
      const secondScan = await scanProjectFiles(projectRoot, { previousIndex: firstScan });
      const firstFile = firstScan.files.find((file) => file.relativePath === "README.md");
      const secondFile = secondScan.files.find((file) => file.relativePath === "README.md");

      expect(firstFile?.modifiedAtMs).toEqual(expect.any(Number));
      expect(secondFile).toBe(firstFile);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

async function createTempProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "forge-project-scanner-"));
}
