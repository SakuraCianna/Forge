// 本文件说明: 为内置扩展提供桌面端 OAuth 授权码流程, token 仍只写入主进程密钥库
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  ExtensionManifest,
  ExtensionOAuthDefinition
} from "../../shared/extensionTypes.js";

type StartExtensionOAuthOptions = {
  manifest: ExtensionManifest;
  now?: () => number;
  oauth: ExtensionOAuthDefinition;
  openExternal: (url: string) => Promise<unknown> | unknown;
  readSecret: (fieldId: string) => Promise<string | null>;
  saveSecret: (fieldId: string, value: string) => Promise<void>;
  timeoutMs?: number;
};

type OAuthCallbackResult = {
  code: string;
  state: string;
};

export type ExtensionOAuthTokenResult = {
  expiresInSeconds?: number;
  provider: string;
  savedFields: string[];
};

const callbackPath = "/oauth/callback";
const defaultTimeoutMs = 3 * 60 * 1000;

export async function startExtensionOAuthAuthorization({
  manifest,
  now = Date.now,
  oauth,
  openExternal,
  readSecret,
  saveSecret,
  timeoutMs = defaultTimeoutMs
}: StartExtensionOAuthOptions): Promise<ExtensionOAuthTokenResult> {
  if (oauth.redirectUriMode !== "loopback") {
    throw new Error(`${oauth.provider} OAuth requires a pre-registered HTTPS callback`);
  }

  assertHttpsUrl(oauth.authorizationUrl, `${oauth.provider} authorization URL`);
  assertHttpsUrl(oauth.tokenUrl, `${oauth.provider} token URL`);

  const clientId = await resolveOAuthClientId(oauth, readSecret);
  const clientSecret = await resolveOAuthClientSecret(oauth, readSecret);

  if (requiresClientSecret(oauth) && !clientSecret) {
    throw new Error(`${oauth.provider} OAuth client secret is not configured for this Forge build`);
  }

  const receiver = await createLoopbackReceiver(timeoutMs);
  const state = createRandomToken();
  const codeVerifier = oauth.usePkce ? createCodeVerifier() : null;

  try {
    const authorizationUrl = createAuthorizationUrl({
      clientId,
      codeVerifier,
      oauth,
      redirectUri: receiver.redirectUri,
      state
    });

    const openResult = await openExternal(authorizationUrl.toString());

    if (openResult === false) {
      throw new Error(`${oauth.provider} OAuth authorization URL was blocked`);
    }

    const callback = await receiver.waitForCallback;

    if (callback.state !== state) {
      throw new Error("OAuth state mismatch");
    }

    const tokenPayload = await exchangeAuthorizationCode({
      clientId,
      clientSecret,
      code: callback.code,
      codeVerifier,
      oauth,
      redirectUri: receiver.redirectUri
    });
    const accessToken = readTokenField(tokenPayload, "access_token");
    const savedFields: string[] = [];

    await saveSecret(oauth.accessTokenFieldId, accessToken);
    savedFields.push(oauth.accessTokenFieldId);

    if (oauth.refreshTokenFieldId) {
      const refreshToken = readOptionalTokenField(tokenPayload, "refresh_token");

      if (refreshToken) {
        await saveSecret(oauth.refreshTokenFieldId, refreshToken);
        savedFields.push(oauth.refreshTokenFieldId);
      }
    }

    return {
      expiresInSeconds: readOptionalNumber(tokenPayload.expires_in),
      provider: oauth.provider,
      savedFields
    };
  } finally {
    await receiver.close();
    void now;
    void manifest;
  }
}

