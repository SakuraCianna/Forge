// 本文件说明: 在项目根目录内安全读取, 预览和写入文本文件
import type { Dirent, Stats } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type {
  ProjectDirectoryEntry,
  ProjectDirectoryListRequest,
  ProjectDirectoryListResult,
  ProjectFileGlobMatch,
  ProjectFileGlobRequest,
  ProjectFileGlobResult,
  ProjectFileDeleteResult,
  ProjectFilePreview,
  ProjectFileChangePreview,
  ProjectTextFile
} from "../shared/fileTypes.js";
import {
  assertProjectPathNotSensitive,
  isSensitiveProjectPath
} from "../shared/sensitiveProjectFiles.js";
import { createLineDiff } from "../shared/textDiff.js";
import { createProjectIgnoreMatcher } from "./projectIgnore.js";
export { searchProjectTextFiles } from "./projectTextSearchIndex.js";

type ReadProjectTextFileOptions = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

type ProjectTextFileSnapshot = ProjectTextFile & {
  exists: boolean;
};

const maxInlinePreviewBytes = 40 * 1024 * 1024;

// 读取文本文件前检查路径边界和大小, 防止大文件拖慢预览
export async function readProjectTextFile({
  projectRoot,
  relativePath,
  maxBytes = 256000
}: ReadProjectTextFileOptions): Promise<ProjectTextFile> {
  const { fileStat, normalizedRelativePath, resolvedFilePath } = await resolveProjectFileForRead(
    projectRoot,
    relativePath
  );

  if (fileStat.size > maxBytes) {
    throw new Error("File is too large to preview");
  }

  return {
    relativePath: normalizedRelativePath,
    content: await readFile(resolvedFilePath, "utf8"),
    size: fileStat.size
  };
}

// 预览任意项目文件；文本保留源码高亮，二进制只为浏览器原生支持的类型生成内嵌 data URL
export async function previewProjectFile({
  projectRoot,
  relativePath,
  maxBytes = 256000
}: ReadProjectTextFileOptions): Promise<ProjectFilePreview> {
  const { fileStat, normalizedRelativePath, resolvedFilePath } = await resolveProjectFileForRead(
    projectRoot,
    relativePath
  );
  const media = resolvePreviewMedia(normalizedRelativePath);

  if (media.kind === "text") {
    if (fileStat.size > maxBytes) {
      return createUnavailablePreview(
        normalizedRelativePath,
        fileStat.size,
        media.mediaType,
        "unsupported",
        "Text file is too large to preview"
      );
    }

    return {
      relativePath: normalizedRelativePath,
      content: await readFile(resolvedFilePath, "utf8"),
      kind: "text",
      mediaType: media.mediaType,
      size: fileStat.size
    };
  }

  if (media.kind === "unknown" && fileStat.size <= maxBytes) {
    const content = await readFile(resolvedFilePath, "utf8");

    if (!content.includes("\u0000")) {
      return {
        relativePath: normalizedRelativePath,
        content,
        kind: "text",
        mediaType: "text/plain; charset=utf-8",
        size: fileStat.size
      };
    }
  }

  if (media.kind === "office") {
    return createUnavailablePreview(
      normalizedRelativePath,
      fileStat.size,
      media.mediaType,
      "office",
      "Office document preview requires document conversion"
    );
  }

  if (media.kind === "unknown") {
    return createUnavailablePreview(
      normalizedRelativePath,
      fileStat.size,
      media.mediaType,
      "unsupported",
      "File type is not supported for inline preview"
    );
  }

  if (fileStat.size > maxInlinePreviewBytes) {
    return createUnavailablePreview(
      normalizedRelativePath,
      fileStat.size,
      media.mediaType,
      "unsupported",
      "File is too large for inline preview"
    );
  }

  const buffer = await readFile(resolvedFilePath);

  return {
    relativePath: normalizedRelativePath,
    dataUrl: `data:${media.mediaType};base64,${buffer.toString("base64")}`,
    kind: media.kind,
    mediaType: media.mediaType,
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
    diff: createLineDiff(currentFile.content, nextContent),
    changeKind: classifyProjectTextFileChange(currentFile, nextContent)
  };
}

