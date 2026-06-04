// 本文件说明: 持久化 Extension 启用状态和权限设置, 不保存任何密钥
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ExtensionManifest,
  ExtensionPermissionMode,
  ExtensionPermissionSetting,
  ExtensionSettings,
  ExtensionSettingsPatch
} from "../../shared/extensionTypes.js";

type ExtensionStoreFile = {
  settings: Record<string, ExtensionSettings>;
};

export type ExtensionStore = {
  readSettings: (manifests: ExtensionManifest[]) => Promise<ExtensionSettings[]>;
  updateSettings: (
    manifests: ExtensionManifest[],
    patch: ExtensionSettingsPatch
  ) => Promise<ExtensionSettings[]>;
};

export function createExtensionStore({
  directory,
  now = () => new Date().toISOString()
}: {
  directory: string;
  now?: () => string;
}): ExtensionStore {
  const filePath = join(directory, "forge-extensions.json");

  async function readSettings(manifests: ExtensionManifest[]): Promise<ExtensionSettings[]> {
    const file = await readStoreFile(filePath);
    return manifests.map((manifest) =>
      normalizeExtensionSettings(manifest, file.settings[manifest.id], now)
    );
  }

  async function updateSettings(
    manifests: ExtensionManifest[],
    patch: ExtensionSettingsPatch
  ): Promise<ExtensionSettings[]> {
    const manifest = manifests.find((candidate) => candidate.id === patch.extensionId);

    if (!manifest) {
      throw new Error(`Unknown extension: ${patch.extensionId}`);
    }

    const file = await readStoreFile(filePath);
    const current = normalizeExtensionSettings(manifest, file.settings[manifest.id], now);
    const next = normalizeExtensionSettings(
      manifest,
      {
        ...current,
        enabled: patch.enabled ?? current.enabled,
        permissions: patch.permissions ?? current.permissions,
        updatedAt: now()
      },
      now
    );

    file.settings[manifest.id] = next;
    await writeStoreFile(directory, filePath, file);
    return readSettings(manifests);
  }

  return {
    readSettings,
    updateSettings
  };
}

export function getExtensionPermissionMode(
  manifest: ExtensionManifest,
  settings: ExtensionSettings,
  permissionId: string
): ExtensionPermissionMode {
  const configuredMode = settings.permissions.find(
    (permission) => permission.permissionId === permissionId
  )?.mode;

  return (
    configuredMode ??
    manifest.permissions.find((permission) => permission.id === permissionId)?.defaultMode ??
    "deny"
  );
}

function normalizeExtensionSettings(
  manifest: ExtensionManifest,
  value: ExtensionSettings | undefined,
  now: () => string
): ExtensionSettings {
  const permissions = normalizePermissionSettings(manifest, value?.permissions);

  return {
    extensionId: manifest.id,
    enabled: Boolean(value?.enabled),
    permissions,
    updatedAt: value?.updatedAt ?? now()
  };
}

function normalizePermissionSettings(
  manifest: ExtensionManifest,
  permissions: ExtensionPermissionSetting[] | undefined
): ExtensionPermissionSetting[] {
  const byId = new Map(
    (permissions ?? [])
      .filter((permission) => isPermissionMode(permission.mode))
      .map((permission) => [permission.permissionId, permission.mode])
  );

  return manifest.permissions.map((permission) => ({
    permissionId: permission.id,
    mode: byId.get(permission.id) ?? permission.defaultMode
  }));
}

function isPermissionMode(value: unknown): value is ExtensionPermissionMode {
  return value === "allow" || value === "ask" || value === "deny";
}

async function readStoreFile(filePath: string): Promise<ExtensionStoreFile> {
  try {
    const rawValue = await readFile(filePath, "utf8");
    const parsed = JSON.parse(rawValue) as Partial<ExtensionStoreFile>;

    return {
      settings: isRecord(parsed.settings) ? parsed.settings as Record<string, ExtensionSettings> : {}
    };
  } catch {
    return { settings: {} };
  }
}

async function writeStoreFile(
  directory: string,
  filePath: string,
  value: ExtensionStoreFile
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
