import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectTextSearchIndexCache } from "./projectTextSearchIndexCache";

describe("project text search index cache", () => {
  it("persists text search line snapshots by project root and file size limit", async () => {
    const cacheDirectory = await createTempDirectory();

    try {
      const cache = createProjectTextSearchIndexCache({ directory: cacheDirectory });
      const payload = {
        rootPath: "E:/CodeHome/Forge",
        maxFileBytes: 256000,
        entries: [
          {
            relativePath: "README.md",
            size: 120,
            modifiedAtMs: 1000,
            lines: ["Forge", "local agent"]
          }
        ]
      };

      await cache.write(payload);

      await expect(cache.read(payload.rootPath, payload.maxFileBytes)).resolves.toEqual(payload);
      await expect(cache.read(payload.rootPath, 128000)).resolves.toBeNull();
      await expect(cache.read("E:/CodeHome/Other", payload.maxFileBytes)).resolves.toBeNull();
    } finally {
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });
});

async function createTempDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "forge-project-text-search-index-cache-"));
}
