// Resolves editor-style folder icon kinds from project folder paths.
export type ProjectFolderIconKind =
  | "api"
  | "app"
  | "audio"
  | "components"
  | "config"
  | "database"
  | "default"
  | "dist"
  | "docs"
  | "git"
  | "github"
  | "images"
  | "node"
  | "public"
  | "routes"
  | "scripts"
  | "src"
  | "test"
  | "utils"
  | "video"
  | "vscode";

const FOLDER_NAME_KINDS = new Map<string, ProjectFolderIconKind>([
  [".git", "git"],
  [".github", "github"],
  [".vscode", "vscode"],
  ["api", "api"],
  ["app", "app"],
  ["audio", "audio"],
  ["backend", "api"],
  ["build", "dist"],
  ["components", "components"],
  ["config", "config"],
  ["configs", "config"],
  ["database", "database"],
  ["db", "database"],
  ["dist", "dist"],
  ["docs", "docs"],
  ["documentation", "docs"],
  ["frontend", "app"],
  ["icons", "images"],
  ["images", "images"],
  ["img", "images"],
  ["media", "images"],
  ["node_modules", "node"],
  ["out", "dist"],
  ["public", "public"],
  ["release", "dist"],
  ["routes", "routes"],
  ["scripts", "scripts"],
  ["src", "src"],
  ["static", "public"],
  ["test", "test"],
  ["tests", "test"],
  ["utils", "utils"],
  ["video", "video"],
  ["videos", "video"],
  ["views", "components"]
]);

export function getProjectFolderIconKind(relativePath: string): ProjectFolderIconKind {
  const folderName = getProjectFolderName(relativePath).toLowerCase();

  return FOLDER_NAME_KINDS.get(folderName) ?? "default";
}

function getProjectFolderName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/gu, "/");
  const parts = normalized.split("/").filter(Boolean);

  return parts.at(-1) ?? normalized;
}
