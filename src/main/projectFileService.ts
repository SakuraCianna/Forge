import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ProjectTextFile } from "../shared/fileTypes.js";

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

function isPathInside(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = candidatePath.toLocaleLowerCase();
  const normalizedRoot = rootPath.toLocaleLowerCase();

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`)
  );
}
