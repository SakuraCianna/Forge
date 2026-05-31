// 本文件说明: 在项目根目录内安全读取, 预览和写入文本文件
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type {
  ProjectDirectoryEntry,
  ProjectDirectoryListRequest,
  ProjectDirectoryListResult,
  ProjectFileGlobMatch,
  ProjectFileGlobRequest,
  ProjectFileGlobResult,
  ProjectFileChangePreview,
  ProjectTextFile,
  ProjectTextSearchMatch,
  ProjectTextSearchRequest,
  ProjectTextSearchResult
} from "../shared/fileTypes.js";
import {
  assertProjectPathNotSensitive,
  isSensitiveProjectPath
} from "../shared/sensitiveProjectFiles.js";
import { createLineDiff } from "../shared/textDiff.js";
import { createProjectIgnoreMatcher } from "./projectIgnore.js";

type ReadProjectTextFileOptions = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

const maxSearchPreviewChars = 240;

// 读取文本文件前检查路径边界和大小, 防止大文件拖慢预览
export async function readProjectTextFile({
  projectRoot,
  relativePath,
  maxBytes = 256000
}: ReadProjectTextFileOptions): Promise<ProjectTextFile> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  assertProjectPathNotSensitive(normalizedRelativePath);

  const absoluteFilePath = resolve(resolvedProjectRoot, relativePath);

  if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
    throw new Error("文件路径必须位于当前项目内。");
  }

  const resolvedFilePath = await realpath(absoluteFilePath);

  if (!isPathInside(resolvedFilePath, resolvedProjectRoot)) {
    throw new Error("文件路径必须位于当前项目内。");
  }

  const fileStat = await stat(resolvedFilePath);

  if (fileStat.size > maxBytes) {
    throw new Error("文件过大，无法预览。");
  }

  return {
    relativePath: normalizedRelativePath,
    content: await readFile(resolvedFilePath, "utf8"),
    size: fileStat.size
  };
}

// 生成文件更新 diff 但不写盘, 供用户先审查模型改动
export async function previewProjectTextFileUpdate({
  projectRoot,
  relativePath,
  nextContent,
  maxBytes = 256000
}: ReadProjectTextFileOptions & { nextContent: string }): Promise<ProjectFileChangePreview> {
  const currentFile = await readProjectTextFileOrEmpty({ projectRoot, relativePath, maxBytes });

  return {
    relativePath: currentFile.relativePath,
    currentContent: currentFile.content,
    nextContent,
    diff: createLineDiff(currentFile.content, nextContent)
  };
}

// 列出项目内单个目录, 供 Agent inspect 目录时使用, 不读取文件内容
export async function listProjectDirectory({
  projectRoot,
  relativePath = ".",
  limit
}: ProjectDirectoryListRequest): Promise<ProjectDirectoryListResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const normalizedRelativePath = normalizeDirectoryRelativePath(relativePath);
  const resultLimit = normalizeOptionalResultLimit(limit, 300);
  const ignoreMatcher = await createProjectIgnoreMatcher(resolvedProjectRoot);

  if (normalizedRelativePath !== ".") {
    assertProjectPathNotSensitive(normalizedRelativePath);
  }

  const absoluteDirectoryPath = resolve(
    resolvedProjectRoot,
    normalizedRelativePath === "." ? "." : normalizedRelativePath
  );

  if (!isPathInside(absoluteDirectoryPath, resolvedProjectRoot)) {
    throw new Error("目录路径必须位于当前项目内。");
  }

  const resolvedDirectoryPath = await realpath(absoluteDirectoryPath);

  if (!isPathInside(resolvedDirectoryPath, resolvedProjectRoot)) {
    throw new Error("目录路径必须位于当前项目内。");
  }

  const directoryStat = await stat(resolvedDirectoryPath);

  if (!directoryStat.isDirectory()) {
    throw new Error("目录路径必须指向文件夹。");
  }

  const entries: ProjectDirectoryEntry[] = [];
  let truncated = false;

  for (const entry of await readSortedDirectoryEntries(resolvedDirectoryPath)) {
    const absolutePath = `${resolvedDirectoryPath}${sep}${entry.name}`;
    const entryRelativePath = normalizeRelativePath(relative(resolvedProjectRoot, absolutePath));

    if (isSensitiveProjectPath(entryRelativePath)) {
      continue;
    }

    if (ignoreMatcher(entryRelativePath, entry.isDirectory())) {
      continue;
    }

    if (!entry.isDirectory() && !entry.isFile()) {
      continue;
    }

    if (hasReachedLimit(entries.length, resultLimit)) {
      truncated = true;
      break;
    }

    entries.push(
      entry.isDirectory()
        ? {
            name: entry.name,
            relativePath: entryRelativePath,
            kind: "directory"
          }
        : {
            name: entry.name,
            relativePath: entryRelativePath,
            kind: "file",
            size: (await stat(absolutePath)).size
          }
    );
  }

  return {
    relativePath: normalizedRelativePath,
    entries,
    truncated
  };
}

