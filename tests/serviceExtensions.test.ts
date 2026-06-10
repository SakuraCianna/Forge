import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExtensionRegistry } from "../src/main/extensions/extensionRegistry.js";
import { createExtensionInvocationLogStore } from "../src/main/extensions/extensionInvocationLog.js";
import { createExtensionStore } from "../src/main/extensions/extensionStore.js";
import { serviceExtensionDefinitions } from "../src/main/extensions/serviceExtensions.js";
import { formatExtensionActionSchemaForPrompt } from "../src/renderer/src/state/extensions.js";

test("built-in service extensions expose production manifests for common services", () => {
  const manifests = serviceExtensionDefinitions.map((definition) => definition.manifest);
  const ids = manifests.map((manifest) => manifest.id);

  assert.deepEqual(ids, ["github", "slack", "notion", "google-calendar", "figma"]);

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

async function createRegistryFixture() {
  const directory = await mkdtemp(join(tmpdir(), "forge-service-extensions-"));
  const vault = createMemoryVault();
  const registry = createExtensionRegistry({
    customExtensionDirectory: join(directory, "custom"),
    logStore: createExtensionInvocationLogStore({ directory }),
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
