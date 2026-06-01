// 本文件说明: 扫描项目文件和规则说明, 为 Agent 提供轻量上下文
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  ProjectFile,
  ProjectInstructionFile,
  ProjectScanResult
} from "../shared/projectTypes.js";
import { isSensitiveProjectPath } from "../shared/sensitiveProjectFiles.js";
import { createProjectIgnoreMatcher, type ProjectIgnoreMatcher } from "./projectIgnore.js";

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
  ".claude/CLAUDE.md"
] as const;

// 遍历项目文件并读取说明文档, 跳过依赖目录和大文件
export async function scanProjectFiles(
  rootPath: string,
  options: ScanOptions = {}
): Promise<ProjectScanResult> {
  const limit = normalizeOptionalLimit(options.limit);
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

  const ignoreMatcher = await createProjectIgnoreMatcher(rootPath);
  const instructionFiles = await readProjectInstructionFiles(rootPath, ignoreMatcher);

  // 递归遍历目录时保留数量和大小限制, 避免扫描拖垮界面
  async function walk(directoryPath: string): Promise<void> {
    if (hasReachedLimit(files.length, limit)) {
      truncated = true;
      return;
    }

    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (hasReachedLimit(files.length, limit)) {
        truncated = true;
        return;
      }

      if (entry.isDirectory()) {
        const relativeDirectoryPath = normalizeRelativePath(relative(rootPath, `${directoryPath}${sep}${entry.name}`));

        if (
          isSensitiveProjectPath(relativeDirectoryPath) ||
          ignoreMatcher(relativeDirectoryPath, true)
        ) {
          continue;
        }

        await walk(`${directoryPath}${sep}${entry.name}`);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const filePath = `${directoryPath}${sep}${entry.name}`;
      const relativePath = normalizeRelativePath(relative(rootPath, filePath));

      if (isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, false)) {
        continue;
      }

      const fileStat = await stat(filePath);
      files.push({
        relativePath,
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

// 汇总 AGENTS, README 和规则文件内容, 作为模型的项目说明
async function readProjectInstructionFiles(
  rootPath: string,
  ignoreMatcher: ProjectIgnoreMatcher
): Promise<ProjectInstructionFile[]> {
  const candidatePaths = await collectInstructionFilePaths(rootPath);
  const instructionFiles: ProjectInstructionFile[] = [];

  for (const relativePath of candidatePaths) {
    if (instructionFiles.length >= maxInstructionFiles) {
      break;
    }

    try {
      if (ignoreMatcher(relativePath, false)) {
        continue;
      }

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
