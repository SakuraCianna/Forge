// 本文件说明: 解析项目根目录 .gitignore, 为文件索引和受控文件工具提供统一忽略规则
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type IgnoreRule = {
  negated: boolean;
  directoryOnly: boolean;
  matches: (relativePath: string, isDirectory: boolean) => boolean;
};

export type ProjectIgnoreMatcher = (relativePath: string, isDirectory?: boolean) => boolean;

// 读取根目录 .gitignore 并生成路径匹配器, .git 目录始终隐藏以避免索引仓库内部数据
export async function createProjectIgnoreMatcher(rootPath: string): Promise<ProjectIgnoreMatcher> {
  const rules = await readProjectIgnoreRules(rootPath);

  return (relativePath, isDirectory = false) => {
    const normalizedPath = normalizeRelativePath(relativePath)
      .replace(/^\.\//u, "")
      .replace(/\/+$/u, "");

    if (!normalizedPath || normalizedPath === ".") {
      return false;
    }

    if (normalizedPath.split("/").includes(".git")) {
      return true;
    }

    let ignored = false;

    for (const rule of rules) {
      if (rule.matches(normalizedPath, isDirectory)) {
        ignored = !rule.negated;
      }
    }

    return ignored;
  };
}

// 将 .gitignore 的有效行转换为按顺序生效的匹配规则
async function readProjectIgnoreRules(rootPath: string): Promise<IgnoreRule[]> {
  try {
    const content = await readFile(join(rootPath, ".gitignore"), "utf8");

    return content
      .split(/\r?\n/u)
      .map(parseIgnoreRule)
      .filter((rule): rule is IgnoreRule => Boolean(rule));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

// 解析单条 .gitignore 规则, 覆盖常见的根路径, 目录, 通配符和取反语义
function parseIgnoreRule(line: string): IgnoreRule | null {
  let pattern = line.trim();

  if (!pattern || pattern.startsWith("#")) {
    return null;
  }

  if (pattern.startsWith("\\#")) {
    pattern = pattern.slice(1);
  }

  const negated = pattern.startsWith("!");

  if (negated) {
    pattern = pattern.slice(1).trim();
  }

  const directoryOnly = pattern.endsWith("/");
  const rooted = pattern.startsWith("/");
  const normalizedPattern = normalizeRelativePath(pattern)
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "");

  if (!normalizedPattern) {
    return null;
  }

  const hasSlash = normalizedPattern.includes("/");

  return {
    negated,
    directoryOnly,
    matches: hasSlash
      ? createPathRuleMatcher(normalizedPattern, directoryOnly)
      : createSegmentRuleMatcher(normalizedPattern, directoryOnly, rooted)
  };
}

// 匹配包含路径分隔符的忽略规则, 根 .gitignore 中这类规则按项目相对路径判断
function createPathRuleMatcher(
  pattern: string,
  directoryOnly: boolean
): IgnoreRule["matches"] {
  const regex = new RegExp(`^${globPatternToRegexSource(pattern)}$`, "iu");

  return (relativePath, isDirectory) => {
    if (directoryOnly && !isDirectory) {
      return false;
    }

    return regex.test(relativePath);
  };
}

// 匹配不含斜杠的忽略规则, 可命中任意层级的文件名或目录名
function createSegmentRuleMatcher(
  pattern: string,
  directoryOnly: boolean,
  rooted: boolean
): IgnoreRule["matches"] {
  const regex = new RegExp(`^${globPatternToRegexSource(pattern)}$`, "iu");

  return (relativePath, isDirectory) => {
    if (directoryOnly && !isDirectory) {
      return false;
    }

    const segments = rooted ? [relativePath.split("/")[0] ?? ""] : relativePath.split("/");

    return segments.some((segment) => regex.test(segment));
  };
}

// 将轻量 glob 片段转换为正则片段, 支持 *, ** 和 ?
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

// 统一 Windows 和 POSIX 路径分隔符, 让忽略规则只处理一种路径形态
function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/");
}

// 转义正则特殊字符, 保留 glob 编译逻辑的最小语义
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// 识别缺失的 .gitignore, 非缺失错误继续抛出
function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
