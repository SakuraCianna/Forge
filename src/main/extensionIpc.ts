// 本文件说明: 注册 Extensions IPC, 渲染层只能通过受控入口调用外部服务
import type {
  ExtensionConfirmInvocationRequest,
  ExtensionCreateRequest,
  ExtensionManifest,
  ExtensionInvocationRequest,
  ExtensionSecretSaveRequest,
  ExtensionSettingsPatch,
  ExtensionUpdateRequest
} from "../shared/extensionTypes.js";
import { extensionChannels } from "../shared/ipcChannels.js";
import type { ExtensionRegistry } from "./extensions/extensionRegistry.js";

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export function registerExtensionHandlers(
  registry: ExtensionRegistry,
  registerHandler: RegisterHandler
): void {
  registerHandler(extensionChannels.registry, async () => registry.getSnapshot());
  registerHandler(extensionChannels.create, async (_event, request) =>
    registry.createCustomExtension(assertCreateRequest(request))
  );
  registerHandler(extensionChannels.update, async (_event, request) =>
    registry.updateCustomExtension(assertUpdateRequest(request))
  );
  registerHandler(extensionChannels.delete, async (_event, extensionId) =>
    registry.deleteCustomExtension(assertString(extensionId))
  );
  registerHandler(extensionChannels.updateSettings, async (_event, patch) =>
    registry.updateSettings(assertSettingsPatch(patch))
  );
  registerHandler(extensionChannels.saveSecret, async (_event, request) =>
    registry.saveSecret(assertSecretSaveRequest(request))
  );
  registerHandler(extensionChannels.deleteSecret, async (_event, extensionId, fieldId) =>
    registry.deleteSecret(assertString(extensionId), assertString(fieldId))
  );
  registerHandler(extensionChannels.invoke, async (_event, request) =>
    registry.invoke(assertInvocationRequest(request))
  );
  registerHandler(extensionChannels.confirmInvocation, async (_event, request) =>
    registry.confirmInvocation(assertConfirmInvocationRequest(request))
  );
  registerHandler(extensionChannels.logs, async (_event, limit) =>
    registry.listLogs(readOptionalNumber(limit))
  );
}

function assertCreateRequest(value: unknown): ExtensionCreateRequest {
  if (!isRecord(value) || typeof value.name !== "string") {
    throw new Error("Invalid extension create request");
  }

  return {
    name: value.name,
    description: readOptionalString(value.description),
    category: isExtensionCategory(value.category) ? value.category : undefined,
    auth: isRecord(value.auth) ? (value.auth as ExtensionCreateRequest["auth"]) : undefined,
    permissions: Array.isArray(value.permissions)
      ? (value.permissions as ExtensionCreateRequest["permissions"])
      : undefined,
    actions: Array.isArray(value.actions)
      ? (value.actions as ExtensionCreateRequest["actions"])
      : undefined
  };
}

function assertUpdateRequest(value: unknown): ExtensionUpdateRequest {
  if (!isRecord(value) || typeof value.extensionId !== "string" || !isRecord(value.manifest)) {
    throw new Error("Invalid extension update request");
  }

  return {
    extensionId: value.extensionId,
    manifest: assertManifest(value.manifest)
  };
}

function assertManifest(value: Record<string, unknown>): ExtensionManifest {
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    typeof value.version !== "string" ||
    !Array.isArray(value.permissions) ||
    !Array.isArray(value.actions)
  ) {
    throw new Error("Invalid extension manifest");
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    version: value.version,
    category: isExtensionCategory(value.category) ? value.category : "other",
    builtIn: false,
    auth:
      isRecord(value.auth) && value.auth.type === "secret" && Array.isArray(value.auth.fields)
        ? (value.auth as ExtensionManifest["auth"])
        : { type: "secret", fields: [] },
    permissions: value.permissions as ExtensionManifest["permissions"],
    actions: value.actions as ExtensionManifest["actions"]
  };
}

function assertSettingsPatch(value: unknown): ExtensionSettingsPatch {
  if (!isRecord(value) || typeof value.extensionId !== "string") {
    throw new Error("Invalid extension settings patch");
  }

  return {
    extensionId: value.extensionId,
    enabled: readOptionalBoolean(value.enabled),
    permissions: Array.isArray(value.permissions)
      ? value.permissions
          .filter(isPermissionSetting)
          .map((permission) => ({
            permissionId: permission.permissionId,
            mode: permission.mode
          }))
      : undefined
  };
}

function assertSecretSaveRequest(value: unknown): ExtensionSecretSaveRequest {
  if (
    !isRecord(value) ||
    typeof value.extensionId !== "string" ||
    typeof value.fieldId !== "string" ||
    typeof value.value !== "string"
  ) {
    throw new Error("Invalid extension secret request");
  }

  return {
    extensionId: value.extensionId,
    fieldId: value.fieldId,
    value: value.value
  };
}

function assertInvocationRequest(value: unknown): ExtensionInvocationRequest {
  if (
    !isRecord(value) ||
    typeof value.extensionId !== "string" ||
    typeof value.actionId !== "string" ||
    !isRecord(value.input)
  ) {
    throw new Error("Invalid extension invocation request");
  }

  return {
    extensionId: value.extensionId,
    actionId: value.actionId,
    input: value.input,
    threadId: readOptionalString(value.threadId)
  };
}

function assertConfirmInvocationRequest(value: unknown): ExtensionConfirmInvocationRequest {
  if (!isRecord(value) || typeof value.token !== "string") {
    throw new Error("Invalid extension confirmation request");
  }

  return { token: value.token };
}

function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid string argument");
  }

  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isPermissionSetting(value: unknown): value is {
  mode: "allow" | "ask" | "deny";
  permissionId: string;
} {
  return (
    isRecord(value) &&
    typeof value.permissionId === "string" &&
    (value.mode === "allow" || value.mode === "ask" || value.mode === "deny")
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
