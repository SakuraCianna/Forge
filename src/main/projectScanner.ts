// 本文件说明: 主进程 项目扫描器
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  ProjectFile,
  ProjectInstructionFile,
  ProjectScanResult
} from "../shared/projectTypes.js";

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

const maxInstructionFileChars = 12_000;
const maxInstructionFiles = 12;
// 只读取轻量项目指令, 避免把完整仓库塞进模型上下文
const rootInstructionFilePaths = [
  "AGENTS.md",
  "CLAUDE.md",
  "CLAUDE.local.md",
  "GEMINI.md",
  ".cursorrules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
  ".codex/AGENTS.md",
  ".claude/CLAUDE.md"
] as const;

export async function scanProjectFiles(
  rootPath: string,
  options: ScanOptions = {}
): Promise<ProjectScanResult> {
  const limit = options.limit ?? 500;
  const files: ProjectFile[] = [];
  let truncated = false;
  let rootStat: Awaited<ReturnType<typeof stat>>;

  try {
    rootStat = await stat(rootPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new Error(`Project path does not exist: ${rootPath}`, { cause: error });
    }

    throw error;
  }

  if (!rootStat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${rootPath}`);
  }

  const instructionFiles = await readProjectInstructionFiles(rootPath);

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
    truncated,
    instructionFiles
  };
}

async function readProjectInstructionFiles(rootPath: string): Promise<ProjectInstructionFile[]> {
  const candidatePaths = await collectInstructionFilePaths(rootPath);
  const instructionFiles: ProjectInstructionFile[] = [];

  for (const relativePath of candidatePaths) {
    if (instructionFiles.length >= maxInstructionFiles) {
      break;
    }

    try {
      const filePath = toProjectFilePath(rootPath, relativePath);
      const fileStat = await stat(filePath);

      if (!fileStat.isFile()) {
        continue;
      }

      const normalizedContent = normalizeInstructionContent(await readFile(filePath, "utf8"));

      if (!normalizedContent) {
        continue;
      }

      instructionFiles.push({
        relativePath,
        content: normalizedContent.slice(0, maxInstructionFileChars),
        truncated: normalizedContent.length > maxInstructionFileChars
      });
    } catch (error) {
      if (isMissingPathError(error)) {
        continue;
      }

      throw error;
    }
  }

  return instructionFiles;
}

async function collectInstructionFilePaths(rootPath: string): Promise<string[]> {
  const cursorRulePaths = await readCursorRulePaths(rootPath);
  const seenPaths = new Set<string>();

  return [...rootInstructionFilePaths, ...cursorRulePaths].filter((relativePath) => {
    const normalizedPath = normalizeRelativePath(relativePath);

    if (seenPaths.has(normalizedPath)) {
      return false;
    }

    seenPaths.add(normalizedPath);
    return true;
  });
}

async function readCursorRulePaths(rootPath: string): Promise<string[]> {
  const rulesDirectoryPath = join(rootPath, ".cursor", "rules");

  try {
    const entries = await readdir(rulesDirectoryPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && /\.(?:md|mdc|txt)$/i.test(entry.name))
      .map((entry) => normalizeRelativePath(`.cursor/rules/${entry.name}`))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

function normalizeInstructionContent(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function toProjectFilePath(rootPath: string, relativePath: string): string {
  return join(rootPath, ...relativePath.split("/"));
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
