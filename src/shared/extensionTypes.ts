// 本文件说明: 定义 Forge Extensions 的 manifest, 权限, 调用和日志类型
export type ExtensionPermissionMode = "allow" | "ask" | "deny";

export type ExtensionActionRisk = "read" | "write" | "send" | "delete";

export type ExtensionConfirmationPolicy = "never" | "ask" | "always";

export type ExtensionJsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ExtensionSecretField = {
  id: string;
  label: string;
  description: string;
  placeholder?: string;
  required?: boolean;
};

export type ExtensionOAuthRedirectMode = "loopback" | "registered-https";

export type ExtensionOAuthTokenRequestAuth = "basic" | "body" | "none";

export type ExtensionOAuthTokenRequestBody = "form" | "json";

export type ExtensionOAuthDefinition = {
  provider: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  accessTokenFieldId: string;
  refreshTokenFieldId?: string;
  clientIdFieldId: string;
  clientSecretFieldId?: string;
  docsUrl: string;
  setupUrl: string;
  redirectUriMode: ExtensionOAuthRedirectMode;
  usePkce: boolean;
  tokenRequestAuth: ExtensionOAuthTokenRequestAuth;
  tokenRequestBody?: ExtensionOAuthTokenRequestBody;
  scopeSeparator?: "space" | "comma";
  extraAuthorizeParams?: Record<string, string>;
  extraTokenParams?: Record<string, string>;
};

export type ExtensionAuthDefinition = {
  type: "secret";
  fields: ExtensionSecretField[];
  oauth?: ExtensionOAuthDefinition;
};

export type ExtensionPermissionDefinition = {
  id: string;
  label: string;
  description: string;
  defaultMode: ExtensionPermissionMode;
};

export type ExtensionActionDefinition = {
  id: string;
  label: string;
  description: string;
  permission: string;
  risk: ExtensionActionRisk;
  confirmation: ExtensionConfirmationPolicy;
  inputSchema: ExtensionJsonSchema;
  outputSchema: ExtensionJsonSchema;
};

export type ExtensionManifest = {
  id: string;
  name: string;
  description: string;
  version: string;
  category: "mail" | "calendar" | "design" | "developer" | "other";
  builtIn: boolean;
  auth: ExtensionAuthDefinition;
  permissions: ExtensionPermissionDefinition[];
  actions: ExtensionActionDefinition[];
};

export type ExtensionPermissionSetting = {
  permissionId: string;
  mode: ExtensionPermissionMode;
};

export type ExtensionSettings = {
  extensionId: string;
  enabled: boolean;
  permissions: ExtensionPermissionSetting[];
  updatedAt: string;
};

export type ExtensionSecretFieldStatus = {
  hasValue: boolean;
  last4: string | null;
};

export type ExtensionSecretStatus = {
  extensionId: string;
  configured: boolean;
  fields: Record<string, ExtensionSecretFieldStatus>;
};

export type ExtensionRegistrySnapshot = {
  manifests: ExtensionManifest[];
  settings: ExtensionSettings[];
  secretStatuses: ExtensionSecretStatus[];
};

export type ExtensionInvocationStatus =
  | "pending-confirmation"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ExtensionInvocationRequest = {
  extensionId: string;
  actionId: string;
  input: Record<string, unknown>;
  threadId?: string;
};

export type ExtensionActionConfirmation = {
  token: string;
  extensionId: string;
  actionId: string;
  actionLabel: string;
  risk: ExtensionActionRisk;
  inputSummary: string;
  createdAt: string;
  expiresAt: string;
};

export type ExtensionInvocationResult =
  | {
      ok: true;
      extensionId: string;
      actionId: string;
      logId: string;
      output: Record<string, unknown>;
      outputSummary: string;
    }
  | {
      ok: false;
      extensionId: string;
      actionId: string;
      logId?: string;
      error: string;
    }
  | {
      ok: false;
      extensionId: string;
      actionId: string;
      logId: string;
      requiresConfirmation: true;
      confirmation: ExtensionActionConfirmation;
    };

export type ExtensionInvocationLogRecord = {
  id: string;
  extensionId: string;
  extensionName: string;
  actionId: string;
  actionLabel: string;
  threadId?: string;
  status: ExtensionInvocationStatus;
  risk: ExtensionActionRisk;
  inputSummary: string;
  outputSummary?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  confirmationToken?: string;
  confirmedAt?: string;
};

export type ExtensionSecretSaveRequest = {
  extensionId: string;
  fieldId: string;
  value: string;
};

export type ExtensionOAuthStartRequest = {
  extensionId: string;
};

export type ExtensionOAuthStartResult = {
  extensionId: string;
  provider: string;
  savedFields: string[];
  expiresInSeconds?: number;
  registry: ExtensionRegistrySnapshot;
};

export type ExtensionSettingsPatch = {
  extensionId: string;
  enabled?: boolean;
  permissions?: ExtensionPermissionSetting[];
};

export type ExtensionConfirmInvocationRequest = {
  token: string;
};

export type ExtensionCreateRequest = {
  name: string;
  description?: string;
  category?: ExtensionManifest["category"];
  auth?: ExtensionAuthDefinition;
  permissions?: ExtensionPermissionDefinition[];
  actions?: ExtensionActionDefinition[];
};

export type ExtensionCreateResult = {
  manifest: ExtensionManifest;
  directoryPath: string;
  manifestPath: string;
  readmePath: string;
  createdFiles: string[];
  registry: ExtensionRegistrySnapshot;
};

export type ExtensionUpdateRequest = {
  extensionId: string;
  manifest: ExtensionManifest;
};

export type ExtensionUpdateResult = {
  manifest: ExtensionManifest;
  directoryPath: string;
  manifestPath: string;
  readmePath: string;
  updatedFiles: string[];
  registry: ExtensionRegistrySnapshot;
};

export type ExtensionDeleteResult = {
  extensionId: string;
  deletedPath: string;
  registry: ExtensionRegistrySnapshot;
};
