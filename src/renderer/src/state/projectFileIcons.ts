// 本文件说明: 根据项目文件路径推断 UI 文件图标类型, 供文件树和预览标题复用
export type ProjectFileIconKind =
  | "archive"
  | "audio"
  | "code"
  | "config"
  | "document"
  | "image"
  | "json"
  | "lock"
  | "pdf"
  | "spreadsheet"
  | "terminal"
  | "text"
  | "video"
  | "default";

const CODE_EXTENSIONS = new Set([
  "astro",
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "less",
  "lua",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sql",
  "svelte",
  "swift",
  "ts",
  "tsx",
  "vue"
]);
const CONFIG_EXTENSIONS = new Set(["conf", "config", "ini", "toml", "yaml", "yml"]);
const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "odt", "ppt", "pptx", "rtf"]);
const TEXT_EXTENSIONS = new Set(["log", "md", "mdx", "txt"]);
const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"]);
const ARCHIVE_EXTENSIONS = new Set(["7z", "gz", "rar", "tar", "tgz", "zip"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "ods", "tsv", "xls", "xlsx"]);
const TERMINAL_EXTENSIONS = new Set(["bat", "cmd", "ps1", "sh", "zsh"]);
const LOCK_EXTENSIONS = new Set(["lock"]);
const JSON_EXTENSIONS = new Set(["json", "json5", "jsonc", "jsonl"]);

const CONFIG_FILE_NAMES = new Set([
  ".dockerignore",
  ".editorconfig",
  ".env",
  ".env.example",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  "dockerfile",
  "eslint.config.js",
  "package.json",
  "postcss.config.js",
  "tailwind.config.js",
  "tsconfig.json",
  "vite.config.js"
]);
const TERMINAL_FILE_NAMES = new Set(["makefile"]);

export function getProjectFileIconKind(relativePath: string): ProjectFileIconKind {
  const name = getProjectFileName(relativePath).toLowerCase();
  const extension = getProjectFileExtension(name);

  if (TERMINAL_FILE_NAMES.has(name)) {
    return "terminal";
  }

  if (CONFIG_FILE_NAMES.has(name)) {
    return "config";
  }

  if (LOCK_EXTENSIONS.has(extension) || name.endsWith("-lock.json")) {
    return "lock";
  }

  if (JSON_EXTENSIONS.has(extension)) {
    return "json";
  }

  if (extension === "pdf") {
    return "pdf";
  }

  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }

  if (CONFIG_EXTENSIONS.has(extension)) {
    return "config";
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }

  if (TEXT_EXTENSIONS.has(extension) || name.startsWith("readme")) {
    return "text";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return "archive";
  }

  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return "spreadsheet";
  }

  if (TERMINAL_EXTENSIONS.has(extension)) {
    return "terminal";
  }

  return "default";
}

function getProjectFileName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/gu, "/");
  const parts = normalized.split("/").filter(Boolean);

  return parts.at(-1) ?? normalized;
}

function getProjectFileExtension(name: string): string {
  const segments = name.split(".");

  return segments.length > 1 ? (segments.at(-1) ?? "") : "";
}
