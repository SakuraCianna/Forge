// 本文件说明: 根据项目文件路径推断 UI 文件图标类型, 供文件树和预览标题复用
export type ProjectFileIconKind =
  | "archive"
  | "astro"
  | "audio"
  | "c"
  | "config"
  | "cpp"
  | "csharp"
  | "css"
  | "default"
  | "docker"
  | "document"
  | "eslint"
  | "git"
  | "go"
  | "html"
  | "image"
  | "java"
  | "javascript"
  | "json"
  | "jsx"
  | "kotlin"
  | "lock"
  | "lua"
  | "markdown"
  | "npm"
  | "pdf"
  | "php"
  | "postcss"
  | "powerpoint"
  | "powershell"
  | "python"
  | "ruby"
  | "rust"
  | "scss"
  | "spreadsheet"
  | "sql"
  | "svelte"
  | "swift"
  | "tailwind"
  | "terminal"
  | "text"
  | "toml"
  | "tsx"
  | "typescript"
  | "video"
  | "vite"
  | "vue"
  | "word"
  | "yaml";

const LANGUAGE_EXTENSION_KIND = new Map<string, ProjectFileIconKind>([
  ["astro", "astro"],
  ["c", "c"],
  ["cc", "cpp"],
  ["cpp", "cpp"],
  ["cs", "csharp"],
  ["css", "css"],
  ["go", "go"],
  ["h", "cpp"],
  ["hpp", "cpp"],
  ["html", "html"],
  ["java", "java"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["kt", "kotlin"],
  ["less", "css"],
  ["lua", "lua"],
  ["php", "php"],
  ["py", "python"],
  ["rb", "ruby"],
  ["rs", "rust"],
  ["scss", "scss"],
  ["sql", "sql"],
  ["svelte", "svelte"],
  ["swift", "swift"],
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["vue", "vue"]
]);

const FILE_NAME_ICON_KINDS = new Map<string, ProjectFileIconKind>([
  [".dockerignore", "docker"],
  [".gitattributes", "git"],
  [".gitignore", "git"],
  [".npmrc", "npm"],
  ["dockerfile", "docker"],
  ["eslint.config.js", "eslint"],
  ["package.json", "npm"],
  ["postcss.config.js", "postcss"],
  ["tailwind.config.js", "tailwind"],
  ["tsconfig.json", "typescript"],
  ["vite.config.js", "vite"]
]);

const CONFIG_FILE_NAMES = new Set([".editorconfig", ".env", ".env.example"]);
const CONFIG_EXTENSIONS = new Set(["conf", "config", "ini"]);
const DOCUMENT_EXTENSIONS = new Set(["odt", "rtf"]);
const TEXT_EXTENSIONS = new Set(["log", "txt"]);
const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"]);
const VIDEO_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"]);
const ARCHIVE_EXTENSIONS = new Set(["7z", "gz", "rar", "tar", "tgz", "zip"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "ods", "tsv", "xls", "xlsx"]);
const TERMINAL_EXTENSIONS = new Set(["bat", "cmd", "sh", "zsh"]);
const LOCK_EXTENSIONS = new Set(["lock"]);
const JSON_EXTENSIONS = new Set(["json", "json5", "jsonc", "jsonl"]);
const TERMINAL_FILE_NAMES = new Set(["makefile"]);

export function getProjectFileIconKind(relativePath: string): ProjectFileIconKind {
  const name = getProjectFileName(relativePath).toLowerCase();
  const extension = getProjectFileExtension(name);

  if (TERMINAL_FILE_NAMES.has(name)) {
    return "terminal";
  }

  const fileNameKind = FILE_NAME_ICON_KINDS.get(name);

  if (fileNameKind) {
    return fileNameKind;
  }

  if (LOCK_EXTENSIONS.has(extension) || name.endsWith("-lock.json")) {
    return "lock";
  }

  if (name.startsWith("readme") || extension === "md" || extension === "mdx") {
    return "markdown";
  }

  if (extension === "yaml" || extension === "yml") {
    return "yaml";
  }

  if (extension === "toml") {
    return "toml";
  }

  if (extension === "ps1") {
    return "powershell";
  }

  if (extension === "pdf") {
    return "pdf";
  }

  if (extension === "doc" || extension === "docx") {
    return "word";
  }

  if (extension === "ppt" || extension === "pptx") {
    return "powerpoint";
  }

  const languageKind = LANGUAGE_EXTENSION_KIND.get(extension);

  if (languageKind) {
    return languageKind;
  }

  if (JSON_EXTENSIONS.has(extension)) {
    return "json";
  }

  if (CONFIG_FILE_NAMES.has(name) || CONFIG_EXTENSIONS.has(extension)) {
    return "config";
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
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
