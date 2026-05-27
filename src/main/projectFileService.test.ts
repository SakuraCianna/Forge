import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readProjectTextFile } from "./projectFileService";

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
    ).rejects.toThrow("File path must stay inside the selected project");
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
    ).rejects.toThrow("File is too large to preview");
  });
});