// 列出项目内单个目录, 供 Agent inspect 目录时使用, 不读取文件内容
export async function listProjectDirectory({
  includeGitIgnored = false,
  projectRoot,
  relativePath = ".",
  limit,
  offset
}: ProjectDirectoryListRequest): Promise<ProjectDirectoryListResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const normalizedRelativePath = normalizeDirectoryRelativePath(relativePath);
  const resultLimit = normalizeOptionalResultLimit(limit, 300);
  const resultOffset = normalizeOptionalResultOffset(offset);
  const ignoreMatcher = includeGitIgnored ? null : await createProjectIgnoreMatcher(resolvedProjectRoot);

  if (normalizedRelativePath !== ".") {
    assertProjectPathNotSensitive(normalizedRelativePath);
  }

  const absoluteDirectoryPath = resolve(
    resolvedProjectRoot,
    normalizedRelativePath === "." ? "." : normalizedRelativePath
  );

  if (!isPathInside(absoluteDirectoryPath, resolvedProjectRoot)) {
    throw new Error("Directory path must stay inside the selected project");
  }

  const resolvedDirectoryPath = await realpath(absoluteDirectoryPath);

  if (!isPathInside(resolvedDirectoryPath, resolvedProjectRoot)) {
    throw new Error("Directory path must stay inside the selected project");
  }

  const directoryStat = await stat(resolvedDirectoryPath);

  if (!directoryStat.isDirectory()) {
    throw new Error("Directory path must point to a folder");
  }

  const entries: ProjectDirectoryEntry[] = [];
  let truncated = false;
  let visibleEntryIndex = 0;

  for (const entry of await readSortedDirectoryEntries(resolvedDirectoryPath)) {
    const absolutePath = `${resolvedDirectoryPath}${sep}${entry.name}`;
    const entryRelativePath = normalizeRelativePath(relative(resolvedProjectRoot, absolutePath));

    if (isSensitiveProjectPath(entryRelativePath)) {
      continue;
    }

    if (ignoreMatcher?.(entryRelativePath, entry.isDirectory())) {
      continue;
    }

    if (!entry.isDirectory() && !entry.isFile()) {
      continue;
    }

    if (visibleEntryIndex < resultOffset) {
      visibleEntryIndex += 1;
      continue;
    }

    if (hasReachedLimit(entries.length, resultLimit)) {
      truncated = true;
      break;
    }

    visibleEntryIndex += 1;

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
    truncated,
    nextOffset: truncated ? resultOffset + entries.length : undefined
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
    throw new Error("File path must stay inside the selected project");
  }

  const existingResolvedFilePath = await resolveExistingFilePath(absoluteFilePath);

  if (existingResolvedFilePath && !isPathInside(existingResolvedFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  await mkdir(dirname(absoluteFilePath), { recursive: true });
  const resolvedParentPath = await realpath(dirname(absoluteFilePath));

  if (!isPathInside(resolvedParentPath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  await writeFile(existingResolvedFilePath ?? absoluteFilePath, nextContent, "utf8");

  return readProjectTextFile({ projectRoot, relativePath: normalizedRelativePath });
}

// 新文件预览使用空内容作为旧版本, 让 Agent 可以先生成再审查
// 安全删除项目内的单个普通文件, 让删除也能进入文件变更统计和最终总结
export async function deleteProjectFile({
  projectRoot,
  relativePath
}: Pick<ReadProjectTextFileOptions, "projectRoot" | "relativePath">): Promise<ProjectFileDeleteResult> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  assertProjectPathNotSensitive(normalizedRelativePath);

  const absoluteFilePath = resolve(resolvedProjectRoot, normalizedRelativePath);

  if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  const resolvedFilePath = await realpath(absoluteFilePath);

  if (!isPathInside(resolvedFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  const fileStat = await lstat(absoluteFilePath);

  if (!fileStat.isFile()) {
    throw new Error("File path must point to a file");
  }

  await unlink(absoluteFilePath);

  return {
    relativePath: normalizedRelativePath,
    size: fileStat.size
  };
}

async function readProjectTextFileOrEmpty({
  projectRoot,
  relativePath,
  maxBytes
}: ReadProjectTextFileOptions): Promise<ProjectTextFileSnapshot> {
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  assertProjectPathNotSensitive(normalizedRelativePath);

  try {
    const file = await readProjectTextFile({ projectRoot, relativePath: normalizedRelativePath, maxBytes });

    return {
      ...file,
      exists: true
    };
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }

    const resolvedProjectRoot = await realpath(projectRoot);
    const absoluteFilePath = resolve(resolvedProjectRoot, relativePath);

    if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
      throw new Error("File path must stay inside the selected project", { cause: error });
    }

    return {
      relativePath: normalizedRelativePath,
      content: "",
      size: 0,
      exists: false
    };
  }
}

function classifyProjectTextFileChange(
  currentFile: ProjectTextFileSnapshot,
  _nextContent: string
): ProjectFileChangePreview["changeKind"] {
  if (!currentFile.exists) {
    return "create";
  }

  return "edit";
}

// 文件预览辅助: 统一路径校验和轻量 MIME 分类
type ResolvedProjectFileForRead = {
  fileStat: Stats;
  normalizedRelativePath: string;
  resolvedFilePath: string;
};

type ProjectPreviewMedia =
  | { kind: "text"; mediaType: string }
  | { kind: "image" | "pdf" | "audio" | "video"; mediaType: string }
  | { kind: "office"; mediaType: string }
  | { kind: "unknown"; mediaType: string };

async function resolveProjectFileForRead(
  projectRoot: string,
  relativePath: string
): Promise<ResolvedProjectFileForRead> {
  const resolvedProjectRoot = await realpath(projectRoot);
  const normalizedRelativePath = normalizeRelativePath(relativePath);

  assertProjectPathNotSensitive(normalizedRelativePath);

  const absoluteFilePath = resolve(resolvedProjectRoot, relativePath);

  if (!isPathInside(absoluteFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  const resolvedFilePath = await realpath(absoluteFilePath);

  if (!isPathInside(resolvedFilePath, resolvedProjectRoot)) {
    throw new Error("File path must stay inside the selected project");
  }

  const fileStat = await stat(resolvedFilePath);

  if (!fileStat.isFile()) {
    throw new Error("File path must point to a file");
  }

  return {
    fileStat,
    normalizedRelativePath,
    resolvedFilePath
  };
}

function createUnavailablePreview(
  relativePath: string,
  size: number,
  mediaType: string,
  kind: "office" | "unsupported",
  reason: string
): ProjectFilePreview {
  return {
    relativePath,
    kind,
    mediaType,
    reason,
    size
  };
}

function resolvePreviewMedia(relativePath: string): ProjectPreviewMedia {
  const extension = getFileExtension(relativePath);

  if (extension === "pdf") {
    return { kind: "pdf", mediaType: "application/pdf" };
  }

  const imageMediaType = imageMediaTypeByExtension[extension];

  if (imageMediaType) {
    return { kind: "image", mediaType: imageMediaType };
  }

  const audioMediaType = audioMediaTypeByExtension[extension];

  if (audioMediaType) {
    return { kind: "audio", mediaType: audioMediaType };
  }

  const videoMediaType = videoMediaTypeByExtension[extension];

  if (videoMediaType) {
    return { kind: "video", mediaType: videoMediaType };
  }

  const officeMediaType = officeMediaTypeByExtension[extension];

  if (officeMediaType) {
    return { kind: "office", mediaType: officeMediaType };
  }

  const textMediaType = textMediaTypeByExtension[extension];

  if (textMediaType) {
    return { kind: "text", mediaType: textMediaType };
  }

  return { kind: "unknown", mediaType: "application/octet-stream" };
}

function getFileExtension(relativePath: string): string {
  const fileName = normalizeRelativePath(relativePath).split("/").pop() ?? "";
  const match = /\.([^.]+)$/u.exec(fileName);

  return match?.[1]?.toLocaleLowerCase() ?? "";
}

const imageMediaTypeByExtension: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp"
};

const audioMediaTypeByExtension: Record<string, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav"
};

const videoMediaTypeByExtension: Record<string, string> = {
  avi: "video/x-msvideo",
  m4v: "video/mp4",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm"
};

const officeMediaTypeByExtension: Record<string, string> = {
  doc: "application/msword",
  docm: "application/vnd.ms-word.document.macroenabled.12",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dot: "application/msword",
  dotx: "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  potx: "application/vnd.openxmlformats-officedocument.presentationml.template",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  word: "application/msword",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

const textMediaTypeByExtension: Record<string, string> = {
  css: "text/css; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  jsonc: "application/json; charset=utf-8",
  jsonl: "application/jsonlines; charset=utf-8",
  jsx: "text/javascript; charset=utf-8",
  log: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  mdx: "text/markdown; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  ts: "text/typescript; charset=utf-8",
  tsx: "text/typescript; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  yaml: "application/yaml; charset=utf-8",
  yml: "application/yaml; charset=utf-8"
};

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

// offset 针对过滤后的可见目录项计算, 避免敏感文件和 gitignore 规则改变分页位置
function normalizeOptionalResultOffset(offset: number | undefined): number {
  if (typeof offset !== "number" || !Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(1_000_000, Math.max(0, Math.round(offset)));
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
    throw new Error("Directory path cannot contain parent segments");
  }

  return normalized;
}

// 归一化 glob 模式, 避免用上级目录表达绕过项目边界
function normalizeGlobPattern(pattern: string): string {
  const normalized = normalizeRelativePath(pattern.trim())
    .replace(/^\.\//u, "")
    .slice(0, 220);

  if (!normalized) {
    throw new Error("File glob pattern is required");
  }

  if (normalized.split("/").includes("..")) {
    throw new Error("File glob pattern cannot contain parent segments");
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