// 在项目内执行受控文本搜索, 用于 Agent inspect/search 动作
export async function searchProjectTextFiles({
  projectRoot,
  query,
  limit = 80,
  maxFileBytes = 256000
}: ProjectTextSearchRequest): Promise<ProjectTextSearchResult> {
  const normalizedQuery = normalizeSearchQuery(query);
  const resultLimit = Math.min(200, Math.max(1, Math.round(limit)));
  const resolvedProjectRoot = await realpath(projectRoot);
  const ignoreMatcher = await createProjectIgnoreMatcher(resolvedProjectRoot);
  const matches: ProjectTextSearchMatch[] = [];
  let truncated = false;

  // 递归搜索时跳过敏感路径, 大文件和构建产物, 避免把搜索工具变成无限制读文件入口
  async function walk(directoryPath: string): Promise<void> {
    if (hasReachedLimit(matches.length, resultLimit)) {
      truncated = true;
      return;
    }

    const entries = await readSortedDirectoryEntries(directoryPath);

    for (const entry of entries) {
      if (hasReachedLimit(matches.length, resultLimit)) {
        truncated = true;
        return;
      }

      const absolutePath = `${directoryPath}${sep}${entry.name}`;
      const relativePath = normalizeRelativePath(relative(resolvedProjectRoot, absolutePath));

      if (entry.isDirectory()) {
        if (isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, true)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, false)) {
        continue;
      }

      const fileStat = await stat(absolutePath);

      if (fileStat.size > maxFileBytes) {
        continue;
      }

      const content = await readFile(absolutePath, "utf8");

      if (content.includes("\u0000")) {
        continue;
      }

      if (collectSearchMatches(relativePath, content, normalizedQuery, matches, resultLimit)) {
        truncated = true;
        return;
      }
    }
  }

  await walk(resolvedProjectRoot);

  return {
    query: normalizedQuery,
    matches,
    truncated
  };
}

// 在项目内执行受控 glob 匹配, 用于 Agent 快速定位候选文件
export async function globProjectFiles({
  projectRoot,
  pattern,
  limit
}: ProjectFileGlobRequest): Promise<ProjectFileGlobResult> {
  const normalizedPattern = normalizeGlobPattern(pattern);
  const resultLimit = normalizeOptionalResultLimit(limit, 500);
  const patternMatcher = createGlobMatcher(normalizedPattern);
  const resolvedProjectRoot = await realpath(projectRoot);
  const ignoreMatcher = await createProjectIgnoreMatcher(resolvedProjectRoot);
  const matches: ProjectFileGlobMatch[] = [];
  let truncated = false;

  // glob 工具只返回路径和大小, 不读取文件内容
  async function walk(directoryPath: string): Promise<void> {
    if (hasReachedLimit(matches.length, resultLimit)) {
      truncated = true;
      return;
    }

    const entries = await readSortedDirectoryEntries(directoryPath);

    for (const entry of entries) {
      if (hasReachedLimit(matches.length, resultLimit)) {
        truncated = true;
        return;
      }

      const absolutePath = `${directoryPath}${sep}${entry.name}`;
      const relativePath = normalizeRelativePath(relative(resolvedProjectRoot, absolutePath));

      if (entry.isDirectory()) {
        if (isSensitiveProjectPath(relativePath) || ignoreMatcher(relativePath, true)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (
        !entry.isFile() ||
        isSensitiveProjectPath(relativePath) ||
        ignoreMatcher(relativePath, false) ||
        !patternMatcher(relativePath)
      ) {
        continue;
      }

      const fileStat = await stat(absolutePath);

      matches.push({
        relativePath,
        size: fileStat.size
      });
    }
  }

  await walk(resolvedProjectRoot);

  return {
    pattern: normalizedPattern,
    matches,
    truncated
  };
}

// 写入文本文件前再次检查边界, 成功后返回最新内容快照
export async function writeProjectTextFile({
  projectRoot,
  relativePath,
  nextContent
}: Pick<ReadProjectTextFileOptions, "projectRoot" | "relativePath"> & {
  nextContent: string;
}): Promise<ProjectTextFile> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  assertProjectPathNotSensitive(normalizedRelativePath);

  const absoluteFilePath = resolve(resolvedProjectRoot, relativePath);

  if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
    throw new Error("文件路径必须位于当前项目内。");
  }

  const existingResolvedFilePath = await resolveExistingFilePath(absoluteFilePath);

  if (existingResolvedFilePath && !isPathInside(existingResolvedFilePath, resolvedProjectRoot)) {
    throw new Error("文件路径必须位于当前项目内。");
  }

  await mkdir(dirname(absoluteFilePath), { recursive: true });
  const resolvedParentPath = await realpath(dirname(absoluteFilePath));

  if (!isPathInside(resolvedParentPath, resolvedProjectRoot)) {
    throw new Error("文件路径必须位于当前项目内。");
  }

  await writeFile(existingResolvedFilePath ?? absoluteFilePath, nextContent, "utf8");

  return readProjectTextFile({ projectRoot, relativePath: normalizedRelativePath });
}

