// 本文件说明: 构造内置服务 Extension 共用的 OAuth 配置和密钥字段定义
import type {
  ExtensionAuthDefinition,
  ExtensionOAuthDefinition
} from "../../shared/extensionTypes.js";

type OAuthTokenAuthOptions = {
  accessTokenDescription: string;
  accessTokenFieldId?: string;
  accessTokenLabel?: string;
  accessTokenPlaceholder?: string;
  browserOAuthEnabled?: boolean;
  clientSecret?: boolean;
  oauth?: ExtensionOAuthDefinition;
  refreshTokenFieldId?: string;
};

const googleOAuthAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleOAuthTokenUrl = "https://oauth2.googleapis.com/token";
const googleOAuthDocsUrl = "https://developers.google.com/identity/protocols/oauth2/native-app";
const forgeGoogleOAuthClientId =
  process.env.FORGE_GOOGLE_OAUTH_CLIENT_ID?.trim() ||
  "294153456393-3ce5vjc1bfu67kcblgte15be2qipts3q.apps.googleusercontent.com";
const forgeOAuthBrokerBaseUrl = trimTrailingSlash(process.env.FORGE_OAUTH_BROKER_BASE_URL?.trim());
export const browserOAuthEnabled = isTruthyEnvironmentValue(process.env.FORGE_ENABLE_BROWSER_OAUTH);

export function readProductClientId(envVar: string): string | undefined {
  return process.env[envVar]?.trim() || undefined;
}

export function createBrokerUrl(
  extensionId: string,
  action: "authorize" | "token"
): string | undefined {
  return forgeOAuthBrokerBaseUrl
    ? `${forgeOAuthBrokerBaseUrl}/oauth/${extensionId}/${action}`
    : undefined;
}

export function trimTrailingSlash(value: string | undefined): string | undefined {
  return value ? value.replace(/\/+$/u, "") : undefined;
}

export function createGoogleOAuth(scopes: string[], setupUrl: string): ExtensionOAuthDefinition {
  return {
    provider: "Google",
    authorizationUrl: googleOAuthAuthorizeUrl,
    tokenUrl: googleOAuthTokenUrl,
    scopes,
    accessTokenFieldId: "accessToken",
    refreshTokenFieldId: "refreshToken",
    productClientId: forgeGoogleOAuthClientId,
    productClientIdEnvVar: "FORGE_GOOGLE_OAUTH_CLIENT_ID",
    docsUrl: googleOAuthDocsUrl,
    setupUrl,
    redirectUriMode: "loopback",
    usePkce: true,
    tokenRequestAuth: "none",
    extraAuthorizeParams: {
      access_type: "offline",
      prompt: "consent"
    }
  };
}

export function createOAuthTokenAuth({
  accessTokenDescription,
  accessTokenFieldId = "accessToken",
  accessTokenLabel = "OAuth access token",
  accessTokenPlaceholder = "Bearer access token",
  browserOAuthEnabled: oauthEnabled = browserOAuthEnabled,
  clientSecret = false,
  oauth,
  refreshTokenFieldId = "refreshToken"
}: OAuthTokenAuthOptions): ExtensionAuthDefinition {
  const exposedOAuth = oauthEnabled ? oauth : undefined;
  const exposeOAuthClientIdField = Boolean(
    exposedOAuth?.clientIdFieldId && !exposedOAuth.productClientId
  );
  const exposeOAuthClientSecretField = Boolean(
    clientSecret &&
      exposedOAuth?.clientSecretFieldId &&
      exposedOAuth.tokenRequestAuth !== "none" &&
      !exposedOAuth.productClientSecretEnvVar
  );
  const connectorManagedToken = Boolean(exposedOAuth);

  return {
    type: "secret",
    fields: [
      {
        id: accessTokenFieldId,
        label: createCredentialFieldLabel(accessTokenLabel, connectorManagedToken),
        description: createCredentialFieldDescription(accessTokenDescription, connectorManagedToken),
        placeholder: accessTokenPlaceholder,
        ...(connectorManagedToken ? { manualInput: false } : {})
      },
      {
        id: refreshTokenFieldId,
        label: "OAuth refresh token",
        description: connectorManagedToken
          ? "OAuth 刷新令牌, 由网页登录授权自动保存, 手动 token 可留空"
          : "OAuth 刷新令牌, 手动凭据模式通常可留空",
        placeholder: "refresh_token",
        ...(connectorManagedToken ? { manualInput: false } : {}),
        required: false
      },
      ...(exposeOAuthClientIdField
        ? [
            {
              id: "oauthClientId",
              label: "OAuth client ID",
              description: "开发者 OAuth app client ID, 仅自定义授权配置需要填写",
              placeholder: "client_id",
              required: false
            }
          ]
        : []),
      ...(exposeOAuthClientSecretField
        ? [
            {
              id: "oauthClientSecret",
              label: "OAuth client secret",
              description: "开发者 OAuth app client secret, 仅自定义授权配置需要填写",
              placeholder: "client_secret",
              required: false
            }
          ]
        : [])
    ],
    ...(exposedOAuth ? { oauth: exposedOAuth } : {})
  };
}

function isTruthyEnvironmentValue(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function createCredentialFieldLabel(label: string, connectorManagedToken: boolean): string {
  if (connectorManagedToken || !/^OAuth access token$/iu.test(label)) {
    return label;
  }

  return "Access token / API key";
}

function createCredentialFieldDescription(
  description: string,
  connectorManagedToken: boolean
): string {
  if (connectorManagedToken) {
    return description;
  }

  return description
    .replace(/,?\s*通过 Forge OAuth broker 自动保存/gu, "")
    .replace(/,?\s*由网页登录授权自动保存/gu, "")
    .trim();
}
