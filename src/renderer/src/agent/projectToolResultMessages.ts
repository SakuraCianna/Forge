// 本文件说明: 将受控项目工具结果压缩成 Agent 线程时间线里的可读摘要
import type {
  ProjectDirectoryListResult,
  ProjectFileGlobResult,
  ProjectTextFile,
  ProjectTextSearchResult
} from "@shared/fileTypes";
import type { ProjectGitStatus } from "@shared/gitTypes";
import type { Language } from "@shared/modelTypes";

export function formatProjectFileReadResultMessage(
  language: Language,
  file: ProjectTextFile
): string {
  const content = file.content.trim();
  const preview = content ? content.split(/\r?\n/u).slice(0, 80).join("\n").slice(0, 5000) : "";
  const header =
    language === "zh-CN"
      ? `文件读取完成: ${file.relativePath} (${file.size} bytes${preview.length < content.length ? ", 已截断" : ""})`
      : `File read complete: ${file.relativePath} (${file.size} bytes${preview.length < content.length ? ", truncated" : ""})`;

  return preview
    ? [header, "Content preview:", preview].join("\n")
    : `${header}\n${language === "zh-CN" ? "文件为空。" : "File is empty."}`;
}

export function formatProjectSearchResultMessage(
  language: Language,
  result: ProjectTextSearchResult
): string {
  const header =
    language === "zh-CN"
      ? `项目搜索完成: ${result.query} (${result.matches.length} 个结果${result.truncated ? ", 已截断" : ""})`
      : `Project search complete: ${result.query} (${result.matches.length} ${result.matches.length === 1 ? "result" : "results"}${result.truncated ? ", truncated" : ""})`;

  if (result.matches.length === 0) {
    return `${header}\n${language === "zh-CN" ? "未找到匹配项。" : "No matches found."}`;
  }

  const lines = result.matches.slice(0, 12).map((match) => {
    const location = `${match.relativePath}:${match.lineNumber}`;

    return `- ${location} ${match.preview}`;
  });
  const remaining = result.matches.length - lines.length;

  if (remaining > 0) {
    lines.push(language === "zh-CN" ? `- 还有 ${remaining} 个结果未显示` : `- ${remaining} more not shown`);
  }

  return [header, ...lines].join("\n");
}

export function formatProjectDirectoryListResultMessage(
  language: Language,
  result: ProjectDirectoryListResult
): string {
  const header =
    language === "zh-CN"
      ? `目录列表完成: ${result.relativePath} (${result.entries.length} 个条目${result.truncated ? ", 已截断" : ""})`
      : `Directory list complete: ${result.relativePath} (${result.entries.length} ${result.entries.length === 1 ? "entry" : "entries"}${result.truncated ? ", truncated" : ""})`;

  if (result.entries.length === 0) {
    return `${header}\n${language === "zh-CN" ? "目录为空。" : "Directory is empty."}`;
  }

  const lines = result.entries.slice(0, 24).map((entry) => {
    const label = entry.kind === "directory" ? "/" : ` ${entry.size ?? 0} bytes`;

    return `- ${entry.relativePath}${label}`;
  });
  const remaining = result.entries.length - lines.length;

  if (remaining > 0) {
    lines.push(language === "zh-CN" ? `- 还有 ${remaining} 个条目未显示` : `- ${remaining} more not shown`);
  }

  return [header, ...lines].join("\n");
}

export function formatProjectGitStatusMessage(
  language: Language,
  status: ProjectGitStatus
): string {
  if (!status.isRepo) {
    return language === "zh-CN"
      ? "Git 状态完成: 当前项目不是 Git 仓库。"
      : "Git status complete: current project is not a Git repository.";
  }

  if (status.changedFiles.length === 0) {
    return language === "zh-CN"
      ? "Git 状态完成: 工作区干净。"
      : "Git status complete: working tree is clean.";
  }

  const header =
    language === "zh-CN"
      ? `Git 状态完成: ${status.changedFiles.length} 个文件有改动`
      : `Git status complete: ${status.changedFiles.length} ${status.changedFiles.length === 1 ? "file" : "files"} changed`;
  const fileLines = status.changes.slice(0, 12).map((change) =>
    `- ${change.path} (${formatGitStatus(change.status, language)})`
  );
  const remaining = status.changedFiles.length - fileLines.length;
  const diffLines = status.changes
    .flatMap((change) => change.diff.split(/\r?\n/u).filter(Boolean).slice(0, 8))
    .slice(0, 18)
    .map((line) => `  ${line.slice(0, 180)}`);

  if (remaining > 0) {
    fileLines.push(language === "zh-CN" ? `- 还有 ${remaining} 个文件未显示` : `- ${remaining} more not shown`);
  }

  if (diffLines.length === 0) {
    return [header, ...fileLines].join("\n");
  }

  return [
    header,
    ...fileLines,
    "",
    language === "zh-CN" ? "Diff 摘要:" : "Diff summary:",
    ...diffLines
  ].join("\n");
}

export function formatProjectGlobResultMessage(
  language: Language,
  result: ProjectFileGlobResult
): string {
  const header =
    language === "zh-CN"
      ? `文件匹配完成: ${result.pattern} (${result.matches.length} 个文件${result.truncated ? ", 已截断" : ""})`
      : `File glob complete: ${result.pattern} (${result.matches.length} ${result.matches.length === 1 ? "file" : "files"}${result.truncated ? ", truncated" : ""})`;

  if (result.matches.length === 0) {
    return `${header}\n${language === "zh-CN" ? "未找到匹配文件。" : "No matching files found."}`;
  }

  const lines = result.matches.slice(0, 20).map((match) => `- ${match.relativePath} (${match.size} bytes)`);
  const remaining = result.matches.length - lines.length;

  if (remaining > 0) {
    lines.push(language === "zh-CN" ? `- 还有 ${remaining} 个文件未显示` : `- ${remaining} more not shown`);
  }

  return [header, ...lines].join("\n");
}

export function formatGitStatus(status: string, language: Language): string {
  if (status === "??") {
    return language === "zh-CN" ? "未跟踪" : "new";
  }

  if (status.includes("D")) {
    return language === "zh-CN" ? "已删除" : "deleted";
  }

  if (status.includes("R")) {
    return language === "zh-CN" ? "已重命名" : "renamed";
  }

  if (status.includes("A")) {
    return language === "zh-CN" ? "已新增" : "added";
  }

  return language === "zh-CN" ? "已修改" : "modified";
}