async function createLoopbackReceiver(timeoutMs: number): Promise<{
  close: () => Promise<void>;
  redirectUri: string;
  waitForCallback: Promise<OAuthCallbackResult>;
}> {
  let resolved = false;
  let timeout: NodeJS.Timeout | null = null;
  let resolveCallback: (value: OAuthCallbackResult) => void;
  let rejectCallback: (error: Error) => void;
  const waitForCallback = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer((request, response) => {
    try {
      const result = readCallbackRequest(request);

      if (!result) {
        writeHtmlResponse(response, 404, "Forge OAuth callback not found");
        return;
      }

      if ("error" in result) {
        writeHtmlResponse(response, 400, "Forge OAuth authorization failed. You can close this tab.");
        rejectOnce(new Error(result.error));
        return;
      }

      writeHtmlResponse(response, 200, "Forge OAuth authorization succeeded. You can close this tab.");
      resolveOnce(result);
    } catch (error) {
      writeHtmlResponse(response, 500, "Forge OAuth callback failed. You can close this tab.");
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${address.port}${callbackPath}`;

  timeout = setTimeout(() => {
    rejectOnce(new Error("OAuth authorization timed out"));
  }, timeoutMs);

  return {
    redirectUri,
    waitForCallback,
    close: () => closeServer(server, timeout)
  };

  function resolveOnce(value: OAuthCallbackResult): void {
    if (resolved) {
      return;
    }

    resolved = true;
    resolveCallback(value);
  }

  function rejectOnce(error: Error): void {
    if (resolved) {
      return;
    }

    resolved = true;
    rejectCallback(error);
  }
}

function readCallbackRequest(
  request: IncomingMessage
): OAuthCallbackResult | { error: string } | null {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

  if (requestUrl.pathname !== callbackPath) {
    return null;
  }

  const error = requestUrl.searchParams.get("error");

  if (error) {
    const description = requestUrl.searchParams.get("error_description");
    return { error: description ? `${error}: ${description}` : error };
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");

  if (!code || !state) {
    return { error: "OAuth callback is missing code or state" };
  }

  return { code, state };
}

function writeHtmlResponse(response: ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>Forge OAuth</title></head><body><p>${escapeHtml(message)}</p></body></html>`
  );
}

async function closeServer(server: Server, timeout: NodeJS.Timeout | null): Promise<void> {
  if (timeout) {
    clearTimeout(timeout);
  }

  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createAuthorizationUrl({
  clientId,
  codeVerifier,
  oauth,
  redirectUri,
  state
}: {
  clientId: string;
  codeVerifier: string | null;
  oauth: ExtensionOAuthDefinition;
  redirectUri: string;
  state: string;
}): URL {
  const authorizationUrl = new URL(oauth.authorizationUrl);

  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", joinScopes(oauth));
  authorizationUrl.searchParams.set("state", state);

  if (codeVerifier) {
    authorizationUrl.searchParams.set("code_challenge", createCodeChallenge(codeVerifier));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
  }

  for (const [key, value] of Object.entries(oauth.extraAuthorizeParams ?? {})) {
    authorizationUrl.searchParams.set(key, value);
  }

  return authorizationUrl;
}

async function exchangeAuthorizationCode({
  clientId,
  clientSecret,
  code,
  codeVerifier,
  oauth,
  redirectUri
}: {
  clientId: string;
  clientSecret: string | null;
  code: string;
  codeVerifier: string | null;
  oauth: ExtensionOAuthDefinition;
  redirectUri: string;
}): Promise<Record<string, unknown>> {
  const body = createTokenRequestBody({
    clientId,
    clientSecret,
    code,
    codeVerifier,
    oauth,
    redirectUri
  });
  const bodyFormat = oauth.tokenRequestBody ?? "form";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": bodyFormat === "json" ? "application/json" : "application/x-www-form-urlencoded"
  };

  if (oauth.tokenRequestAuth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret ?? ""}`).toString("base64")}`;
  }

  const response = await fetch(oauth.tokenUrl, {
    body: bodyFormat === "json" ? JSON.stringify(body) : new URLSearchParams(toStringRecord(body)),
    headers,
    method: "POST"
  });
  const rawText = await response.text();
  const payload = parseTokenResponse(rawText);

  if (!response.ok) {
    throw new Error(
      `${oauth.provider} OAuth token request failed (${response.status}): ${formatOAuthError(payload)}`
    );
  }

  if (isRecord(payload) && payload.ok === false) {
    throw new Error(`${oauth.provider} OAuth token request failed: ${formatOAuthError(payload)}`);
  }

  if (!isRecord(payload)) {
    throw new Error(`${oauth.provider} OAuth token response is invalid`);
  }

  return payload;
}

function createTokenRequestBody({
  clientId,
  clientSecret,
  code,
  codeVerifier,
  oauth,
  redirectUri
}: {
  clientId: string;
  clientSecret: string | null;
  code: string;
  codeVerifier: string | null;
  oauth: ExtensionOAuthDefinition;
  redirectUri: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  };

  if (oauth.tokenRequestAuth !== "basic") {
    body.client_id = clientId;
  }

  if (oauth.tokenRequestAuth === "body" && clientSecret) {
    body.client_secret = clientSecret;
  }

  if (codeVerifier) {
    body.code_verifier = codeVerifier;
  }

  return {
    ...body,
    ...(oauth.extraTokenParams ?? {})
  };
}

function parseTokenResponse(rawText: string): unknown {
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return Object.fromEntries(new URLSearchParams(rawText).entries());
  }
}

