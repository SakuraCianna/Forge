import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExtensionRegistry } from "../src/main/extensions/extensionRegistry.js";
import { createExtensionInvocationLogStore } from "../src/main/extensions/extensionInvocationLog.js";
import { startExtensionOAuthAuthorization } from "../src/main/extensions/extensionOAuth.js";
import { createExtensionStore } from "../src/main/extensions/extensionStore.js";
import { serviceExtensionDefinitions } from "../src/main/extensions/serviceExtensions.js";
import { formatExtensionActionSchemaForPrompt } from "../src/renderer/src/state/extensions.js";

test("built-in service extensions expose production manifests for common services", () => {
  const manifests = serviceExtensionDefinitions.map((definition) => definition.manifest);
  const ids = manifests.map((manifest) => manifest.id);

  assert.deepEqual(ids, [
    "github",
    "gitlab",
    "bitbucket",
    "confluence",
    "slack",
    "notion",
    "airtable",
    "hubspot",
    "salesforce",
    "zendesk",
    "intercom",
    "freshdesk",
    "pipedrive",
    "todoist",
    "asana",
    "clickup",
    "monday",
    "trello",
    "stripe",
    "shopify",
    "mailchimp",
    "postmark",
    "twilio",
    "google-calendar",
    "calendly",
    "miro",
    "zoom",
    "figma",
    "gmail",
    "google-drive",
    "dropbox",
    "microsoft-365",
    "linear",
    "sentry",
    "pagerduty",
    "datadog",
    "cloudflare",
    "okta",
    "jira-cloud",
    "discord"
  ]);

  for (const manifest of manifests) {
    assert.equal(manifest.builtIn, true);
    assert.equal(manifest.auth.type, "secret");
    assert.ok(manifest.auth.fields.length >= 1);
    assert.ok(manifest.permissions.length >= 1);
    assert.ok(manifest.actions.length >= 2);
    assert.equal(
      manifest.actions.every((action) =>
        manifest.permissions.some((permission) => permission.id === action.permission)
      ),
      true
    );
  }

  assert.equal(
    manifests.flatMap((manifest) => manifest.actions).some((action) => action.confirmation === "always"),
    true
  );
});

test("built-in service extensions expose manual token fields by default", () => {
  const manifests = serviceExtensionDefinitions.map((definition) => definition.manifest);

  assert.deepEqual(manifests.filter((manifest) => manifest.auth.oauth).map((manifest) => manifest.id), []);

  for (const manifest of manifests) {
    for (const field of manifest.auth.fields) {
      assert.notEqual(field.manualInput, false, `${manifest.id}.${field.id} should be editable`);
    }
  }
});

test("extensions panel maps built-in services to product icon assets", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");
  const expectedAssets = new Map([
    ["qq-mail", "qq-mail.ico"],
    ["github", "github.png"],
    ["gitlab", "gitlab.ico"],
    ["bitbucket", "bitbucket.ico"],
    ["confluence", "confluence.ico"],
    ["slack", "slack.png"],
    ["notion", "notion.png"],
    ["airtable", "airtable.ico"],
    ["hubspot", "hubspot.png"],
    ["salesforce", "salesforce.ico"],
    ["zendesk", "zendesk.ico"],
    ["intercom", "intercom.ico"],
    ["freshdesk", "freshdesk.ico"],
    ["pipedrive", "pipedrive.ico"],
    ["todoist", "todoist.ico"],
    ["asana", "asana.ico"],
    ["clickup", "clickup.png"],
    ["monday", "monday.ico"],
    ["trello", "trello.ico"],
    ["stripe", "stripe.ico"],
    ["shopify", "shopify.ico"],
    ["mailchimp", "mailchimp.ico"],
    ["postmark", "postmark.ico"],
    ["twilio", "twilio.ico"],
    ["google-calendar", "google-calendar.png"],
    ["calendly", "calendly.ico"],
    ["miro", "miro.png"],
    ["zoom", "zoom.ico"],
    ["figma", "figma.png"],
    ["gmail", "gmail.ico"],
    ["google-drive", "google-drive.png"],
    ["dropbox", "dropbox.ico"],
    ["microsoft-365", "microsoft-365.svg"],
    ["linear", "linear.svg"],
    ["sentry", "sentry.ico"],
    ["pagerduty", "pagerduty.ico"],
    ["datadog", "datadog.ico"],
    ["cloudflare", "cloudflare.ico"],
    ["okta", "okta.ico"],
    ["jira-cloud", "jira-cloud.ico"],
    ["discord", "discord.ico"]
  ]);

  assert.match(source, /const extensionIconSources/u);
  assert.match(source, /extensionIconSources\[manifest\.id\]/u);
  assert.doesNotMatch(source, /<Mail className="h-4 w-4"/u);

  for (const [extensionId, filename] of expectedAssets) {
    assert.match(source, new RegExp(`${escapeRegExp(extensionId)}["']?: new URL\\("../assets/extension-icons/${escapeRegExp(filename)}`));

    const asset = await stat(`src/renderer/src/assets/extension-icons/${filename}`);
    assert.equal(asset.isFile(), true);
    assert.ok(asset.size > 0);
  }
});

test("extensions panel explains OAuth setup before browser authorization", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");

  assert.match(source, /oauthMissingPrerequisites/u);
  assert.match(source, /这不是普通用户要填写的内容/u);
  assert.match(source, /selectedOAuthUsesProductClient/u);
  assert.match(source, /canStartSelectedOAuth/u);
  assert.match(source, /disabled=\{\s*busyOAuthExtensionId === selectedManifest\.id \|\|/u);
  assert.match(source, /FORGE_OAUTH_BROKER_BASE_URL/u);
  assert.match(source, /Forge OAuth broker/u);
  assert.match(source, /getManualAuthFields/u);
  assert.match(source, /oauthOnlyCredentials/u);
  assert.match(source, /copy\.oauthOnlyCredentials/u);
  assert.match(source, /manualInput !== false/u);
  assert.doesNotMatch(source, /打开官方配置/u);
});

