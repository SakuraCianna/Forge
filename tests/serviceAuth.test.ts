import test from "node:test";
import assert from "node:assert/strict";
import type {
  ExtensionAuthDefinition,
  ExtensionOAuthDefinition
} from "../src/shared/extensionTypes.js";

type ServiceAuthModule = {
  createGoogleOAuth: (scopes: string[], setupUrl: string) => ExtensionOAuthDefinition;
  createOAuthTokenAuth: (
    options: {
      accessTokenDescription: string;
      accessTokenFieldId?: string;
      accessTokenLabel?: string;
      accessTokenPlaceholder?: string;
      browserOAuthEnabled?: boolean;
      clientSecret?: boolean;
      oauth?: ExtensionOAuthDefinition;
      refreshTokenFieldId?: string;
    }
  ) => ExtensionAuthDefinition;
  trimTrailingSlash: (value: string | undefined) => string | undefined;
};

test("service OAuth auth defaults to editable manual token fields", async () => {
  const { createOAuthTokenAuth } = await importServiceAuthModule();
  const auth = createOAuthTokenAuth({
    accessTokenDescription: "Slack OAuth access token, 通过 Forge OAuth broker 自动保存",
    oauth: {
      provider: "Slack",
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["channels:read"],
      accessTokenFieldId: "accessToken",
      refreshTokenFieldId: "refreshToken",
      docsUrl: "https://docs.slack.dev/authentication/installing-with-oauth/",
      setupUrl: "https://api.slack.com/apps",
      redirectUriMode: "loopback",
      usePkce: true,
      tokenRequestAuth: "body"
    }
  });

  assert.equal(auth.oauth, undefined);
  assert.equal(auth.fields[0]?.id, "accessToken");
  assert.equal(auth.fields[0]?.label, "Access token / API key");
  assert.equal(auth.fields[0]?.manualInput, undefined);
  assert.equal(auth.fields[0]?.description, "Slack OAuth access token");
  assert.equal(auth.fields[1]?.manualInput, undefined);
});

test("service OAuth auth hides connector-managed tokens when browser OAuth is enabled", async () => {
  const { createOAuthTokenAuth } = await importServiceAuthModule();
  const auth = createOAuthTokenAuth({
    accessTokenDescription: "Slack OAuth access token, 通过 Forge OAuth broker 自动保存",
    browserOAuthEnabled: true,
    clientSecret: true,
    oauth: {
      provider: "Slack",
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["channels:read"],
      accessTokenFieldId: "accessToken",
      refreshTokenFieldId: "refreshToken",
      clientIdFieldId: "oauthClientId",
      clientSecretFieldId: "oauthClientSecret",
      docsUrl: "https://docs.slack.dev/authentication/installing-with-oauth/",
      setupUrl: "https://api.slack.com/apps",
      redirectUriMode: "loopback",
      usePkce: true,
      tokenRequestAuth: "body"
    }
  });

  assert.equal(auth.oauth?.provider, "Slack");
  assert.equal(auth.fields[0]?.label, "OAuth access token");
  assert.equal(auth.fields[0]?.manualInput, false);
  assert.equal(auth.fields[1]?.manualInput, false);
  assert.equal(auth.fields.some((field) => field.id === "oauthClientId"), true);
  assert.equal(auth.fields.some((field) => field.id === "oauthClientSecret"), true);
});

test("service Google OAuth helper preserves Forge product OAuth defaults", async () => {
  const { createGoogleOAuth } = await importServiceAuthModule();
  const oauth = createGoogleOAuth(
    ["https://www.googleapis.com/auth/gmail.readonly"],
    "https://console.cloud.google.com/apis/credentials"
  );

  assert.equal(oauth.provider, "Google");
  assert.equal(
    oauth.productClientId,
    "294153456393-3ce5vjc1bfu67kcblgte15be2qipts3q.apps.googleusercontent.com"
  );
  assert.equal(oauth.productClientIdEnvVar, "FORGE_GOOGLE_OAUTH_CLIENT_ID");
  assert.equal(oauth.redirectUriMode, "loopback");
  assert.equal(oauth.usePkce, true);
  assert.deepEqual(oauth.extraAuthorizeParams, {
    access_type: "offline",
    prompt: "consent"
  });
});

test("service OAuth helper trims broker and instance URL trailing slashes", async () => {
  const { trimTrailingSlash } = await importServiceAuthModule();

  assert.equal(trimTrailingSlash("https://forge.example.com///"), "https://forge.example.com");
  assert.equal(trimTrailingSlash("https://example.my.salesforce.com/"), "https://example.my.salesforce.com");
  assert.equal(trimTrailingSlash(undefined), undefined);
});

async function importServiceAuthModule(): Promise<ServiceAuthModule> {
  const modulePath = "../src/main/extensions/serviceAuth.js";
  return (await import(modulePath)) as ServiceAuthModule;
}