// 新文件预览使用空内容作为旧版本, 让 Agent 可以先生成再审查
async function readProjectTextFileOrEmpty({
  projectRoot,
  relativePath,
  maxBytes
}: ReadProjectTextFileOptions): Promise<ProjectTextFile> {
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  assertProjectPathNotSensitive(normalizedRelativePath);

  try {
    return await readProjectTextFile({ projectRoot, relativePath: normalizedRelativePath, maxBytes });
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }

    const resolvedProjectRoot = await realpath(projectRoot);
    const absoluteFilePath = resolve(resolvedProjectRoot, relativePath);

    if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
      throw new Error("文件路径必须位于当前项目内。", { cause: error });
    }

    return {
      relativePath: normalizedRelativePath,
      content: "",
      size: 0
    };
  }
}

// 读取目录并按名称排序, 让搜索和 glob 结果稳定可测
async function readSortedDirectoryEntries(directoryPath: string): Promise<Dirent[]> {
  return (await readdir(directoryPath, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

// 只有调用方显式传入 limit 时才截断文件列表类结果, 默认展示所有未忽略路径
function normalizeOptionalResultLimit(limit: number | undefined, maxLimit: number): number | null {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return null;
  }

  return Math.min(maxLimit, Math.max(1, Math.round(limit)));
}

// null 表示没有人为数量上限, 其它数字按调用方配置截断
function hasReachedLimit(count: number, limit: number | null): boolean {
  return limit !== null && count >= limit;
}

// 目录检查只接受项目内相对目录, 根目录统一记作点号
function normalizeDirectoryRelativePath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath.trim())
    .replace(/^\.\//u, "")
    .replace(/\/+$/u, "")
    .slice(0, 220);

  if (!normalized || normalized === ".") {
    return ".";
  }

  if (normalized.split("/").includes("..")) {
    throw new Error("目录路径不能包含上级目录。");
  }

  return normalized;
}

// 归一化 glob 模式, 避免用上级目录表达绕过项目边界
function normalizeGlobPattern(pattern: string): string {
  const normalized = normalizeRelativePath(pattern.trim())
    .replace(/^\.\//u, "")
    .slice(0, 220);

  if (!normalized) {
    throw new Error("文件匹配模式不能为空。");
  }

  if (normalized.split("/").includes("..")) {
    throw new Error("文件匹配模式不能包含上级目录。");
  }

  return normalized.includes("/") ? normalized : `**/${normalized}`;
}

// 将轻量 glob 模式编译为路径匹配函数, 支持 *, ** 和 ?
function createGlobMatcher(pattern: string): (relativePath: string) => boolean {
  const regex = new RegExp(`^${globPatternToRegexSource(pattern)}$`, "iu");

  return (relativePath) => regex.test(relativePath);
}

// 把 glob 字符转换成正则片段, 只保留路径匹配所需的最小语义
function globPatternToRegexSource(pattern: string): string {
  let source = "";
  let index = 0;

  while (index < pattern.length) {
    if (pattern.slice(index, index + 3) === "**/") {
      source += "(?:.*/)?";
      index += 3;
      continue;
    }

    if (pattern.slice(index, index + 2) === "**") {
      source += ".*";
      index += 2;
      continue;
    }

    const char = pattern[index];

    if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }

    index += 1;
  }

  return source;
}

// 把搜索关键词收敛成非空短文本, 防止意外全仓库匹配
function normalizeSearchQuery(query: string): string {
  const normalized = query.trim().slice(0, 160);

  if (!normalized) {
    throw new Error("搜索关键词不能为空。");
  }

  return normalized;
}

// 从单个文本文件收集搜索命中, 按行返回有限预览
function collectSearchMatches(
  relativePath: string,
  content: string,
  query: string,
  matches: ProjectTextSearchMatch[],
  limit: number
): boolean {
  const normalizedQuery = query.toLocaleLowerCase();
  const lines = content.split(/\r?\n/u);

  for (const [index, line] of lines.entries()) {
    if (!line.toLocaleLowerCase().includes(normalizedQuery)) {
      continue;
    }

    if (matches.length >= limit) {
      return true;
    }

    matches.push({
      relativePath,
      lineNumber: index + 1,
      preview: line.trim().slice(0, maxSearchPreviewChars)
    });
  }

  return false;
}

// 转义正则字符, 供 glob 编译保留普通路径字符语义
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// 读取已存在文件的真实路径, 新文件保持 null 继续走创建流程
async function resolveExistingFilePath(absoluteFilePath: string): Promise<string | null> {
  try {
    return await realpath(absoluteFilePath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

// 只吞掉文件不存在错误, 路径越界和大小限制仍继续抛出
function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

// 将 Windows 路径分隔符统一成前端展示使用的斜杠
function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}

// 判断目标路径是否仍在项目根目录内
function isPathInside(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = candidatePath.toLocaleLowerCase();
  const normalizedRoot = rootPath.toLocaleLowerCase();

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`)
  );
}
