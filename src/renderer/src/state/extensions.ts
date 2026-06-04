// 本文件说明: 管理 Extension registry 快照和前端查询辅助
import type {
  ExtensionActionDefinition,
  ExtensionManifest,
  ExtensionPermissionMode,
  ExtensionRegistrySnapshot,
  ExtensionSecretStatus,
  ExtensionSettings
} from "@shared/extensionTypes";

export function createEmptyExtensionRegistrySnapshot(): ExtensionRegistrySnapshot {
  return {
    manifests: [],
    secretStatuses: [],
    settings: []
  };
}

export function findExtensionManifest(
  snapshot: ExtensionRegistrySnapshot,
  extensionId: string
): ExtensionManifest | null {
  return snapshot.manifests.find((manifest) => manifest.id === extensionId) ?? null;
}

export function findExtensionSettings(
  snapshot: ExtensionRegistrySnapshot,
  extensionId: string
): ExtensionSettings | null {
  return snapshot.settings.find((settings) => settings.extensionId === extensionId) ?? null;
}

export function findExtensionSecretStatus(
  snapshot: ExtensionRegistrySnapshot,
  extensionId: string
): ExtensionSecretStatus | null {
  return snapshot.secretStatuses.find((status) => status.extensionId === extensionId) ?? null;
}

export function getExtensionPermissionMode(
  manifest: ExtensionManifest,
  settings: ExtensionSettings | null,
  permissionId: string
): ExtensionPermissionMode {
  return (
    settings?.permissions.find((permission) => permission.permissionId === permissionId)?.mode ??
    manifest.permissions.find((permission) => permission.id === permissionId)?.defaultMode ??
    "deny"
  );
}

export function getEnabledExtensionActions(
  snapshot: ExtensionRegistrySnapshot
): Array<{
  action: ExtensionActionDefinition;
  manifest: ExtensionManifest;
}> {
  return snapshot.manifests.flatMap((manifest) => {
    const settings = findExtensionSettings(snapshot, manifest.id);
    const secretStatus = findExtensionSecretStatus(snapshot, manifest.id);

    if (!settings?.enabled || !secretStatus?.configured) {
      return [];
    }

    return manifest.actions
      .filter(
        (action) => getExtensionPermissionMode(manifest, settings, action.permission) !== "deny"
      )
      .map((action) => ({ action, manifest }));
  });
}

export function formatExtensionActionSchemaForPrompt(
  snapshot: ExtensionRegistrySnapshot
): string {
  const actions = getEnabledExtensionActions(snapshot);

  if (actions.length === 0) {
    return "No enabled external Extensions are available.";
  }

  return actions
    .map(({ action, manifest }) =>
      [
        `- ${manifest.id}.${action.id}`,
        `  label: ${action.label}`,
        `  permission: ${action.permission}`,
        `  risk: ${action.risk}`,
        `  confirmation: ${action.confirmation}`,
        `  description: ${action.description}`,
        `  inputSchema: ${JSON.stringify(action.inputSchema)}`
      ].join("\n")
    )
    .join("\n");
}

export function formatExtensionInvocationOutputForThread(
  extensionName: string,
  actionLabel: string,
  outputSummary: string
): string {
  return `Extension ${extensionName} / ${actionLabel}: ${outputSummary}`;
}
