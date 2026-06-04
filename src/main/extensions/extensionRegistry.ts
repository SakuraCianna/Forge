// 本文件说明: Extension Registry 统一处理 manifest, 权限, 确认和动作调用
import { randomUUID } from "node:crypto";
import type {
  ExtensionActionConfirmation,
  ExtensionActionDefinition,
  ExtensionConfirmInvocationRequest,
  ExtensionDeleteResult,
  ExtensionCreateRequest,
  ExtensionCreateResult,
  ExtensionInvocationLogRecord,
  ExtensionInvocationRequest,
  ExtensionInvocationResult,
  ExtensionManifest,
  ExtensionRegistrySnapshot,
  ExtensionSecretSaveRequest,
  ExtensionSecretStatus,
  ExtensionSettings,
  ExtensionSettingsPatch,
  ExtensionUpdateRequest,
  ExtensionUpdateResult
} from "../../shared/extensionTypes.js";
import {
  createExtensionLogRecordInput,
  type ExtensionInvocationLogStore
} from "./extensionInvocationLog.js";
import { getExtensionPermissionMode, type ExtensionStore } from "./extensionStore.js";
import {
  createQQMailInputSummary,
  qqMailHandlers,
  qqMailManifest,
  type ExtensionActionHandler
} from "./qqMailExtension.js";
import {
  createCustomExtensionScaffold,
  deleteCustomExtensionScaffold,
  updateCustomExtensionScaffold,
  readCustomExtensionManifests
} from "./customExtensionScaffold.js";

type ExtensionSecretVault = {
  saveExtensionSecret: (extensionId: string, fieldId: string, value: string) => Promise<void>;
  readExtensionSecret: (extensionId: string, fieldId: string) => Promise<string | null>;
  getExtensionSecretStatus: (
    extensionId: string,
    fieldIds: string[]
  ) => Promise<Record<string, { hasKey: boolean; last4: string | null }>>;
  deleteExtensionSecret: (extensionId: string, fieldId: string) => Promise<void>;
};

type PendingInvocation = {
  confirmation: ExtensionActionConfirmation;
  input: Record<string, unknown>;
  logId: string;
  threadId?: string;
};

export type ExtensionRegistry = {
  getSnapshot: () => Promise<ExtensionRegistrySnapshot>;
  createCustomExtension: (request: ExtensionCreateRequest) => Promise<ExtensionCreateResult>;
  updateCustomExtension: (request: ExtensionUpdateRequest) => Promise<ExtensionUpdateResult>;
  deleteCustomExtension: (extensionId: string) => Promise<ExtensionDeleteResult>;
  updateSettings: (patch: ExtensionSettingsPatch) => Promise<ExtensionRegistrySnapshot>;
  saveSecret: (request: ExtensionSecretSaveRequest) => Promise<ExtensionRegistrySnapshot>;
  deleteSecret: (extensionId: string, fieldId: string) => Promise<ExtensionRegistrySnapshot>;
  invoke: (request: ExtensionInvocationRequest) => Promise<ExtensionInvocationResult>;
  confirmInvocation: (
    request: ExtensionConfirmInvocationRequest
  ) => Promise<ExtensionInvocationResult>;
  listLogs: (limit?: number) => Promise<ExtensionInvocationLogRecord[]>;
};

const confirmationTtlMs = 10 * 60 * 1000;

