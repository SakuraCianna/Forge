// 本文件说明: 在项目根目录内安全读取, 预览和写入文本文件
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type {
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

type ReadProjectTextFileOptions = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

const searchIgnoredDirectoryNames = new Set([
  ".git",
  ".vite",
  "coverage",
  "dist",
  "dist-electron",
  "node_modules",
  "out"
]);

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
  const matches: ProjectTextSearchMatch[] = [];
  let truncated = false;

  // 递归搜索时跳过敏感路径, 大文件和构建产物, 避免把搜索工具变成无限制读文件入口
  async function walk(directoryPath: string): Promise<void> {
    if (matches.length >= resultLimit) {
      truncated = true;
      return;
    }

    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (matches.length >= resultLimit) {
        truncated = true;
        return;
      }

      const absolutePath = `${directoryPath}${sep}${entry.name}`;
      const relativePath = normalizeRelativePath(relative(resolvedProjectRoot, absolutePath));

      if (entry.isDirectory()) {
        if (searchIgnoredDirectoryNames.has(entry.name) || isSensitiveProjectPath(relativePath)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || isSensitiveProjectPath(relativePath)) {
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
