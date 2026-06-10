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
    "slack",
    "notion",
    "airtable",
    "todoist",
    "google-calendar",
    "figma",
    "gmail",
    "google-drive",
    "dropbox",
    "microsoft-365",
    "linear",
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

test("OAuth-capable service extensions declare provider metadata and token fields", () => {
  const manifests = serviceExtensionDefinitions.map((definition) => definition.manifest);
  const oauthManifests = manifests.filter((manifest) => manifest.auth.oauth);

  assert.deepEqual(
    oauthManifests.map((manifest) => manifest.id),
    [
      "github",
      "gitlab",
      "slack",
      "notion",
      "airtable",
      "todoist",
      "google-calendar",
      "figma",
      "gmail",
      "google-drive",
      "dropbox",
      "microsoft-365",
      "linear",
      "jira-cloud",
      "discord"
    ]
  );

  for (const manifest of oauthManifests) {
    const oauth = manifest.auth.oauth;

    assert.ok(oauth);
    assert.ok(manifest.auth.fields.some((field) => field.id === oauth.accessTokenFieldId));
    assert.equal(
      manifest.auth.fields.find((field) => field.id === oauth.accessTokenFieldId)?.manualInput,
      false
    );
    if (oauth.refreshTokenFieldId) {
      assert.equal(
        manifest.auth.fields.find((field) => field.id === oauth.refreshTokenFieldId)?.manualInput,
        false
      );
    }
    if (oauth.clientIdFieldId) {
      assert.ok(manifest.auth.fields.some((field) => field.id === oauth.clientIdFieldId));
    } else if (oauth.redirectUriMode === "brokered") {
      assert.equal(
        Boolean(oauth.brokerAuthorizationUrl),
        Boolean(process.env.FORGE_OAUTH_BROKER_BASE_URL)
      );
    } else {
      assert.ok(oauth.productClientId || oauth.productClientIdEnvVar);
    }
    assert.ok(oauth.authorizationUrl.startsWith("https://"));
    assert.ok(oauth.tokenUrl.startsWith("https://"));
    assert.ok(oauth.docsUrl.startsWith("https://"));
    assert.ok(oauth.setupUrl.startsWith("https://"));
  }

  assert.equal(
    manifests.find((manifest) => manifest.id === "gmail")?.auth.oauth?.redirectUriMode,
    "loopback"
  );
  assert.equal(
    manifests.find((manifest) => manifest.id === "slack")?.auth.oauth?.redirectUriMode,
    "brokered"
  );
  assert.equal(
    manifests.find((manifest) => manifest.id === "github")?.auth.oauth?.redirectUriMode,
    "device-code"
  );
});

test("extensions panel maps built-in services to product icon assets", async () => {
  const source = await readFile("src/renderer/src/components/ExtensionsPanel.tsx", "utf8");
  const expectedAssets = new Map([
    ["qq-mail", "qq-mail.ico"],
    ["github", "github.png"],
    ["gitlab", "gitlab.ico"],
    ["slack", "slack.png"],
    ["notion", "notion.png"],
    ["airtable", "airtable.ico"],
    ["todoist", "todoist.ico"],
    ["google-calendar", "google-calendar.png"],
    ["figma", "figma.png"],
    ["gmail", "gmail.ico"],
    ["google-drive", "google-drive.png"],
    ["dropbox", "dropbox.ico"],
    ["microsoft-365", "microsoft-365.svg"],
    ["linear", "linear.svg"],
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
  assert.match(source, /普通用户不需要自己创建 OAuth app/u);
  assert.match(source, /selectedOAuthUsesProductClient/u);
  assert.match(source, /canStartSelectedOAuth/u);
  assert.match(source, /disabled=\{\s*busyOAuthExtensionId === selectedManifest\.id \|\|/u);
  assert.match(source, /Forge 授权服务/u);
  assert.match(source, /getManualAuthFields/u);
  assert.match(source, /oauthOnlyCredentials/u);
  assert.match(source, /manualInput !== false/u);
  assert.doesNotMatch(source, /打开官方配置/u);
});

test("gmail OAuth loopback authorization saves access and refresh tokens", async () => {
  const fixture = await createRegistryFixture();
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
    const result = await fixture.registry.startOAuth({
      extensionId: "gmail"
    });

    assert.equal(result.provider, "Google");
    assert.deepEqual(result.savedFields, ["accessToken", "refreshToken"]);
    assert.equal(fetchMock.calls.length, 1);

    const gmailStatus = result.registry.secretStatuses.find(
      (status) => status.extensionId === "gmail"
    );

    assert.equal(gmailStatus?.configured, true);
    assert.equal(gmailStatus?.fields.accessToken.hasValue, true);
    assert.equal(gmailStatus?.fields.refreshToken.hasValue, true);
  } finally {
    fetchMock.restore();
    await fixture.cleanup();
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
  ) => Promise<{ body: unknown; status: number }>
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
        "Content-Type": "application/json"
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
