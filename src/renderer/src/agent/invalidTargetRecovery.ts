// 本文件说明: 从不可执行的 Agent 目标里提取可恢复线索, 帮助用户和修复计划定位真实文件
import type { Language } from "@shared/modelTypes";
import type { ProjectFile } from "@shared/projectTypes";

export type InvalidTargetRecoveryCandidates = {
  files: string[];
  directories: string[];
};

// 从模型塞进 target 的自然语言里找真实项目文件和目录, 让失败动作有可操作恢复入口
export function collectInvalidTargetRecoveryCandidates(
  sourceText: string,
  projectFiles: ProjectFile[] = [],
  limit = 8
): InvalidTargetRecoveryCandidates {
  const normalizedSource = normalizeForMatch(sourceText);
  const filePaths = projectFiles.map((file) => file.relativePath.replace(/\\/g, "/"));
  const exactFiles = filePaths.filter((relativePath) =>
    normalizedSource.includes(normalizeForMatch(relativePath))
  );
  const basenameFiles = findUniqueBasenameMatches(normalizedSource, filePaths);
  const files = uniqueStrings([...exactFiles, ...basenameFiles]).slice(0, limit);
  const knownDirectories = buildKnownDirectorySet(filePaths);
  const directories = uniqueStrings([
    ...files.flatMap((file) => getParentDirectories(file)),
    ...extractPathTokens(sourceText).flatMap((token) => findKnownDirectoryPrefixes(token, knownDirectories))
  ])
    .filter((directory) => directory !== ".")
    .slice(0, limit);

  return {
    files,
    directories
  };
}

// 把恢复线索追加进错误提示, 避免用户只能看到泛化的 invalid target
export function formatInvalidTargetRecoveryMessage(
  language: Language,
  reason: string,
  candidates: InvalidTargetRecoveryCandidates
): string {
  const hasCandidates = candidates.files.length > 0 || candidates.directories.length > 0;

  if (language === "zh-CN") {
    const lines = [`Agent 动作目标不是可执行的项目相对路径，已停止以避免误改文件。${reason}`];

    if (candidates.files.length > 0) {
      lines.push(`候选文件: ${candidates.files.join(", ")}`);
    }

    if (candidates.directories.length > 0) {
      lines.push(`候选目录: ${candidates.directories.join(", ")}`);
    }

    lines.push(
      hasCandidates
        ? "建议生成修复计划，让 Forge 先读取这些候选路径再决定编辑目标。"
        : "建议生成修复计划，让 Forge 重新拆解动作并给出明确文件路径。"
    );

    return lines.join("\n");
  }

  const lines = [
    `Agent action target is not an executable project-relative path, so Forge stopped before touching files. ${reason}`
  ];

  if (candidates.files.length > 0) {
    lines.push(`Candidate files: ${candidates.files.join(", ")}`);
  }

  if (candidates.directories.length > 0) {
    lines.push(`Candidate directories: ${candidates.directories.join(", ")}`);
  }

  lines.push(
    hasCandidates
      ? "Generate a fix plan so Forge can inspect these candidates before choosing an edit target."
      : "Generate a fix plan so Forge can split the action again and choose an exact file path."
  );

  return lines.join("\n");
}

function findUniqueBasenameMatches(sourceText: string, filePaths: string[]): string[] {
  const basenameToPaths = new Map<string, string[]>();

  for (const filePath of filePaths) {
    const basename = filePath.split("/").at(-1);

    if (!basename) {
      continue;
    }

    basenameToPaths.set(basename, [...(basenameToPaths.get(basename) ?? []), filePath]);
  }

  return [...basenameToPaths.entries()]
    .filter(([basename, paths]) => paths.length === 1 && sourceText.includes(normalizeForMatch(basename)))
    .map(([, paths]) => paths[0]!)
    .filter(Boolean);
}

function buildKnownDirectorySet(filePaths: string[]): Set<string> {
  const directories = new Set<string>();

  for (const filePath of filePaths) {
    for (const directory of getParentDirectories(filePath)) {
      directories.add(directory);
    }
  }

  return directories;
}

function getParentDirectories(relativePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean);
  const directories: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    directories.push(parts.slice(0, index).join("/"));
  }

  return directories;
}

function extractPathTokens(value: string): string[] {
  const matches =
    value
      .replace(/\\/g, "/")
      .match(/[\p{L}\p{N}_.-]+(?:\/[\p{L}\p{N}_.-]+)+/gu) ?? [];

  return matches.map((match) => trimPathToken(match)).filter(Boolean);
}

function findKnownDirectoryPrefixes(token: string, knownDirectories: Set<string>): string[] {
  const parts = token.split("/").filter(Boolean);
  const prefixes: string[] = [];

  for (let index = 1; index <= parts.length; index += 1) {
    const prefix = parts.slice(0, index).join("/");

    if (knownDirectories.has(prefix)) {
      prefixes.push(prefix);
    }
  }

  return prefixes.slice(-1);
}

function trimPathToken(value: string): string {
  return value
    .replace(/^[`"'“”‘’]+/u, "")
    .replace(/[`"'“”‘’，。；;:：、]+$/u, "")
    .replace(/\/+$/u, "")
    .trim();
}

function normalizeForMatch(value: string): string {
  return value.replace(/\\/g, "/").toLocaleLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