export function createExtensionRegistry({
  logStore,
  customExtensionDirectory,
  now = () => new Date().toISOString(),
  store,
  vault
}: {
  customExtensionDirectory: string;
  logStore: ExtensionInvocationLogStore;
  now?: () => string;
  store: ExtensionStore;
  vault: ExtensionSecretVault;
}): ExtensionRegistry {
  const builtInManifests = [qqMailManifest];
  const handlers = new Map<string, Record<string, ExtensionActionHandler>>([
    [qqMailManifest.id, qqMailHandlers]
  ]);
  const pendingInvocations = new Map<string, PendingInvocation>();

  async function readManifests(): Promise<ExtensionManifest[]> {
    const customManifests = await readCustomExtensionManifests(customExtensionDirectory);

    return [...builtInManifests, ...customManifests];
  }

  async function getSnapshot(): Promise<ExtensionRegistrySnapshot> {
    const manifests = await readManifests();
    const settings = await store.readSettings(manifests);
    const secretStatuses = await Promise.all(
      manifests.map((manifest) => getSecretStatus(manifest))
    );

    return {
      manifests,
      settings,
      secretStatuses
    };
  }

  async function createCustomExtension(
    request: ExtensionCreateRequest
  ): Promise<ExtensionCreateResult> {
    const scaffold = await createCustomExtensionScaffold({
      directory: customExtensionDirectory,
      request
    });

    return {
      ...scaffold,
      registry: await getSnapshot()
    };
  }

  async function updateCustomExtension(
    request: ExtensionUpdateRequest
  ): Promise<ExtensionUpdateResult> {
    const existing = await getManifest(request.extensionId);

    if (existing.builtIn) {
      throw new Error("Built-in extensions cannot be edited");
    }

    const updated = await updateCustomExtensionScaffold({
      directory: customExtensionDirectory,
      extensionId: request.extensionId,
      manifest: request.manifest
    });

    return {
      ...updated,
      registry: await getSnapshot()
    };
  }

  async function deleteCustomExtension(extensionId: string): Promise<ExtensionDeleteResult> {
    const existing = await getManifest(extensionId);

    if (existing.builtIn) {
      throw new Error("Built-in extensions cannot be deleted");
    }

    const deleted = await deleteCustomExtensionScaffold({
      directory: customExtensionDirectory,
      extensionId
    });

    return {
      extensionId: deleted.deletedManifestId,
      deletedPath: deleted.deletedPath,
      registry: await getSnapshot()
    };
  }

  async function updateSettings(
    patch: ExtensionSettingsPatch
  ): Promise<ExtensionRegistrySnapshot> {
    const manifests = await readManifests();
    await store.updateSettings(manifests, patch);
    return getSnapshot();
  }

  async function saveSecret(request: ExtensionSecretSaveRequest): Promise<ExtensionRegistrySnapshot> {
    const manifest = await getManifest(request.extensionId);

    if (!manifest.auth.fields.some((field) => field.id === request.fieldId)) {
      throw new Error(`Unknown extension secret field: ${request.fieldId}`);
    }

    const value = request.value.trim();

    if (!value) {
      throw new Error("Extension secret value is required");
    }

    await vault.saveExtensionSecret(request.extensionId, request.fieldId, value);
    return getSnapshot();
  }

  async function deleteSecret(
    extensionId: string,
    fieldId: string
  ): Promise<ExtensionRegistrySnapshot> {
    await getManifest(extensionId);
    await vault.deleteExtensionSecret(extensionId, fieldId);
    return getSnapshot();
  }

  async function invoke(request: ExtensionInvocationRequest): Promise<ExtensionInvocationResult> {
    const context = await resolveInvocationContext(request);
    const inputSummary = createInputSummary(context.action, request.input);
    const confirmation = shouldRequireConfirmation(context)
      ? createConfirmation(context.action, context.manifest, inputSummary)
      : null;

    if (confirmation) {
      const pendingLog = await logStore.append(
        createExtensionLogRecordInput({
          action: context.action,
          confirmationToken: confirmation.token,
          inputSummary,
          manifest: context.manifest,
          now: now(),
          risk: context.action.risk,
          status: "pending-confirmation",
          threadId: request.threadId
        })
      );

      pendingInvocations.set(confirmation.token, {
        confirmation,
        input: request.input,
        logId: pendingLog.id,
        threadId: request.threadId
      });

      return {
        ok: false,
        extensionId: request.extensionId,
        actionId: request.actionId,
        logId: pendingLog.id,
        requiresConfirmation: true,
        confirmation
      };
    }

    const runningLog = await logStore.append(
      createExtensionLogRecordInput({
        action: context.action,
        inputSummary,
        manifest: context.manifest,
        now: now(),
        risk: context.action.risk,
        status: "running",
        threadId: request.threadId
      })
    );

    return runInvocation({
      action: context.action,
      handler: context.handler,
      input: request.input,
      logId: runningLog.id,
      manifest: context.manifest
    });
  }

  async function confirmInvocation({
    token
  }: ExtensionConfirmInvocationRequest): Promise<ExtensionInvocationResult> {
    const pending = pendingInvocations.get(token);

    if (!pending) {
      throw new Error("Extension confirmation is expired or missing");
    }

    if (new Date(pending.confirmation.expiresAt).getTime() < Date.now()) {
      pendingInvocations.delete(token);
      await logStore.update(pending.logId, {
        completedAt: now(),
        errorMessage: "Confirmation expired",
        status: "cancelled"
      });
      throw new Error("Extension confirmation expired");
    }

    pendingInvocations.delete(token);
    const context = await resolveInvocationContext({
      actionId: pending.confirmation.actionId,
      extensionId: pending.confirmation.extensionId,
      input: pending.input,
      threadId: pending.threadId
    });

    await logStore.update(pending.logId, {
      confirmedAt: now(),
      status: "running"
    });

    return runInvocation({
      action: context.action,
      handler: context.handler,
      input: pending.input,
      logId: pending.logId,
      manifest: context.manifest
    });
  }

  async function listLogs(limit?: number): Promise<ExtensionInvocationLogRecord[]> {
    return logStore.list(limit);
  }

  async function resolveInvocationContext(request: ExtensionInvocationRequest): Promise<{
    action: ExtensionActionDefinition;
    handler: ExtensionActionHandler;
    manifest: ExtensionManifest;
    settings: ExtensionSettings;
  }> {
    const manifests = await readManifests();
    const manifest = getManifestFromList(manifests, request.extensionId);
    const action = getAction(manifest, request.actionId);
    const allSettings = await store.readSettings(manifests);
    const settings = allSettings.find((item) => item.extensionId === manifest.id);

    if (!settings?.enabled) {
      throw new Error(`Extension is disabled: ${manifest.name}`);
    }

    const permissionMode = getExtensionPermissionMode(manifest, settings, action.permission);

    if (permissionMode === "deny") {
      throw new Error(`Extension permission is denied: ${action.permission}`);
    }

    const secretStatus = await getSecretStatus(manifest);

    if (!secretStatus.configured) {
      throw new Error(`Extension credentials are not configured: ${manifest.name}`);
    }

    const handler = handlers.get(manifest.id)?.[action.id];

    if (!handler) {
      throw new Error(`Extension action is not implemented: ${manifest.id}.${action.id}`);
    }

    return { action, handler, manifest, settings };
  }

  async function runInvocation({
    action,
    handler,
    input,
    logId,
    manifest
  }: {
    action: ExtensionActionDefinition;
    handler: ExtensionActionHandler;
    input: Record<string, unknown>;
    logId: string;
    manifest: ExtensionManifest;
  }): Promise<ExtensionInvocationResult> {
    try {
      const result = await handler(input, {
        readSecret: (fieldId) => vault.readExtensionSecret(manifest.id, fieldId)
      });

      await logStore.update(logId, {
        completedAt: now(),
        outputSummary: result.outputSummary,
        status: "succeeded"
      });

      return {
        ok: true,
        extensionId: manifest.id,
        actionId: action.id,
        logId,
        output: result.output,
        outputSummary: result.outputSummary
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await logStore.update(logId, {
        completedAt: now(),
        errorMessage: message,
        status: "failed"
      });

      return {
        ok: false,
        extensionId: manifest.id,
        actionId: action.id,
        logId,
        error: message
      };
    }
  }

  async function getSecretStatus(manifest: ExtensionManifest): Promise<ExtensionSecretStatus> {
    const fieldIds = manifest.auth.fields.map((field) => field.id);
    const fieldStatuses = await vault.getExtensionSecretStatus(manifest.id, fieldIds);
    const fields = Object.fromEntries(
      Object.entries(fieldStatuses).map(([fieldId, status]) => [
        fieldId,
        {
          hasValue: status.hasKey,
          last4: status.last4
        }
      ])
    );

    return {
      extensionId: manifest.id,
      configured: fieldIds.every((fieldId) => fields[fieldId]?.hasValue),
      fields
    };
  }

  function shouldRequireConfirmation({
    action,
    manifest,
    settings
  }: {
    action: ExtensionActionDefinition;
    manifest: ExtensionManifest;
    settings: ExtensionSettings;
  }): boolean {
    if (action.confirmation === "always") {
      return true;
    }

    if (action.confirmation === "never") {
      return false;
    }

    return getExtensionPermissionMode(manifest, settings, action.permission) === "ask";
  }

  function createConfirmation(
    action: ExtensionActionDefinition,
    manifest: ExtensionManifest,
    inputSummary: string
  ): ExtensionActionConfirmation {
    const createdAt = now();
    const expiresAt = new Date(new Date(createdAt).getTime() + confirmationTtlMs).toISOString();
    const token = `${manifest.id}:${action.id}:${randomUUID()}`;

    return {
      token,
      extensionId: manifest.id,
      actionId: action.id,
      actionLabel: action.label,
      risk: action.risk,
      inputSummary,
      createdAt,
      expiresAt
    };
  }

  async function getManifest(extensionId: string): Promise<ExtensionManifest> {
    return getManifestFromList(await readManifests(), extensionId);
  }

  return {
    createCustomExtension,
    updateCustomExtension,
    deleteCustomExtension,
    getSnapshot,
    updateSettings,
    saveSecret,
    deleteSecret,
    invoke,
    confirmInvocation,
    listLogs
  };
}

function getManifestFromList(
  manifests: ExtensionManifest[],
  extensionId: string
): ExtensionManifest {
  const manifest = manifests.find((candidate) => candidate.id === extensionId);

  if (!manifest) {
    throw new Error(`Unknown extension: ${extensionId}`);
  }

  return manifest;
}

function getAction(
  manifest: ExtensionManifest,
  actionId: string
): ExtensionActionDefinition {
  const action = manifest.actions.find((candidate) => candidate.id === actionId);

  if (!action) {
    throw new Error(`Unknown extension action: ${manifest.id}.${actionId}`);
  }

  return action;
}

function createInputSummary(
  action: ExtensionActionDefinition,
  input: Record<string, unknown>
): string {
  if (qqMailManifest.actions.some((candidate) => candidate.id === action.id)) {
    return createQQMailInputSummary(action.id, input);
  }

  return `${action.id}: ${Object.keys(input).join(", ")}`;
}