test("gmail OAuth loopback authorization saves access and refresh tokens", async () => {
  const savedSecrets = new Map<string, string>();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.equal(init?.method, "POST");

    const body = new URLSearchParams(String(init?.body));

    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "gmail-code");
    assert.match(body.get("client_id") ?? "", /\.apps\.googleusercontent\.com$/u);
    assert.ok(body.get("code_verifier"));
    assert.match(body.get("redirect_uri") ?? "", /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/u);

    return {
      body: {
        access_token: "ya29-test-token",
        expires_in: 3600,
        refresh_token: "refresh-test-token"
      },
      status: 200
    };
  });

  try {
    const result = await startExtensionOAuthAuthorization({
      manifest: serviceExtensionDefinitions.find(
        (definition) => definition.manifest.id === "gmail"
      )?.manifest ?? serviceExtensionDefinitions[0].manifest,
      oauth: {
        provider: "Google",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        productClientId: "google-client-id.apps.googleusercontent.com",
        docsUrl: "https://developers.google.com/identity/protocols/oauth2/native-app",
        setupUrl: "https://console.cloud.google.com/apis/credentials",
        redirectUriMode: "loopback",
        usePkce: true,
        tokenRequestAuth: "none"
      },
      openExternal: async (url) => {
        const authorizationUrl = new URL(url);
        const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
        const state = authorizationUrl.searchParams.get("state");

        assert.equal(authorizationUrl.origin, "https://accounts.google.com");
        assert.equal(authorizationUrl.searchParams.get("client_id"), "google-client-id.apps.googleusercontent.com");

        if (redirectUri && state) {
          setTimeout(() => {
            void fetch(`${redirectUri}?code=gmail-code&state=${encodeURIComponent(state)}`);
          }, 0);
        }

        return true;
      },
      readSecret: async () => null,
      saveSecret: async (fieldId, value) => {
        savedSecrets.set(fieldId, value);
      },
      timeoutMs: 10_000
    });

    assert.equal(result.provider, "Google");
    assert.deepEqual(result.savedFields, ["accessToken", "refreshToken"]);
    assert.equal(savedSecrets.get("accessToken"), "ya29-test-token");
    assert.equal(savedSecrets.get("refreshToken"), "refresh-test-token");
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("github OAuth device flow opens a local code page and saves token", async () => {
  const savedSecrets = new Map<string, string>();
  const fetchMock = installMockFetch(async (url, init) => {
    if (url === "https://github.com/login/device/code") {
      assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body));

      assert.equal(body.get("client_id"), "github-client-id");
      assert.equal(body.get("scope"), "repo read:user");

      return {
        body: {
          device_code: "device-code",
          expires_in: 600,
          interval: 1,
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device"
        },
        status: 200
      };
    }

    assert.equal(url, "https://github.com/login/oauth/access_token");
    assert.equal(init?.method, "POST");

    const body = new URLSearchParams(String(init?.body));

    assert.equal(body.get("client_id"), "github-client-id");
    assert.equal(body.get("device_code"), "device-code");
    assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");

    return {
      body: {
        access_token: "gho-test-token",
        token_type: "bearer"
      },
      status: 200
    };
  });

  try {
    const result = await startExtensionOAuthAuthorization({
      manifest: serviceExtensionDefinitions.find(
        (definition) => definition.manifest.id === "github"
      )?.manifest ?? serviceExtensionDefinitions[0].manifest,
      oauth: {
        provider: "GitHub",
        authorizationUrl: "https://github.com/login/device",
        tokenUrl: "https://github.com/login/oauth/access_token",
        deviceAuthorizationUrl: "https://github.com/login/device/code",
        scopes: ["repo", "read:user"],
        accessTokenFieldId: "token",
        docsUrl:
          "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
        setupUrl: "https://github.com/settings/developers",
        redirectUriMode: "device-code",
        usePkce: false,
        tokenRequestAuth: "none",
        productClientId: "github-client-id"
      },
      openExternal: async (url) => {
        assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/u);
        const page = await fetch(url);
        const html = await page.text();

        assert.match(html, /ABCD-1234/u);
        assert.match(html, /github\.com\/login\/device/u);
        return true;
      },
      readSecret: async () => null,
      saveSecret: async (fieldId, value) => {
        savedSecrets.set(fieldId, value);
      },
      timeoutMs: 10_000
    });

    assert.deepEqual(result.savedFields, ["token"]);
    assert.equal(savedSecrets.get("token"), "gho-test-token");
    assert.equal(fetchMock.calls.length, 2);
  } finally {
    fetchMock.restore();
  }
});

