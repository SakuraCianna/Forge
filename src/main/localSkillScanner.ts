// 本文件说明: 扫描本机 Codex/Agent skill 元数据, 不执行任何 skill 脚本
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import type {
  LocalSkillFileContent,
  LocalSkillManifest,
  LocalPluginSkillCreateRequest,
  LocalPluginSkillCreateResult,
  LocalSkillScanResult,
  LocalSkillSource
} from "../shared/pluginSkillTypes.js";

type SkillRoot = {
  root: string;
  source: LocalSkillSource;
  sourceLabel: string;
  recursive: boolean;
};

const maxRecursiveEntries = 1400;
const maxSkillFiles = 500;
const maxSkillMarkdownBytes = 64 * 1024;
const maxSkillNameLength = 120;
const maxSkillDescriptionLength = 500;
const maxCoreFilesPerFolder = 8;
const maxSkillFileContentBytes = 256 * 1024;
const maxCreatedNameLength = 80;
const maxCreatedDescriptionLength = 280;

export async function scanLocalSkills(
  options: { homeDirectory?: string } = {}
): Promise<LocalSkillScanResult> {
  const roots = createSkillRoots(options.homeDirectory ?? homedir());
  const errors: LocalSkillScanResult["errors"] = [];
  const scannedRoots: string[] = [];
  const skillFiles: Array<{ filePath: string; root: SkillRoot }> = [];

  for (const root of roots) {
    if (!(await pathExists(root.root))) {
      continue;
    }

    scannedRoots.push(root.root);

    try {
      const files = root.recursive
        ? await findRecursiveSkillFiles(root.root)
        : await findDirectSkillFiles(root.root);

      for (const filePath of files) {
        if (skillFiles.length >= maxSkillFiles) {
          break;
        }

        skillFiles.push({ filePath, root });
      }
    } catch (error) {
      errors.push({
        root: root.root,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const skills: LocalSkillManifest[] = [];

  for (const item of skillFiles) {
    try {
      const markdown = await readFile(item.filePath, "utf8");
      const metadata = parseSkillMarkdown(markdown.slice(0, maxSkillMarkdownBytes));

      skills.push({
        id: createLocalSkillId(item.root, item.filePath),
        name: metadata.name || basename(item.filePath.replace(/[/\\]SKILL\.md$/iu, "")),
        description: metadata.description,
        filePath: item.filePath,
        coreFiles: await collectSkillCoreFiles(item.filePath),
        source: item.root.source,
        sourceLabel: item.root.sourceLabel,
        pluginName:
          item.root.source === "plugin-cache" || item.root.source === "plugin-local"
            ? inferPluginName(item.root.root, item.filePath)
            : undefined
      });
    } catch (error) {
      errors.push({
        root: item.filePath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    skills: dedupeSkills(skills),
    scannedRoots,
    errors
  };
}

export async function readLocalSkillFileContent(filePath: string): Promise<LocalSkillFileContent> {
  const requestedPath = filePath.trim();

  if (!requestedPath) {
    throw new Error("Skill file path is required");
  }

  const scanResult = await scanLocalSkills();
  const allowedFiles = new Map<string, string>();

  for (const skill of scanResult.skills) {
    for (const coreFile of skill.coreFiles) {
      const resolvedCoreFile = await realpathSafe(coreFile);

      if (resolvedCoreFile) {
        allowedFiles.set(resolvedCoreFile.toLowerCase(), coreFile);
      }
    }
  }

  const resolvedRequestedPath = await realpathSafe(requestedPath);

  if (!resolvedRequestedPath) {
    throw new Error("Skill file does not exist");
  }

  const allowedOriginalPath = allowedFiles.get(resolvedRequestedPath.toLowerCase());

  if (!allowedOriginalPath) {
    throw new Error("Skill file is not part of the scanned local skill catalog");
  }

  const fileStat = await lstat(resolvedRequestedPath);

  if (!fileStat.isFile()) {
    throw new Error("Skill file path must point to a file");
  }

  if (fileStat.size > maxSkillFileContentBytes) {
    throw new Error("Skill file is too large to preview");
  }

  return {
    filePath: allowedOriginalPath,
    content: await readFile(resolvedRequestedPath, "utf8"),
    size: fileStat.size
  };
}

export async function createLocalPluginSkill(
  request: LocalPluginSkillCreateRequest,
  options: { homeDirectory?: string } = {}
): Promise<LocalPluginSkillCreateResult> {
  const normalizedRequest = normalizeCreateRequest(request);
  const home = options.homeDirectory ?? homedir();
  const slug = slugify(normalizedRequest.name) || normalizedRequest.kind;

  if (normalizedRequest.kind === "skill") {
    const root = join(home, ".codex", "skills");
    const directoryPath = await createUniqueDirectory(root, slug);
    const primaryFilePath = join(directoryPath, "SKILL.md");

    await mkdir(directoryPath, { recursive: true });
    await writeFile(primaryFilePath, createSkillMarkdown(normalizedRequest), "utf8");

    return {
      kind: normalizedRequest.kind,
      id: basename(directoryPath),
      name: normalizedRequest.name,
      directoryPath,
      primaryFilePath,
      createdFiles: [primaryFilePath],
      scanResult: await scanLocalSkills({ homeDirectory: home })
    };
  }

  const root = join(home, ".codex", "plugins", "local");
  const directoryPath = await createUniqueDirectory(root, slug);
  const pluginManifestPath = join(directoryPath, ".claude-plugin", "plugin.json");
  const skillDirectoryPath = join(directoryPath, "skills", slug);
  const skillFilePath = join(skillDirectoryPath, "SKILL.md");
  const readmePath = join(directoryPath, "README.md");
  const createdFiles = [pluginManifestPath, skillFilePath, readmePath];

  await mkdir(dirname(pluginManifestPath), { recursive: true });
  await mkdir(skillDirectoryPath, { recursive: true });
  await writeFile(pluginManifestPath, createPluginManifestJson(normalizedRequest, slug), "utf8");
  await writeFile(skillFilePath, createSkillMarkdown(normalizedRequest), "utf8");
  await writeFile(readmePath, createPluginReadme(normalizedRequest), "utf8");

  return {
    kind: normalizedRequest.kind,
    id: basename(directoryPath),
    name: normalizedRequest.name,
    directoryPath,
    primaryFilePath: pluginManifestPath,
    createdFiles,
    scanResult: await scanLocalSkills({ homeDirectory: home })
  };
}

function createSkillRoots(home: string): SkillRoot[] {
  return [
    {
      root: join(home, ".codex", "skills"),
      source: "codex",
      sourceLabel: "Codex local skills",
      recursive: false
    },
    {
      root: join(home, ".agents", "skills"),
      source: "agents",
      sourceLabel: "Agent local skills",
      recursive: false
    },
    {
      root: join(home, ".codex", "plugins", "cache"),
      source: "plugin-cache",
      sourceLabel: "Codex plugin cache",
      recursive: true
    },
    {
      root: join(home, ".codex", "plugins", "local"),
      source: "plugin-local",
      sourceLabel: "Codex local plugins",
      recursive: true
    }
  ];
}

async function findDirectSkillFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = join(root, entry.name, "SKILL.md");

    if (await isRegularFile(skillPath)) {
      files.push(skillPath);
    }
  }

  return files;
}

async function findRecursiveSkillFiles(root: string): Promise<string[]> {
  const queue = [root];
  const files: string[] = [];
  let visited = 0;

  while (queue.length > 0 && visited < maxRecursiveEntries && files.length < maxSkillFiles) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    visited += 1;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const nextPath = join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(nextPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
        files.push(nextPath);
      }
    }
  }

  return files;
}

function parseSkillMarkdown(markdown: string): { name: string; description: string } {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/u.exec(markdown)?.[1] ?? "";
  const name = trimMetadataValue(
    parseFrontmatterValue(frontmatter, "name") || parseHeading(markdown),
    maxSkillNameLength
  );
  const description = trimMetadataValue(
    parseFrontmatterValue(frontmatter, "description") ||
    parseFirstParagraph(markdown) ||
      "Local skill discovered on this computer",
    maxSkillDescriptionLength
  );

  return { name, description };
}

function parseFrontmatterValue(frontmatter: string, key: string): string {
  const lines = frontmatter.split(/\r?\n/u);
  const pattern = new RegExp(`^${key}:\\s*(.*)$`, "iu");

  for (let index = 0; index < lines.length; index += 1) {
    const value = pattern.exec(lines[index])?.[1]?.trim();

    if (value === undefined) {
      continue;
    }

    if (/^[>|][+-]?$/u.test(value)) {
      return parseFrontmatterBlockScalar(lines, index + 1, value.startsWith(">"));
    }

    return value.replace(/^["']|["']$/gu, "");
  }

  return "";
}

function parseFrontmatterBlockScalar(
  lines: string[],
  startIndex: number,
  folded: boolean
): string {
  const blockLines: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^[A-Za-z0-9_-]+:\s*/u.test(line)) {
      break;
    }

    if (line.trim() && !/^\s/u.test(line)) {
      break;
    }

    blockLines.push(line);
  }

  const indentedLines = blockLines.filter((line) => line.trim());
  const minIndent =
    indentedLines.length > 0
      ? Math.min(...indentedLines.map((line) => /^\s*/u.exec(line)?.[0].length ?? 0))
      : 0;
  const normalizedLines = blockLines.map((line) => (line.trim() ? line.slice(minIndent) : ""));

  return folded
    ? normalizedLines.join(" ").replace(/\s+/gu, " ").trim()
    : normalizedLines.join("\n").trim();
}

function parseHeading(markdown: string): string {
  return /^#\s+(.+)$/mu.exec(markdown)?.[1]?.trim() ?? "";
}

function parseFirstParagraph(markdown: string): string {
  return markdown
    .replace(/^---\s*\n[\s\S]*?\n---/u, "")
    .split(/\n{2,}/u)
    .map((part) => part.replace(/^#+\s*/u, "").trim())
    .find(Boolean) ?? "";
}

function inferPluginName(root: string, filePath: string): string | undefined {
  const segments = relative(root, filePath).split(sep);
  const skillsIndex = segments.findIndex((segment) => segment === "skills");

  if (skillsIndex >= 2) {
    return segments[skillsIndex - 2];
  }

  if (skillsIndex >= 1) {
    return segments[skillsIndex - 1];
  }

  return segments[0];
}

function createLocalSkillId(root: SkillRoot, filePath: string): string {
  return `local:${root.source}:${relative(root.root, filePath).replace(/\\/gu, "/")}`;
}

function dedupeSkills(skills: LocalSkillManifest[]): LocalSkillManifest[] {
  const byPath = new Map<string, LocalSkillManifest>();

  skills.forEach((skill) => {
    byPath.set(skill.filePath.toLowerCase(), skill);
  });

  return Array.from(byPath.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

async function collectSkillCoreFiles(skillFilePath: string): Promise<string[]> {
  const skillDir = dirname(skillFilePath);
  const coreFiles = [skillFilePath];

  for (const folderName of ["scripts", "references", "assets"]) {
    const folderPath = join(skillDir, folderName);
    const folderStat = await lstat(folderPath).catch(() => null);

    if (!folderStat?.isDirectory()) {
      continue;
    }

    const entries = await readdir(folderPath, { withFileTypes: true }).catch(() => []);
    let collectedFromFolder = 0;

    for (const entry of entries) {
      if (collectedFromFolder >= maxCoreFilesPerFolder) {
        break;
      }

      const coreFilePath = join(folderPath, entry.name);

      if (entry.isFile() && (await isRegularFile(coreFilePath))) {
        coreFiles.push(coreFilePath);
        collectedFromFolder += 1;
      }
    }
  }

  return coreFiles;
}

function trimMetadataValue(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeCreateRequest(
  request: LocalPluginSkillCreateRequest
): Required<LocalPluginSkillCreateRequest> {
  const kind = request.kind === "plugin" ? "plugin" : "skill";
  const fallbackName = kind === "plugin" ? "New Plugin" : "New Skill";
  const name = trimMetadataValue(request.name || fallbackName, maxCreatedNameLength) || fallbackName;
  const description =
    trimMetadataValue(
      request.description ||
        (kind === "plugin"
          ? "Local Forge plugin scaffold created by the user."
          : "Local Forge skill scaffold created by the user."),
      maxCreatedDescriptionLength
    ) || "Local Forge scaffold created by the user.";

  return { kind, name, description };
}

async function createUniqueDirectory(root: string, slug: string): Promise<string> {
  await mkdir(root, { recursive: true });

  for (let index = 0; index < 200; index += 1) {
    const candidateName = index === 0 ? slug : `${slug}-${index + 1}`;
    const candidatePath = join(root, candidateName);

    if (!(await pathExists(candidatePath))) {
      return candidatePath;
    }
  }

  throw new Error(`Unable to allocate a unique local scaffold directory for ${slug}`);
}

function createSkillMarkdown({
  description,
  name
}: Required<LocalPluginSkillCreateRequest>): string {
  return [
    "---",
    `name: ${formatYamlString(name)}`,
    `description: ${formatYamlString(description)}`,
    "---",
    "",
    `# ${name}`,
    "",
    description,
    "",
    "## When To Use",
    "",
    "- Use this skill when the user's request clearly matches the workflow above.",
    "",
    "## Workflow",
    "",
    "1. Read the user's latest request and the relevant project files first.",
    "2. Produce a short plan before editing when the task changes code.",
    "3. Make focused changes and verify the result before reporting completion."
  ].join("\n");
}

function createPluginManifestJson(
  request: Required<LocalPluginSkillCreateRequest>,
  slug: string
): string {
  const manifest = {
    name: request.name,
    description: request.description,
    version: "0.1.0",
    skills: [`skills/${slug}/SKILL.md`]
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function createPluginReadme({ description, name }: Required<LocalPluginSkillCreateRequest>): string {
  return [
    `# ${name}`,
    "",
    description,
    "",
    "This local plugin scaffold was created by Forge. Add more skills under `skills/` and keep metadata in `.claude-plugin/plugin.json`."
  ].join("\n");
}

function formatYamlString(value: string): string {
  return JSON.stringify(value);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 64);
}

async function isRegularFile(path: string): Promise<boolean> {
  const fileStat = await lstat(path).catch(() => null);

  return fileStat?.isFile() ?? false;
}

async function realpathSafe(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