function joinScopes(oauth: ExtensionOAuthDefinition): string {
  return oauth.scopes.join(oauth.scopeSeparator === "comma" ? "," : " ");
}

function createCodeVerifier(): string {
  return base64Url(randomBytes(64));
}

function createCodeChallenge(codeVerifier: string): string {
  return base64Url(createHash("sha256").update(codeVerifier).digest());
}

function createRandomToken(): string {
  return base64Url(randomBytes(32));
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

async function resolveOAuthClientId(
  oauth: ExtensionOAuthDefinition,
  readSecret: (fieldId: string) => Promise<string | null>,
): Promise<string> {
  const productClientId = normalizeSecretValue(oauth.productClientId);

  if (productClientId) {
    return productClientId;
  }

  const userClientId = oauth.clientIdFieldId
    ? normalizeSecretValue(await readSecret(oauth.clientIdFieldId))
    : null;

  if (userClientId) {
    return userClientId;
  }

  throw new Error(
    `${oauth.provider} OAuth client is not configured for this Forge build. End users should not create OAuth apps; configure the product OAuth client before packaging.`
  );
}

async function resolveOAuthClientSecret(
  oauth: ExtensionOAuthDefinition,
  readSecret: (fieldId: string) => Promise<string | null>
): Promise<string | null> {
  if (oauth.productClientSecretEnvVar) {
    const productClientSecret = normalizeSecretValue(process.env[oauth.productClientSecretEnvVar]);

    if (productClientSecret) {
      return productClientSecret;
    }
  }

  return oauth.clientSecretFieldId
    ? normalizeSecretValue(await readSecret(oauth.clientSecretFieldId))
    : null;
}

function normalizeSecretValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function requiresClientSecret(oauth: ExtensionOAuthDefinition): boolean {
  return Boolean(
    oauth.tokenRequestAuth !== "none" &&
      (oauth.clientSecretFieldId || oauth.productClientSecretEnvVar)
  );
}

function readTokenField(payload: Record<string, unknown>, fieldName: string): string {
  const value = payload[fieldName];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`OAuth token response is missing ${fieldName}`);
  }

  return value;
}

function readOptionalTokenField(payload: Record<string, unknown>, fieldName: string): string | null {
  const value = payload[fieldName];
  return typeof value === "string" && value.trim() ? value : null;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatOAuthError(value: unknown): string {
  if (isRecord(value)) {
    const message = value.error_description ?? value.error ?? value.message;

    if (typeof message === "string" && message.trim()) {
      return message.slice(0, 300);
    }
  }

  return JSON.stringify(value).slice(0, 300);
}

function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, String(entryValue)])
  );
}

function assertHttpsUrl(value: string, label: string): void {
  const url = new URL(value);

  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error(`${label} must be a trusted HTTPS URL`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
