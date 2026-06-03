import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectIndexCache } from "./projectIndexCache";

describe("project index cache", () => {
  it("persists and reads project scan metadata by project root", async () => {
    const cacheDirectory = await createTempDirectory();

    try {
      const cache = createProjectIndexCache({ directory: cacheDirectory });
      const scanResult = {
        rootPath: "E:/CodeHome/Forge",
        files: [{ relativePath: "src/App.tsx", size: 120, modifiedAtMs: 1000 }],
        truncated: false,
        instructionFiles: [{ relativePath: "AGENTS.md", content: "rules", truncated: false }]
      };

      await cache.write(scanResult);

      await expect(cache.read(scanResult.rootPath)).resolves.toEqual(scanResult);
      await expect(cache.read("E:/CodeHome/Other")).resolves.toBeNull();
    } finally {
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });
});

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "forge-project-index-cache-"));
}