test("brokered OAuth exchanges Forge broker code and saves tokens", async () => {
  const savedSecrets = new Map<string, string>();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://forge.example.com/oauth/slack/token");
    assert.equal(init?.method, "POST");

    const body = new URLSearchParams(String(init?.body));

    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "broker-code");
    assert.match(body.get("redirect_uri") ?? "", /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/u);

    return {
      body: {
        access_token: "xoxb-test-token",
        refresh_token: "refresh-test-token"
      },
      status: 200
    };
  });

  try {
    const result = await startExtensionOAuthAuthorization({
      manifest: serviceExtensionDefinitions.find(
        (definition) => definition.manifest.id === "slack"
      )?.manifest ?? serviceExtensionDefinitions[0].manifest,
      oauth: {
        provider: "Slack",
        authorizationUrl: "https://slack.com/oauth/v2/authorize",
        tokenUrl: "https://slack.com/api/oauth.v2.access",
        brokerAuthorizationUrl: "https://forge.example.com/oauth/slack/authorize",
        brokerTokenUrl: "https://forge.example.com/oauth/slack/token",
        scopes: ["channels:read", "chat:write"],
        accessTokenFieldId: "botToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://docs.slack.dev/authentication/installing-with-oauth/",
        setupUrl: "https://api.slack.com/apps",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body"
      },
      openExternal: async (url) => {
        const authorizationUrl = new URL(url);
        const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
        const state = authorizationUrl.searchParams.get("state");

        assert.equal(authorizationUrl.origin, "https://forge.example.com");
        assert.equal(authorizationUrl.pathname, "/oauth/slack/authorize");
        assert.equal(authorizationUrl.searchParams.get("provider"), "Slack");
        assert.equal(authorizationUrl.searchParams.get("scope"), "channels:read chat:write");

        if (redirectUri && state) {
          setTimeout(() => {
            void fetch(`${redirectUri}?code=broker-code&state=${encodeURIComponent(state)}`);
          }, 0);
        }

        return true;
      },
      readSecret: async () => null,
      saveSecret: async (fieldId, value) => {
        savedSecrets.set(fieldId, value);
      },
      timeoutMs: 10_000
    });

    assert.deepEqual(result.savedFields, ["botToken", "refreshToken"]);
    assert.equal(savedSecrets.get("botToken"), "xoxb-test-token");
    assert.equal(savedSecrets.get("refreshToken"), "refresh-test-token");
    assert.equal(fetchMock.calls.length, 1);
  } finally {
    fetchMock.restore();
  }
});

test("service extensions report missing required credential fields", async () => {
  const fixture = await createRegistryFixture();

  try {
    await fixture.registry.updateSettings({
      extensionId: "freshdesk",
      enabled: true,
      permissions: [{ permissionId: "freshdesk.read", mode: "allow" }]
    });
    await fixture.registry.saveSecret({
      extensionId: "freshdesk",
      fieldId: "domain",
      value: "example"
    });

    await assert.rejects(
      () =>
        fixture.registry.invoke({
          extensionId: "freshdesk",
          actionId: "listTickets",
          input: {}
        }),
      /Extension credentials are not configured: Freshdesk\. Missing: Freshdesk API key/u
    );
  } finally {
    await fixture.cleanup();
  }
});

