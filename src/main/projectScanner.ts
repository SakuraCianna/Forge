import { readdir, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import type { ProjectFile, ProjectScanResult } from "../shared/projectTypes.js";

const ignoredDirectoryNames = new Set([
  ".git",
  ".vite",
  "coverage",
  "dist",
  "dist-electron",
  "node_modules",
  "out"
]);

type ScanOptions = {
  limit?: number;
};

export async function scanProjectFiles(
  rootPath: string,
  options: ScanOptions = {}
): Promise<ProjectScanResult> {
  const limit = options.limit ?? 500;
  const files: ProjectFile[] = [];
  let truncated = false;

  async function walk(directoryPath: string): Promise<void> {
    if (files.length >= limit) {
      truncated = true;
      return;
    }

    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= limit) {
        truncated = true;
        return;
      }

      if (entry.isDirectory()) {
        if (ignoredDirectoryNames.has(entry.name)) {
          continue;
        }

        await walk(`${directoryPath}${sep}${entry.name}`);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const filePath = `${directoryPath}${sep}${entry.name}`;
      const fileStat = await stat(filePath);
      files.push({
        relativePath: normalizeRelativePath(relative(rootPath, filePath)),
        size: fileStat.size
      });
    }
  }

  await walk(rootPath);

  return {
    rootPath,
    files,
    truncated
  };
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}
