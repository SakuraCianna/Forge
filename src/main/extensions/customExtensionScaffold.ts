// 本文件说明: 创建和读取用户本地扩展草稿, 只处理 manifest, 不执行用户代码
import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import type {
  ExtensionActionDefinition,
  ExtensionAuthDefinition,
  ExtensionCreateRequest,
  ExtensionManifest,
  ExtensionPermissionDefinition
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

export type CustomExtensionUpdateResult = {
  manifest: ExtensionManifest;
  directoryPath: string;
  manifestPath: string;
  readmePath: string;
  updatedFiles: string[];
};

export type CustomExtensionDeleteResult = {
  deletedManifestId: string;
  deletedPath: string;
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

export async function updateCustomExtensionScaffold({
  directory,
  extensionId,
  manifest
}: {
  directory: string;
  extensionId: string;
  manifest: ExtensionManifest;
}): Promise<CustomExtensionUpdateResult> {
  const target = await findCustomExtension(directory, extensionId);
  const normalizedManifest = normalizeManifestForWrite({
    ...manifest,
    id: target.manifest.id,
    builtIn: false
  });

  if (normalizedManifest.id !== extensionId) {
    throw new Error("Custom extension id cannot be changed");
  }

  await writeFile(target.manifestPath, `${JSON.stringify(normalizedManifest, null, 2)}\n`, "utf8");
  await writeFile(target.readmePath, createReadme(normalizedManifest), "utf8");

  return {
    manifest: normalizedManifest,
    directoryPath: target.directoryPath,
    manifestPath: target.manifestPath,
    readmePath: target.readmePath,
    updatedFiles: [target.manifestPath, target.readmePath]
  };
}

export async function deleteCustomExtensionScaffold({
  directory,
  extensionId
}: {
  directory: string;
  extensionId: string;
}): Promise<CustomExtensionDeleteResult> {
  const target = await findCustomExtension(directory, extensionId);

  await rm(target.directoryPath, { recursive: true, force: true });

  return {
    deletedManifestId: extensionId,
    deletedPath: target.directoryPath
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

    return normalizeManifestForWrite({
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      version: typeof parsed.version === "string" ? parsed.version : "0.1.0",
      category: isExtensionCategory(parsed.category) ? parsed.category : "other",
      builtIn: false,
      auth:
        parsed.auth?.type === "secret" && Array.isArray(parsed.auth.fields)
          ? parsed.auth
          : { type: "secret", fields: [] },
      permissions: parsed.permissions,
      actions: parsed.actions
    });
  } catch {
    return null;
  }
}

function createDraftManifest(
  request: NormalizedExtensionCreateRequest,
  slug: string
): ExtensionManifest {
  return normalizeManifestForWrite({
    id: `custom.${slug}`,
    name: request.name,
    description: request.description,
    version: "0.1.0",
    category: request.category,
    builtIn: false,
    auth: request.auth,
    permissions: request.permissions,
    actions: request.actions
  });
}

type NormalizedExtensionCreateRequest = {
  name: string;
  description: string;
  category: ExtensionManifest["category"];
  auth: ExtensionAuthDefinition;
  permissions: ExtensionPermissionDefinition[];
  actions: ExtensionActionDefinition[];
};

function normalizeCreateRequest(request: ExtensionCreateRequest): NormalizedExtensionCreateRequest {
  const name = trimValue(request.name || "New Extension", maxExtensionNameLength);
  const description = trimValue(
    request.description || "Local Forge extension draft created by the user.",
    maxExtensionDescriptionLength
  );

  return {
    name: name || "New Extension",
    description: description || "Local Forge extension draft created by the user.",
    category: isExtensionCategory(request.category) ? request.category : "other",
    auth: sanitizeAuth(request.auth),
    permissions: sanitizePermissions(request.permissions),
    actions: sanitizeActions(request.actions, request.permissions)
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

async function findCustomExtension(
  directory: string,
  extensionId: string
): Promise<{
  directoryPath: string;
  manifest: ExtensionManifest;
  manifestPath: string;
  readmePath: string;
}> {
  const root = await realpath(directory);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryPath = join(directory, entry.name);
    const resolvedDirectoryPath = await realpath(directoryPath).catch(() => null);

    if (!resolvedDirectoryPath) {
      continue;
    }

    assertPathInsideRoot(resolvedDirectoryPath, root);

    const manifestPath = join(resolvedDirectoryPath, "extension.json");
    const manifest = await readCustomExtensionManifest(manifestPath);

    if (manifest?.id === extensionId) {
      return {
        directoryPath: resolvedDirectoryPath,
        manifest,
        manifestPath,
        readmePath: join(resolvedDirectoryPath, "README.md")
      };
    }
  }

  throw new Error(`Custom extension not found: ${extensionId}`);
}

function normalizeManifestForWrite(manifest: ExtensionManifest): ExtensionManifest {
  return {
    id: trimValue(manifest.id, 120) || "custom.extension",
    name: trimValue(manifest.name, maxExtensionNameLength) || "New Extension",
    description:
      trimValue(manifest.description, maxExtensionDescriptionLength) ||
      "Local Forge extension draft created by the user.",
    version: trimValue(manifest.version || "0.1.0", 32) || "0.1.0",
    category: isExtensionCategory(manifest.category) ? manifest.category : "other",
    builtIn: false,
    auth: sanitizeAuth(manifest.auth),
    permissions: sanitizePermissions(manifest.permissions),
    actions: sanitizeActions(manifest.actions, manifest.permissions)
  };
}

function sanitizeAuth(auth: ExtensionAuthDefinition | undefined): ExtensionAuthDefinition {
  return {
    type: "secret",
    fields:
      auth?.type === "secret" && Array.isArray(auth.fields)
        ? auth.fields
            .map((field) => ({
              id: sanitizeIdentifier(field.id || field.label),
              label: trimValue(field.label || field.id, 80),
              description: trimValue(field.description || field.label || field.id, 180),
              placeholder: field.placeholder ? trimValue(field.placeholder, 120) : undefined
            }))
            .filter((field) => field.id && field.label)
            .slice(0, 12)
        : []
  };
}

function sanitizePermissions(
  permissions: ExtensionPermissionDefinition[] | undefined
): ExtensionPermissionDefinition[] {
  const normalized =
    Array.isArray(permissions) && permissions.length > 0
      ? permissions
          .map((permission) => ({
            id: sanitizeDottedId(permission.id || permission.label),
            label: trimValue(permission.label || permission.id, 80),
            description: trimValue(permission.description || permission.label || permission.id, 220),
            defaultMode: isPermissionMode(permission.defaultMode)
              ? permission.defaultMode
              : "ask"
          }))
          .filter((permission) => permission.id && permission.label)
          .slice(0, 16)
      : createDefaultPermissions();

  return normalized.length > 0 ? normalized : createDefaultPermissions();
}

function sanitizeActions(
  actions: ExtensionActionDefinition[] | undefined,
  permissions: ExtensionPermissionDefinition[] | undefined
): ExtensionActionDefinition[] {
  const normalizedPermissions = sanitizePermissions(permissions);
  const permissionIds = new Set(normalizedPermissions.map((permission) => permission.id));
  const fallbackPermission = normalizedPermissions[0]?.id ?? "external.read";
  const normalized =
    Array.isArray(actions) && actions.length > 0
      ? actions
          .map((action) => {
            const risk = isActionRisk(action.risk) ? action.risk : "read";
            const confirmation = isHighRisk(risk)
              ? "always"
              : isConfirmationPolicy(action.confirmation)
                ? action.confirmation
                : "ask";

            return {
              id: sanitizeIdentifier(action.id || action.label),
              label: trimValue(action.label || action.id, 80),
              description: trimValue(action.description || action.label || action.id, 220),
              permission: permissionIds.has(action.permission) ? action.permission : fallbackPermission,
              risk,
              confirmation,
              inputSchema: sanitizeSchema(action.inputSchema),
              outputSchema: sanitizeSchema(action.outputSchema)
            };
          })
          .filter((action) => action.id && action.label)
          .slice(0, 24)
      : createDefaultActions();

  return normalized.length > 0 ? normalized : createDefaultActions();
}

function createDefaultPermissions(): ExtensionPermissionDefinition[] {
  return [
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
  ];
}

function createDefaultActions(): ExtensionActionDefinition[] {
  return [
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
  ];
}

function sanitizeSchema(value: unknown): ExtensionActionDefinition["inputSchema"] {
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "object" &&
    typeof (value as { properties?: unknown }).properties === "object" &&
    (value as { properties?: unknown }).properties !== null
  ) {
    return value as ExtensionActionDefinition["inputSchema"];
  }

  return {
    type: "object",
    properties: {}
  };
}

function assertPathInsideRoot(path: string, root: string): void {
  const normalizedPath = path.toLowerCase();
  const normalizedRoot = root.toLowerCase();

  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error("Custom extension path is outside the managed extension directory");
  }
}

function isHighRisk(risk: ExtensionActionDefinition["risk"]): boolean {
  return risk === "write" || risk === "send" || risk === "delete";
}

function isPermissionMode(value: unknown): value is ExtensionPermissionDefinition["defaultMode"] {
  return value === "allow" || value === "ask" || value === "deny";
}

function isConfirmationPolicy(value: unknown): value is ExtensionActionDefinition["confirmation"] {
  return value === "never" || value === "ask" || value === "always";
}

function isActionRisk(value: unknown): value is ExtensionActionDefinition["risk"] {
  return value === "read" || value === "write" || value === "send" || value === "delete";
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

function sanitizeDottedId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/gu, ".")
    .replace(/^\.+|\.+$/gu, "")
    .slice(0, 80);
}

function sanitizeIdentifier(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 80);
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
