// 本文件说明: 扫描项目文件和规则说明, 为 Agent 提供轻量上下文
import type { BigIntStats, Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  ProjectFile,
  ProjectInstructionFile,
  ProjectScanResult
} from "../shared/projectTypes.js";
import { isSensitiveProjectPath } from "../shared/sensitiveProjectFiles.js";
import { readCachedSortedDirectoryEntries } from "./projectDirectoryEntriesCache.js";

type ScanOptions = {
  limit?: number;
  previousIndex?: ProjectScanResult | null;
};

type CachedInstructionFile = {
  file: ProjectInstructionFile;
  modifiedAtMs: number;
  size: number;
};

const maxInstructionFileChars = 12_000;
const maxInstructionFiles = 12;
const maxCachedInstructionFiles = 160;
const instructionFileCache = new Map<string, CachedInstructionFile>();
// 只读取轻量项目指令, 避免把完整仓库塞进模型上下文
const rootInstructionFilePaths = [
  "AGENTS.md",
  "CLAUDE.md",
  "CLAUDE.local.md",
  "GEMINI.md",
  ".cursorrules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
  ".claude/CLAUDE.md"
] as const;

// 遍历项目文件并读取说明文档, 跳过依赖目录和大文件
export async function scanProjectFiles(
  rootPath: string,
  options: ScanOptions = {}
): Promise<ProjectScanResult> {
  const limit = normalizeOptionalLimit(options.limit);
  const files: ProjectFile[] = [];
  const previousFilesByPath = createPreviousFileMap(rootPath, options.previousIndex);
  let truncated = false;
  let rootStat: Stats;

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

  // 递归遍历目录时保留数量和大小限制, 避免扫描拖垮界面
  // File tree scans are user-visible navigation data, so they include files ignored by Git.
  // Sensitive project paths still stay hidden; Agent search/glob tools keep their own .gitignore filter.
  async function walk(directoryPath: string): Promise<void> {
    if (hasReachedLimit(files.length, limit)) {
      truncated = true;
      return;
    }

    const entries = await readCachedSortedDirectoryEntries(directoryPath);

    for (const entry of entries) {
      if (hasReachedLimit(files.length, limit)) {
        truncated = true;
        return;
      }

      if (entry.isDirectory) {
        const relativeDirectoryPath = normalizeRelativePath(relative(rootPath, `${directoryPath}${sep}${entry.name}`));

        if (isSensitiveProjectPath(relativeDirectoryPath)) {
          continue;
        }

        await walk(`${directoryPath}${sep}${entry.name}`);
        continue;
      }

      if (!entry.isFile) {
        continue;
      }

      const filePath = `${directoryPath}${sep}${entry.name}`;
      const relativePath = normalizeRelativePath(relative(rootPath, filePath));

      if (isSensitiveProjectPath(relativePath)) {
        continue;
      }

      const fileStat = await stat(filePath, { bigint: true });
      files.push(createProjectFileEntry(relativePath, fileStat, previousFilesByPath));
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

// 汇总 AGENTS, README 和规则文件内容, 作为模型的项目说明
function createPreviousFileMap(
  rootPath: string,
  previousIndex: ProjectScanResult | null | undefined
): Map<string, ProjectFile> {
  if (!previousIndex || previousIndex.rootPath !== rootPath) {
    return new Map();
  }

  return new Map(previousIndex.files.map((file) => [file.relativePath, file]));
}

function createProjectFileEntry(
  relativePath: string,
  fileStat: BigIntStats,
  previousFilesByPath: ReadonlyMap<string, ProjectFile>
): ProjectFile {
  const changedAtNs = fileStat.ctimeNs.toString();
  const modifiedAtMs = Number(fileStat.mtimeMs);
  const modifiedAtNs = fileStat.mtimeNs.toString();
  const size = normalizeBigIntFileSize(fileStat.size);
  const previousFile = previousFilesByPath.get(relativePath);

  if (
    previousFile &&
    previousFile.size === size &&
    previousFile.changedAtNs === changedAtNs &&
    previousFile.modifiedAtNs === modifiedAtNs
  ) {
    return previousFile;
  }

  return {
    changedAtNs,
    modifiedAtMs,
    modifiedAtNs,
    relativePath,
    size
  };
}

function normalizeBigIntFileSize(size: bigint): number {
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(size);
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

      const instructionFile = await readCachedProjectInstructionFile(
        rootPath,
        relativePath,
        filePath,
        fileStat
      );

      if (!instructionFile) {
        continue;
      }

      instructionFiles.push(instructionFile);
    } catch (error) {
      if (isMissingPathError(error)) {
        instructionFileCache.delete(createInstructionFileCacheKey(rootPath, relativePath));
        continue;
      }

      throw error;
    }
  }

  return instructionFiles;
}

async function readCachedProjectInstructionFile(
  rootPath: string,
  relativePath: string,
  filePath: string,
  fileStat: Stats
): Promise<ProjectInstructionFile | null> {
  const cacheKey = createInstructionFileCacheKey(rootPath, relativePath);
  const cachedFile = instructionFileCache.get(cacheKey);
  const modifiedAtMs = fileStat.mtimeMs;

  if (
    cachedFile &&
    cachedFile.size === fileStat.size &&
    cachedFile.modifiedAtMs === modifiedAtMs
  ) {
    rememberInstructionFile(cacheKey, cachedFile);
    return cachedFile.file;
  }

  const normalizedContent = normalizeInstructionContent(await readFile(filePath, "utf8"));

  if (!normalizedContent) {
    instructionFileCache.delete(cacheKey);
    return null;
  }

  const file = {
    relativePath,
    content: normalizedContent.slice(0, maxInstructionFileChars),
    truncated: normalizedContent.length > maxInstructionFileChars
  };

  rememberInstructionFile(cacheKey, {
    file,
    modifiedAtMs,
    size: fileStat.size
  });

  return file;
}

function rememberInstructionFile(cacheKey: string, cachedFile: CachedInstructionFile): void {
  instructionFileCache.delete(cacheKey);
  instructionFileCache.set(cacheKey, cachedFile);

  while (instructionFileCache.size > maxCachedInstructionFiles) {
    const oldestCacheKey = instructionFileCache.keys().next().value;

    if (typeof oldestCacheKey !== "string") {
      return;
    }

    instructionFileCache.delete(oldestCacheKey);
  }
}

// 收集常见项目说明文件路径, 不存在的文件交给读取阶段忽略
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

// 扫描 Cursor 规则目录, 支持文件和目录两种形态
async function readCursorRulePaths(rootPath: string): Promise<string[]> {
  const rulesDirectoryPath = join(rootPath, ".cursor", "rules");

  try {
    const entries = await readCachedSortedDirectoryEntries(rulesDirectoryPath);

    return entries
      .filter((entry) => entry.isFile && /\.(?:md|mdc|txt)$/i.test(entry.name))
      .map((entry) => normalizeRelativePath(`.cursor/rules/${entry.name}`))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

// 压缩说明文件空白并截断长度, 让提示词保持可控
function normalizeInstructionContent(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

// 只有调用方显式传入 limit 时才截断索引, 默认展示全部未忽略文件
function normalizeOptionalLimit(limit: number | undefined): number | null {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return null;
  }

  return Math.max(1, Math.round(limit));
}

// 统一处理可选上限, null 表示没有人为截断
function hasReachedLimit(count: number, limit: number | null): boolean {
  return limit !== null && count >= limit;
}

// 将绝对路径转成统一的项目相对路径
function toProjectFilePath(rootPath: string, relativePath: string): string {
  return join(rootPath, ...relativePath.split("/"));
}

function createInstructionFileCacheKey(rootPath: string, relativePath: string): string {
  return `${rootPath}\u0000${relativePath}`;
}

// 识别路径不存在错误, 扫描时把缺失目录当作空目录处理
function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

// 将 Windows 路径分隔符统一成前端展示使用的斜杠
function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}

// 将 unknown 缩窄成对象, 用于安全读取错误码
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
