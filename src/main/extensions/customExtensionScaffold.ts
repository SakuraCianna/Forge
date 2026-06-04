// 本文件说明: 创建和读取用户本地扩展草稿, 只处理 manifest, 不执行用户代码
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
  ExtensionCreateRequest,
  ExtensionManifest
} from "../../shared/extensionTypes.js";

const maxExtensionNameLength = 80;
const maxExtensionDescriptionLength = 280;

export type CustomExtensionScaffoldResult = {
  manifest: ExtensionManifest;
  directoryPath: string;
  manifestPath: string;
  readmePath: string;
  createdFiles: string[];
};

export async function readCustomExtensionManifests(
  directory: string
): Promise<ExtensionManifest[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const manifests: ExtensionManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = join(directory, entry.name, "extension.json");
    const manifest = await readCustomExtensionManifest(manifestPath);

    if (manifest) {
      manifests.push(manifest);
    }
  }

  return manifests.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

export async function createCustomExtensionScaffold({
  directory,
  request
}: {
  directory: string;
  request: ExtensionCreateRequest;
}): Promise<CustomExtensionScaffoldResult> {
  const normalized = normalizeCreateRequest(request);
  const slug = slugify(normalized.name) || "custom-extension";
  const directoryPath = await createUniqueDirectory(directory, slug);
  const extensionSlug = basename(directoryPath);
  const manifest = createDraftManifest(normalized, extensionSlug);
  const manifestPath = join(directoryPath, "extension.json");
  const readmePath = join(directoryPath, "README.md");
  const createdFiles = [manifestPath, readmePath];

  await mkdir(directoryPath, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(readmePath, createReadme(manifest), "utf8");

  return {
    manifest,
    directoryPath,
    manifestPath,
    readmePath,
    createdFiles
  };
}

async function readCustomExtensionManifest(
  manifestPath: string
): Promise<ExtensionManifest | null> {
  try {
    const rawValue = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(rawValue) as Partial<ExtensionManifest>;

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.description !== "string" ||
      !Array.isArray(parsed.permissions) ||
      !Array.isArray(parsed.actions)
    ) {
      return null;
    }

    return {
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      version: typeof parsed.version === "string" ? parsed.version : "0.1.0",
      category: isExtensionCategory(parsed.category) ? parsed.category : "other",
      builtIn: false,
      auth: parsed.auth?.type === "secret" && Array.isArray(parsed.auth.fields)
        ? parsed.auth
        : { type: "secret", fields: [] },
      permissions: parsed.permissions,
      actions: parsed.actions
    };
  } catch {
    return null;
  }
}

function createDraftManifest(
  request: Required<ExtensionCreateRequest>,
  slug: string
): ExtensionManifest {
  return {
    id: `custom.${slug}`,
    name: request.name,
    description: request.description,
    version: "0.1.0",
    category: request.category,
    builtIn: false,
    auth: {
      type: "secret",
      fields: []
    },
    permissions: [
      {
        id: "external.read",
        label: "读取外部数据",
        description: "允许扩展读取外部系统中的数据摘要或详情",
        defaultMode: "ask"
      },
      {
        id: "external.write",
        label: "修改外部数据",
        description: "允许扩展创建或修改外部系统中的真实数据",
        defaultMode: "ask"
      }
    ],
    actions: [
      {
        id: "readData",
        label: "读取数据",
        description: "读取外部系统数据的示例动作",
        permission: "external.read",
        risk: "read",
        confirmation: "ask",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "查询关键词" }
          }
        },
        outputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" }
          }
        }
      },
      {
        id: "writeData",
        label: "写入数据",
        description: "创建或修改外部系统数据的示例动作",
        permission: "external.write",
        risk: "write",
        confirmation: "always",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "写入标题" },
            content: { type: "string", description: "写入内容" }
          },
          required: ["title"]
        },
        outputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            summary: { type: "string" }
          }
        }
      }
    ]
  };
}

function normalizeCreateRequest(
  request: ExtensionCreateRequest
): Required<ExtensionCreateRequest> {
  const name = trimValue(request.name || "New Extension", maxExtensionNameLength);
  const description = trimValue(
    request.description || "Local Forge extension draft created by the user.",
    maxExtensionDescriptionLength
  );

  return {
    name: name || "New Extension",
    description: description || "Local Forge extension draft created by the user.",
    category: isExtensionCategory(request.category) ? request.category : "other"
  };
}

async function createUniqueDirectory(root: string, slug: string): Promise<string> {
  await mkdir(root, { recursive: true });

  for (let index = 0; index < 200; index += 1) {
    const candidateName = index === 0 ? slug : `${slug}-${index + 1}`;
    const candidatePath = join(root, candidateName);
    const exists = await readdir(candidatePath).then(() => true, () => false);

    if (!exists) {
      return candidatePath;
    }
  }

  throw new Error(`Unable to allocate a unique extension directory for ${slug}`);
}

function createReadme(manifest: ExtensionManifest): string {
  return [
    `# ${manifest.name}`,
    "",
    manifest.description,
    "",
    "This is a local Forge extension draft. Edit `extension.json` to define permissions, credentials and action schemas.",
    "",
    "External write or send actions should keep `confirmation` set to `always` unless the user explicitly lowers the risk."
  ].join("\n");
}

function trimValue(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();

  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, maxLength - 1).trimEnd();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 64);
}

function isExtensionCategory(value: unknown): value is ExtensionManifest["category"] {
  return (
    value === "mail" ||
    value === "calendar" ||
    value === "design" ||
    value === "developer" ||
    value === "other"
  );
}
