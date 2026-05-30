// 本文件说明: 主进程 项目文件服务
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ProjectFileChangePreview, ProjectTextFile } from "../shared/fileTypes.js";
import { createLineDiff } from "../shared/textDiff.js";

type ReadProjectTextFileOptions = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

export async function readProjectTextFile({
  projectRoot,
  relativePath,
  maxBytes = 256000
}: ReadProjectTextFileOptions): Promise<ProjectTextFile> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const absoluteFilePath = resolve(resolvedProjectRoot, relativePath);

  if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  const resolvedFilePath = await realpath(absoluteFilePath);

  if (!isPathInside(resolvedFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  const fileStat = await stat(resolvedFilePath);

  if (fileStat.size > maxBytes) {
    throw new Error("File is too large to preview");
  }

  return {
    relativePath: relativePath.replace(/\\/g, "/"),
    content: await readFile(resolvedFilePath, "utf8"),
    size: fileStat.size
  };
}

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
    throw new Error("File path must stay inside the selected project");
  }

  const resolvedFilePath = await realpath(absoluteFilePath);

  if (!isPathInside(resolvedFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  await writeFile(resolvedFilePath, nextContent, "utf8");

  return readProjectTextFile({ projectRoot, relativePath });
}

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = candidatePath.toLocaleLowerCase();
  const normalizedRoot = rootPath.toLocaleLowerCase();

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`)
  );
}