test("gitlab service extension invokes the REST API with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://gitlab.com");
    assert.equal(requestUrl.pathname, "/api/v4/projects/group%2Fproject/issues");
    assert.equal(requestUrl.searchParams.get("state"), "opened");
    assert.equal(requestUrl.searchParams.get("per_page"), "3");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer gitlab-token");

    return {
      body: [
        {
          iid: 1,
          title: "Bug"
        },
        {
          iid: 2,
          title: "Follow up"
        }
      ],
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "gitlab",
      "gitlab.read",
      "accessToken",
      "gitlab-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "gitlab",
      actionId: "listProjectIssues",
      input: {
        limit: 3,
        projectId: "group/project"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "GitLab group/project 返回 2 个 Issue");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("bitbucket service extension lists repositories with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.bitbucket.org");
    assert.equal(requestUrl.pathname, "/2.0/repositories/team");
    assert.equal(requestUrl.searchParams.get("pagelen"), "2");
    assert.equal(requestUrl.searchParams.get("sort"), "-updated_on");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer bitbucket-token");

    return {
      body: {
        values: [
          {
            slug: "forge"
          },
          {
            slug: "docs"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "bitbucket",
      "bitbucket.read",
      "accessToken",
      "bitbucket-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "bitbucket",
      actionId: "listRepositories",
      input: {
        limit: 2,
        workspace: "team"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Bitbucket team 返回 2 个仓库");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("confluence service extension searches pages with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.atlassian.com");
    assert.equal(
      requestUrl.pathname,
      "/ex/confluence/cloud-1/wiki/rest/api/content/search"
    );
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.match(requestUrl.searchParams.get("cql") ?? "", /type = page/u);
    assert.match(requestUrl.searchParams.get("cql") ?? "", /release/u);
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer atlassian-token");

    return {
      body: {
        results: [
          {
            id: "page-1"
          },
          {
            id: "page-2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "confluence",
      "confluence.read",
      "accessToken",
      "atlassian-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "confluence",
      actionId: "searchPages",
      input: {
        cloudId: "cloud-1",
        limit: 2,
        query: "release"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Confluence Cloud 搜索返回 2 个页面");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("airtable service extension invokes the Web API with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.airtable.com/v0/meta/bases");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer airtable-token");

    return {
      body: {
        bases: [
          {
            id: "appExample",
            name: "Operations"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "airtable",
      "airtable.read",
      "accessToken",
      "airtable-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "airtable",
      actionId: "listBases",
      input: {}
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Airtable 返回 1 个 base");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("hubspot service extension reads CRM objects with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.hubapi.com");
    assert.equal(requestUrl.pathname, "/crm/objects/2026-03/0-1");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.match(requestUrl.searchParams.get("properties") ?? "", /email/u);
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer hubspot-token");

    return {
      body: {
        results: [
          {
            id: "contact-1"
          },
          {
            id: "contact-2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "hubspot",
      "hubspot.read",
      "accessToken",
      "hubspot-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "hubspot",
      actionId: "listContacts",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "HubSpot 返回 2 个联系人");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("salesforce service extension queries account records with token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://acme.my.salesforce.com");
    assert.equal(requestUrl.pathname, "/services/data/v61.0/query");
    assert.match(requestUrl.searchParams.get("q") ?? "", /FROM Account/u);
    assert.match(requestUrl.searchParams.get("q") ?? "", /LIMIT 2/u);
    assert.equal(init?.method, "GET");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer salesforce-token"
    );

    return {
      body: {
        records: [
          {
            Id: "001A"
          },
          {
            Id: "001B"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "salesforce", "salesforce.read", {
      accessToken: "salesforce-token",
      instanceUrl: "https://acme.my.salesforce.com/"
    });

    const result = await fixture.registry.invoke({
      extensionId: "salesforce",
      actionId: "listAccounts",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Salesforce 返回 2 个客户");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("zendesk service extension searches tickets with token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://acme.zendesk.com");
    assert.equal(requestUrl.pathname, "/api/v2/search.json");
    assert.equal(requestUrl.searchParams.get("per_page"), "2");
    assert.equal(requestUrl.searchParams.get("query"), "type:ticket status:open");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer zendesk-token");

    return {
      body: {
        results: [
          {
            id: 1
          },
          {
            id: 2
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "zendesk", "zendesk.read", {
      accessToken: "zendesk-token",
      subdomain: "https://acme.zendesk.com"
    });

    const result = await fixture.registry.invoke({
      extensionId: "zendesk",
      actionId: "searchTickets",
      input: {
        limit: 2,
        query: "status:open"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Zendesk 搜索返回 2 个工单");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("intercom service extension lists conversations with token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.intercom.io");
    assert.equal(requestUrl.pathname, "/conversations");
    assert.equal(requestUrl.searchParams.get("per_page"), "2");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer intercom-token");
    assert.equal((init?.headers as Record<string, string>)["Intercom-Version"], "2.15");

    return {
      body: {
        conversations: [
          {
            id: "conversation-1"
          },
          {
            id: "conversation-2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "intercom",
      "intercom.read",
      "accessToken",
      "intercom-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "intercom",
      actionId: "listConversations",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Intercom 返回 2 个会话");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("freshdesk service extension lists tickets with API key auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://acme.freshdesk.com");
    assert.equal(requestUrl.pathname, "/api/v2/tickets");
    assert.equal(requestUrl.searchParams.get("per_page"), "2");
    assert.equal(init?.method, "GET");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from("freshdesk-key:X").toString("base64")}`
    );

    return {
      body: [
        {
          id: 1
        },
        {
          id: 2
        }
      ],
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "freshdesk", "freshdesk.read", {
      apiKey: "freshdesk-key",
      domain: "acme"
    });

    const result = await fixture.registry.invoke({
      extensionId: "freshdesk",
      actionId: "listTickets",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Freshdesk 返回 2 个工单");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("pipedrive service extension lists deals with API token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.pipedrive.com");
    assert.equal(requestUrl.pathname, "/v1/deals");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.equal(requestUrl.searchParams.get("api_token"), "pipedrive-token");
    assert.equal(init?.method, "GET");

    return {
      body: {
        data: [
          {
            id: 1
          },
          {
            id: 2
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "pipedrive",
      "pipedrive.read",
      "apiToken",
      "pipedrive-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "pipedrive",
      actionId: "listDeals",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Pipedrive 返回 2 个交易");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("todoist service extension reads tasks through the API with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.todoist.com");
    assert.equal(requestUrl.pathname, "/api/v1/tasks");
    assert.equal(requestUrl.searchParams.get("project_id"), "12345");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer todoist-token");

    return {
      body: {
        results: [
          {
            id: "task-1",
            content: "Review plan"
          },
          {
            id: "task-2",
            content: "Ship change"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "todoist",
      "todoist.read",
      "accessToken",
      "todoist-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "todoist",
      actionId: "listTasks",
      input: {
        limit: 2,
        projectId: "12345"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Todoist 返回 2 个任务");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("todoist write actions require confirmation before creating tasks", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.todoist.com/api/v1/tasks");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer todoist-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      content: "Write release notes",
      due_string: "tomorrow",
      project_id: "12345"
    });

    return {
      body: {
        content: "Write release notes",
        id: "task-3"
      },
      status: 200
    };
  });

  try {
    await fixture.registry.updateSettings({
      extensionId: "todoist",
      enabled: true,
      permissions: [
        { permissionId: "todoist.read", mode: "allow" },
        { permissionId: "todoist.write", mode: "allow" }
      ]
    });
    await fixture.registry.saveSecret({
      extensionId: "todoist",
      fieldId: "accessToken",
      value: "todoist-token"
    });

    const pending = await fixture.registry.invoke({
      extensionId: "todoist",
      actionId: "createTask",
      input: {
        content: "Write release notes",
        dueString: "tomorrow",
        projectId: "12345"
      }
    });

    assert.equal(pending.ok, false);
    assert.equal(fetchMock.calls.length, 0);

    if (!pending.ok && "requiresConfirmation" in pending) {
      const confirmed = await fixture.registry.confirmInvocation({
        token: pending.confirmation.token
      });

      assert.equal(confirmed.ok, true);
      assert.equal(fetchMock.calls.length, 1);
    } else {
      assert.fail("createTask should require confirmation");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("asana service extension lists project tasks with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://app.asana.com");
    assert.equal(requestUrl.pathname, "/api/1.0/projects/120/tasks");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.match(requestUrl.searchParams.get("opt_fields") ?? "", /permalink_url/u);
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer asana-token");

    return {
      body: {
        data: [
          {
            gid: "task-1",
            name: "Review"
          },
          {
            gid: "task-2",
            name: "Ship"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "asana",
      "asana.read",
      "accessToken",
      "asana-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "asana",
      actionId: "listTasks",
      input: {
        limit: 2,
        projectGid: "120"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Asana 返回 2 个任务");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("clickup service extension lists authorized workspaces with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.clickup.com/api/v2/team");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer clickup-token");

    return {
      body: {
        teams: [
          {
            id: "team-1",
            name: "Product"
          },
          {
            id: "team-2",
            name: "Engineering"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "clickup",
      "clickup.read",
      "accessToken",
      "clickup-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "clickup",
      actionId: "listWorkspaces",
      input: {}
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "ClickUp 返回 2 个工作区");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("monday service extension invokes the GraphQL API with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.monday.com/v2");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "monday-token");
    assert.equal((init?.headers as Record<string, string>)["API-Version"], "2026-01");

    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };

    assert.match(body.query, /boards\(limit: \$limit\)/u);
    assert.deepEqual(body.variables, {
      limit: 2
    });

    return {
      body: {
        data: {
          boards: [
            {
              id: "board-1",
              name: "Roadmap"
            },
            {
              id: "board-2",
              name: "Launch"
            }
          ]
        }
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "monday",
      "monday.read",
      "accessToken",
      "monday-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "monday",
      actionId: "listBoards",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "monday.com 返回 2 个看板");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("trello service extension lists board cards with key and token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.trello.com");
    assert.equal(requestUrl.pathname, "/1/boards/board-1/cards");
    assert.equal(requestUrl.searchParams.get("key"), "trello-key");
    assert.equal(requestUrl.searchParams.get("token"), "trello-token");
    assert.equal(requestUrl.searchParams.get("filter"), "open");
    assert.match(requestUrl.searchParams.get("fields") ?? "", /dateLastActivity/u);
    assert.equal(init?.method, "GET");

    return {
      body: [
        {
          id: "card-1"
        },
        {
          id: "card-2"
        }
      ],
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "trello", "trello.read", {
      apiKey: "trello-key",
      token: "trello-token"
    });

    const result = await fixture.registry.invoke({
      extensionId: "trello",
      actionId: "listBoardCards",
      input: {
        boardId: "board-1"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Trello 看板 board-1 返回 2 张卡片");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("stripe service extension lists charges with secret key auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.stripe.com");
    assert.equal(requestUrl.pathname, "/v1/charges");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer sk_test_123");

    return {
      body: {
        data: [
          {
            id: "ch_1"
          },
          {
            id: "ch_2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "stripe",
      "stripe.read",
      "secretKey",
      "sk_test_123"
    );

    const result = await fixture.registry.invoke({
      extensionId: "stripe",
      actionId: "listCharges",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Stripe 返回 2 条付款记录");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("shopify service extension queries products through Admin GraphQL", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://acme.myshopify.com");
    assert.equal(requestUrl.pathname, "/admin/api/2026-04/graphql.json");
    assert.equal(init?.method, "POST");
    assert.equal(
      (init?.headers as Record<string, string>)["X-Shopify-Access-Token"],
      "shopify-token"
    );

    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };

    assert.match(body.query, /products\(first: \$first, query: \$query\)/u);
    assert.deepEqual(body.variables, {
      first: 2,
      query: "status:active"
    });

    return {
      body: {
        data: {
          products: {
            nodes: [
              {
                id: "gid://shopify/Product/1"
              },
              {
                id: "gid://shopify/Product/2"
              }
            ]
          }
        }
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "shopify", "shopify.read", {
      adminAccessToken: "shopify-token",
      storeDomain: "https://acme.myshopify.com/admin"
    });

    const result = await fixture.registry.invoke({
      extensionId: "shopify",
      actionId: "listProducts",
      input: {
        limit: 2,
        query: "status:active"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Shopify 返回 2 个商品");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("mailchimp service extension lists audiences with API key auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://us21.api.mailchimp.com");
    assert.equal(requestUrl.pathname, "/3.0/lists");
    assert.equal(requestUrl.searchParams.get("count"), "2");
    assert.equal(init?.method, "GET");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from("Forge:mailchimp-key").toString("base64")}`
    );

    return {
      body: {
        lists: [
          {
            id: "audience-1"
          },
          {
            id: "audience-2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "mailchimp", "mailchimp.read", {
      apiKey: "mailchimp-key",
      serverPrefix: "us21"
    });

    const result = await fixture.registry.invoke({
      extensionId: "mailchimp",
      actionId: "listAudiences",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Mailchimp 返回 2 个受众");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("postmark send actions require confirmation before sending email", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.postmarkapp.com/email");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)["X-Postmark-Server-Token"], "postmark-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      From: "sender@example.com",
      Subject: "Hello",
      TextBody: "Sent from Forge",
      To: "receiver@example.com"
    });

    return {
      body: {
        MessageID: "message-1"
      },
      status: 200
    };
  });

  try {
    await fixture.registry.updateSettings({
      extensionId: "postmark",
      enabled: true,
      permissions: [
        { permissionId: "postmark.read", mode: "allow" },
        { permissionId: "postmark.send", mode: "allow" }
      ]
    });
    await fixture.registry.saveSecret({
      extensionId: "postmark",
      fieldId: "serverToken",
      value: "postmark-token"
    });

    const pending = await fixture.registry.invoke({
      extensionId: "postmark",
      actionId: "sendEmail",
      input: {
        from: "sender@example.com",
        subject: "Hello",
        textBody: "Sent from Forge",
        to: "receiver@example.com"
      }
    });

    assert.equal(pending.ok, false);
    assert.equal(fetchMock.calls.length, 0);

    if (!pending.ok && "requiresConfirmation" in pending) {
      const confirmed = await fixture.registry.confirmInvocation({
        token: pending.confirmation.token
      });

      assert.equal(confirmed.ok, true);
      assert.equal(fetchMock.calls.length, 1);
    } else {
      assert.fail("sendEmail should require confirmation");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("twilio service extension lists messages with basic auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.twilio.com");
    assert.equal(requestUrl.pathname, "/2010-04-01/Accounts/AC123/Messages.json");
    assert.equal(requestUrl.searchParams.get("PageSize"), "2");
    assert.equal(init?.method, "GET");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from("AC123:twilio-token").toString("base64")}`
    );

    return {
      body: {
        messages: [
          {
            sid: "SM1"
          },
          {
            sid: "SM2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "twilio", "twilio.read", {
      accountSid: "AC123",
      authToken: "twilio-token"
    });

    const result = await fixture.registry.invoke({
      extensionId: "twilio",
      actionId: "listMessages",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Twilio 返回 2 条短信");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("calendly service extension lists event types with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.calendly.com");
    assert.equal(requestUrl.pathname, "/event_types");
    assert.equal(requestUrl.searchParams.get("user"), "https://api.calendly.com/users/ABC");
    assert.equal(requestUrl.searchParams.get("count"), "2");
    assert.equal(requestUrl.searchParams.get("active"), "true");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer calendly-token");

    return {
      body: {
        collection: [
          {
            uri: "event-type-1"
          },
          {
            uri: "event-type-2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "calendly",
      "calendly.read",
      "accessToken",
      "calendly-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "calendly",
      actionId: "listEventTypes",
      input: {
        active: true,
        limit: 2,
        userUri: "https://api.calendly.com/users/ABC"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Calendly 返回 2 个事件类型");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("miro service extension lists boards with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.miro.com");
    assert.equal(requestUrl.pathname, "/v2/boards");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer miro-token");

    return {
      body: {
        data: [
          {
            id: "board-1",
            name: "Workshop"
          },
          {
            id: "board-2",
            name: "Retro"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "miro",
      "miro.read",
      "accessToken",
      "miro-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "miro",
      actionId: "listBoards",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Miro 返回 2 个 board");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("zoom service extension lists meetings with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.zoom.us");
    assert.equal(requestUrl.pathname, "/v2/users/me/meetings");
    assert.equal(requestUrl.searchParams.get("page_size"), "2");
    assert.equal(requestUrl.searchParams.get("type"), "scheduled");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer zoom-token");

    return {
      body: {
        meetings: [
          {
            id: 1,
            topic: "Planning"
          },
          {
            id: 2,
            topic: "Review"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "zoom",
      "zoom.read",
      "accessToken",
      "zoom-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "zoom",
      actionId: "listMeetings",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Zoom 返回 2 个会议");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("dropbox service extension lists folders through the API with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.dropboxapi.com/2/files/list_folder");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer dropbox-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      include_deleted: false,
      include_has_explicit_shared_members: false,
      include_mounted_folders: true,
      include_non_downloadable_files: true,
      limit: 2,
      path: ""
    });

    return {
      body: {
        entries: [
          {
            ".tag": "folder",
            name: "Docs",
            path_display: "/Docs"
          },
          {
            ".tag": "file",
            name: "notes.md",
            path_display: "/notes.md"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "dropbox",
      "dropbox.read",
      "accessToken",
      "dropbox-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "dropbox",
      actionId: "listFolder",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Dropbox 返回 2 个条目");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("microsoft 365 service extension invokes Graph with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://graph.microsoft.com");
    assert.equal(requestUrl.pathname, "/v1.0/me/drive/root/children");
    assert.equal(requestUrl.searchParams.get("$top"), "2");
    assert.match(requestUrl.searchParams.get("$select") ?? "", /webUrl/u);
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer graph-token");

    return {
      body: {
        value: [
          {
            id: "drive-1",
            name: "Docs"
          },
          {
            id: "drive-2",
            name: "Notes.md"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "microsoft-365",
      "microsoft365.read",
      "accessToken",
      "graph-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "microsoft-365",
      actionId: "listDriveRoot",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Microsoft 365 返回 2 个 OneDrive 条目");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("sentry service extension lists organization issues with connector token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://sentry.io");
    assert.equal(requestUrl.pathname, "/api/0/organizations/acme/issues/");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.equal(requestUrl.searchParams.get("query"), "is:unresolved");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer sentry-token");

    return {
      body: [
        {
          id: "issue-1",
          title: "TypeError"
        },
        {
          id: "issue-2",
          title: "Timeout"
        }
      ],
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "sentry",
      "sentry.read",
      "accessToken",
      "sentry-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "sentry",
      actionId: "listIssues",
      input: {
        limit: 2,
        organizationSlug: "acme"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Sentry acme 返回 2 个 Issue");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("pagerduty service extension lists incidents with API token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.pagerduty.com");
    assert.equal(requestUrl.pathname, "/incidents");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.equal(requestUrl.searchParams.get("statuses[]"), "triggered");
    assert.equal(init?.method, "GET");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Token token=pagerduty-token"
    );

    return {
      body: {
        incidents: [
          {
            id: "incident-1"
          },
          {
            id: "incident-2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "pagerduty",
      "pagerduty.read",
      "apiToken",
      "pagerduty-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "pagerduty",
      actionId: "listIncidents",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "PagerDuty 返回 2 个事件");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("datadog service extension lists incidents with API and application keys", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.datadoghq.eu");
    assert.equal(requestUrl.pathname, "/api/v2/incidents");
    assert.equal(requestUrl.searchParams.get("page[size]"), "2");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>)["DD-API-KEY"], "datadog-api-key");
    assert.equal(
      (init?.headers as Record<string, string>)["DD-APPLICATION-KEY"],
      "datadog-app-key"
    );

    return {
      body: {
        data: [
          {
            id: "incident-1"
          },
          {
            id: "incident-2"
          }
        ]
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "datadog", "datadog.read", {
      apiKey: "datadog-api-key",
      applicationKey: "datadog-app-key",
      site: "https://api.datadoghq.eu"
    });

    const result = await fixture.registry.invoke({
      extensionId: "datadog",
      actionId: "listIncidents",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Datadog 返回 2 个事件");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("cloudflare service extension lists zones with API token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://api.cloudflare.com");
    assert.equal(requestUrl.pathname, "/client/v4/zones");
    assert.equal(requestUrl.searchParams.get("per_page"), "2");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer cloudflare-token");

    return {
      body: {
        result: [
          {
            id: "zone-1"
          },
          {
            id: "zone-2"
          }
        ],
        success: true
      },
      status: 200
    };
  });

  try {
    await configureReadOnlyExtension(
      fixture,
      "cloudflare",
      "cloudflare.read",
      "apiToken",
      "cloudflare-token"
    );

    const result = await fixture.registry.invoke({
      extensionId: "cloudflare",
      actionId: "listZones",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Cloudflare 返回 2 个域名");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("okta service extension lists groups with SSWS token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    const requestUrl = new URL(url);

    assert.equal(requestUrl.origin, "https://example.okta.com");
    assert.equal(requestUrl.pathname, "/api/v1/groups");
    assert.equal(requestUrl.searchParams.get("limit"), "2");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "SSWS okta-token");

    return {
      body: [
        {
          id: "group-1"
        },
        {
          id: "group-2"
        }
      ],
      status: 200
    };
  });

  try {
    await configureReadOnlyExtensionSecrets(fixture, "okta", "okta.read", {
      apiToken: "okta-token",
      orgUrl: "https://example.okta.com"
    });

    const result = await fixture.registry.invoke({
      extensionId: "okta",
      actionId: "listGroups",
      input: {
        limit: 2
      }
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "Okta 返回 2 个用户组");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("enabled service extensions appear in the agent prompt only after credentials are configured", async () => {
  const fixture = await createRegistryFixture();

  try {
    await fixture.registry.updateSettings({
      extensionId: "github",
      enabled: true,
      permissions: [
        { permissionId: "github.read", mode: "ask" },
        { permissionId: "github.write", mode: "ask" }
      ]
    });
    await fixture.registry.updateSettings({
      extensionId: "slack",
      enabled: true,
      permissions: [
        { permissionId: "slack.read", mode: "ask" },
        { permissionId: "slack.send", mode: "ask" }
      ]
    });
    await fixture.registry.saveSecret({
      extensionId: "github",
      fieldId: "token",
      value: "ghp_test"
    });

    const snapshot = await fixture.registry.getSnapshot();
    const prompt = formatExtensionActionSchemaForPrompt(snapshot);

    assert.match(prompt, /github\.listIssues/u);
    assert.match(prompt, /github\.createIssue/u);
    assert.doesNotMatch(prompt, /slack\.postMessage/u);

    await fixture.registry.saveSecret({
      extensionId: "slack",
      fieldId: "botToken",
      value: "xoxb-test"
    });

    const configuredPrompt = formatExtensionActionSchemaForPrompt(await fixture.registry.getSnapshot());

    assert.match(configuredPrompt, /slack\.listChannels/u);
    assert.match(configuredPrompt, /slack\.postMessage/u);
    assert.match(configuredPrompt, /confirmation: always/u);
    assert.doesNotMatch(configuredPrompt, /figma\.getFile/u);
  } finally {
    await fixture.cleanup();
  }
});

test("github service extension invokes the official REST API with token auth", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.github.com/user");
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer ghp_test");

    return {
      body: {
        id: 42,
        login: "octocat"
      },
      status: 200
    };
  });

  try {
    await configureGitHub(fixture, "allow");

    const result = await fixture.registry.invoke({
      extensionId: "github",
      actionId: "getAuthenticatedUser",
      input: {}
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 1);

    if (result.ok) {
      assert.equal(result.outputSummary, "GitHub 当前账号: octocat");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("service extensions retry transient HTTP failures for read actions", async () => {
  const fixture = await createRegistryFixture();
  let attempts = 0;
  const fetchMock = installMockFetch(async (url, init) => {
    attempts += 1;

    assert.equal(url, "https://api.github.com/user");
    assert.equal(init?.method, "GET");

    if (attempts === 1) {
      return {
        body: {
          message: "secondary rate limit"
        },
        headers: {
          "Retry-After": "0"
        },
        status: 429
      };
    }

    return {
      body: {
        id: 42,
        login: "octocat"
      },
      status: 200
    };
  });

  try {
    await configureGitHub(fixture, "allow");

    const result = await fixture.registry.invoke({
      extensionId: "github",
      actionId: "getAuthenticatedUser",
      input: {}
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 2);

    if (result.ok) {
      assert.equal(result.outputSummary, "GitHub 当前账号: octocat");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("service extensions retry transient network failures for read actions", async () => {
  const fixture = await createRegistryFixture();
  let attempts = 0;
  const fetchMock = installMockFetch(async (url, init) => {
    attempts += 1;

    assert.equal(url, "https://api.github.com/user");
    assert.equal(init?.method, "GET");

    if (attempts === 1) {
      throw new TypeError("fetch failed");
    }

    return {
      body: {
        id: 42,
        login: "octocat"
      },
      status: 200
    };
  });

  try {
    await configureGitHub(fixture, "allow");

    const result = await fixture.registry.invoke({
      extensionId: "github",
      actionId: "getAuthenticatedUser",
      input: {}
    });

    assert.equal(result.ok, true);
    assert.equal(fetchMock.calls.length, 2);

    if (result.ok) {
      assert.equal(result.outputSummary, "GitHub 当前账号: octocat");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

test("github write actions require confirmation before creating external issues", async () => {
  const fixture = await createRegistryFixture();
  const fetchMock = installMockFetch(async (url, init) => {
    assert.equal(url, "https://api.github.com/repos/SakuraCianna/Forge/issues");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      body: "Created from Forge",
      labels: ["forge"],
      title: "Follow up"
    });

    return {
      body: {
        html_url: "https://github.com/SakuraCianna/Forge/issues/1",
        number: 1,
        title: "Follow up"
      },
      status: 201
    };
  });

  try {
    await configureGitHub(fixture, "allow");

    const pending = await fixture.registry.invoke({
      extensionId: "github",
      actionId: "createIssue",
      input: {
        body: "Created from Forge",
        labels: ["forge"],
        owner: "SakuraCianna",
        repo: "Forge",
        title: "Follow up"
      }
    });

    assert.equal(pending.ok, false);
    assert.equal(fetchMock.calls.length, 0);

    if (!pending.ok && "requiresConfirmation" in pending) {
      const confirmed = await fixture.registry.confirmInvocation({
        token: pending.confirmation.token
      });

      assert.equal(confirmed.ok, true);
      assert.equal(fetchMock.calls.length, 1);
    } else {
      assert.fail("createIssue should require confirmation");
    }
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
  }
});

async function configureGitHub(
  fixture: Awaited<ReturnType<typeof createRegistryFixture>>,
  mode: "allow" | "ask"
): Promise<void> {
  await fixture.registry.updateSettings({
    extensionId: "github",
    enabled: true,
    permissions: [
      { permissionId: "github.read", mode },
      { permissionId: "github.write", mode }
    ]
  });
  await fixture.registry.saveSecret({
    extensionId: "github",
    fieldId: "token",
    value: "ghp_test"
  });
}

async function configureReadOnlyExtension(
  fixture: Awaited<ReturnType<typeof createRegistryFixture>>,
  extensionId: string,
  permissionId: string,
  fieldId: string,
  value: string
): Promise<void> {
  await fixture.registry.updateSettings({
    extensionId,
    enabled: true,
    permissions: [{ permissionId, mode: "allow" }]
  });
  await fixture.registry.saveSecret({
    extensionId,
    fieldId,
    value
  });
}

async function configureReadOnlyExtensionSecrets(
  fixture: Awaited<ReturnType<typeof createRegistryFixture>>,
  extensionId: string,
  permissionId: string,
  secrets: Record<string, string>
): Promise<void> {
  await fixture.registry.updateSettings({
    extensionId,
    enabled: true,
    permissions: [{ permissionId, mode: "allow" }]
  });

  for (const [fieldId, value] of Object.entries(secrets)) {
    await fixture.registry.saveSecret({
      extensionId,
      fieldId,
      value
    });
  }
}

async function createRegistryFixture() {
  const directory = await mkdtemp(join(tmpdir(), "forge-service-extensions-"));
  const vault = createMemoryVault();
  const registry = createExtensionRegistry({
    customExtensionDirectory: join(directory, "custom"),
    logStore: createExtensionInvocationLogStore({ directory }),
    openExternal: async (url) => {
      const authorizationUrl = new URL(url);
      const redirectUri = authorizationUrl.searchParams.get("redirect_uri");
      const state = authorizationUrl.searchParams.get("state");

      if (redirectUri && state) {
        setTimeout(() => {
          void fetch(`${redirectUri}?code=gmail-code&state=${encodeURIComponent(state)}`);
        }, 0);
      }

      return true;
    },
    store: createExtensionStore({ directory }),
    vault
  });

  return {
    registry,
    async cleanup() {
      await rm(directory, { recursive: true, force: true });
    }
  };
}

function createMemoryVault() {
  const secrets = new Map<string, string>();

  return {
    async saveExtensionSecret(extensionId: string, fieldId: string, value: string): Promise<void> {
      secrets.set(createSecretKey(extensionId, fieldId), value);
    },
    async readExtensionSecret(extensionId: string, fieldId: string): Promise<string | null> {
      return secrets.get(createSecretKey(extensionId, fieldId)) ?? null;
    },
    async getExtensionSecretStatus(
      extensionId: string,
      fieldIds: string[]
    ): Promise<Record<string, { hasKey: boolean; last4: string | null }>> {
      return Object.fromEntries(
        fieldIds.map((fieldId) => {
          const value = secrets.get(createSecretKey(extensionId, fieldId));

          return [
            fieldId,
            {
              hasKey: Boolean(value),
              last4: value ? value.slice(-4) : null
            }
          ];
        })
      );
    },
    async deleteExtensionSecret(extensionId: string, fieldId: string): Promise<void> {
      secrets.delete(createSecretKey(extensionId, fieldId));
    }
  };
}

function createSecretKey(extensionId: string, fieldId: string): string {
  return `${extensionId}:${fieldId}`;
}

function installMockFetch(
  handler: (
    url: string,
    init: RequestInit | undefined
  ) => Promise<{ body: unknown; headers?: Record<string, string>; status: number }>
): {
  calls: Array<{ init: RequestInit | undefined; url: string }>;
  restore: () => void;
} {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ init: RequestInit | undefined; url: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith("http://127.0.0.1:")) {
      return originalFetch(input, init);
    }

    calls.push({ init, url });
    const response = await handler(url, init);

    return new Response(JSON.stringify(response.body), {
      headers: {
        "Content-Type": "application/json",
        ...response.headers
      },
      status: response.status
    });
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
