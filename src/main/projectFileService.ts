// 本文件说明: 在项目根目录内安全读取, 预览和写入文本文件
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ProjectFileChangePreview, ProjectTextFile } from "../shared/fileTypes.js";
import { createLineDiff } from "../shared/textDiff.js";

type ReadProjectTextFileOptions = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

// 读取文本文件前检查路径边界和大小, 防止大文件拖慢预览
export async function readProjectTextFile({
  projectRoot,
  relativePath,
  maxBytes = 256000
}: ReadProjectTextFileOptions): Promise<ProjectTextFile> {
  const resolvedProjectRoot = await realpath(projectRoot);
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
    relativePath: relativePath.replace(/\\/g, "/"),
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
  const currentFile = await readProjectTextFile({ projectRoot, relativePath, maxBytes });

  return {
    relativePath: currentFile.relativePath,
    currentContent: currentFile.content,
    nextContent,
    diff: createLineDiff(currentFile.content, nextContent)
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
  const absoluteFilePath = resolve(resolvedProjectRoot, relativePath);

  if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
    throw new Error("文件路径必须位于当前项目内。");
  }

  const resolvedFilePath = await realpath(absoluteFilePath);

  if (!isPathInside(resolvedFilePath, resolvedProjectRoot)) {
    throw new Error("文件路径必须位于当前项目内。");
  }

  await writeFile(resolvedFilePath, nextContent, "utf8");

  return readProjectTextFile({ projectRoot, relativePath });
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
