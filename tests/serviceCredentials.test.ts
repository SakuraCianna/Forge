// 本文件说明: 覆盖服务扩展凭据读取和规范化辅助函数
import test from "node:test";
import assert from "node:assert/strict";

type SecretContext = {
  readSecret(fieldId: string): Promise<string | null>;
};

type ServiceCredentialsModule = {
  readDatadogCredentials(context: SecretContext): Promise<{
    apiKey: string;
    applicationKey: string;
    site: string;
  }>;
  readFreshdeskCredentials(context: SecretContext): Promise<{
    apiKey: string;
    domain: string;
  }>;
  readMailchimpCredentials(context: SecretContext): Promise<{
    apiKey: string;
    serverPrefix: string;
  }>;
  readOktaCredentials(context: SecretContext): Promise<{
    apiToken: string;
    orgUrl: string;
  }>;
  readSalesforceCredentials(context: SecretContext): Promise<{
    instanceUrl: string;
    token: string;
  }>;
  readSecret(context: SecretContext, fieldId: string, label: string): Promise<string>;
  readShopifyCredentials(context: SecretContext): Promise<{
    adminAccessToken: string;
    storeDomain: string;
  }>;
  readTrelloCredentials(context: SecretContext): Promise<{
    apiKey: string;
    token: string;
  }>;
  readTwilioCredentials(context: SecretContext): Promise<{
    accountSid: string;
    authToken: string;
  }>;
  readZendeskCredentials(context: SecretContext): Promise<{
    subdomain: string;
    token: string;
  }>;
};

test("service credential helper reports missing required secrets", async () => {
  const credentials = await importServiceCredentialsModule();
  const context = createSecretContext({
    domain: "support"
  });

  assert.equal(await credentials.readSecret(context, "domain", "Freshdesk domain"), "support");
  await assert.rejects(
    () => credentials.readSecret(context, "apiKey", "Freshdesk API key"),
    /Freshdesk API key is not configured/u
  );
});

test("service credential helper normalizes OAuth and domain credentials", async () => {
  const credentials = await importServiceCredentialsModule();

  assert.deepEqual(
    await credentials.readSalesforceCredentials(
      createSecretContext({
        accessToken: "salesforce-token",
        instanceUrl: " https://example.my.salesforce.com/services/data/ "
      })
    ),
    {
      instanceUrl: "https://example.my.salesforce.com",
      token: "salesforce-token"
    }
  );
  assert.deepEqual(
    await credentials.readZendeskCredentials(
      createSecretContext({
        accessToken: "zendesk-token",
        subdomain: "https://Acme.zendesk.com/agent"
      })
    ),
    {
      subdomain: "acme",
      token: "zendesk-token"
    }
  );
  assert.deepEqual(
    await credentials.readShopifyCredentials(
      createSecretContext({
        adminAccessToken: "shopify-token",
        storeDomain: "https://Demo.myshopify.com/admin"
      })
    ),
    {
      adminAccessToken: "shopify-token",
      storeDomain: "demo.myshopify.com"
    }
  );
  assert.deepEqual(
    await credentials.readOktaCredentials(
      createSecretContext({
        apiToken: "okta-token",
        orgUrl: " https://example.okta.com/oauth2/default/ "
      })
    ),
    {
      apiToken: "okta-token",
      orgUrl: "https://example.okta.com"
    }
  );
});

test("service credential helper reads token pair and API key credentials", async () => {
  const credentials = await importServiceCredentialsModule();

  assert.deepEqual(
    await credentials.readTrelloCredentials(
      createSecretContext({
        apiKey: "trello-key",
        token: "trello-token"
      })
    ),
    {
      apiKey: "trello-key",
      token: "trello-token"
    }
  );
  assert.deepEqual(
    await credentials.readDatadogCredentials(
      createSecretContext({
        apiKey: "datadog-key",
        applicationKey: "datadog-app",
        site: "https://api.datadoghq.eu/dashboard"
      })
    ),
    {
      apiKey: "datadog-key",
      applicationKey: "datadog-app",
      site: "datadoghq.eu"
    }
  );
  assert.deepEqual(
    await credentials.readDatadogCredentials(
      createSecretContext({
        apiKey: "datadog-key",
        applicationKey: "datadog-app"
      })
    ),
    {
      apiKey: "datadog-key",
      applicationKey: "datadog-app",
      site: "datadoghq.com"
    }
  );
  assert.deepEqual(
    await credentials.readFreshdeskCredentials(
      createSecretContext({
        apiKey: "freshdesk-key",
        domain: "Support"
      })
    ),
    {
      apiKey: "freshdesk-key",
      domain: "support.freshdesk.com"
    }
  );
  assert.deepEqual(
    await credentials.readMailchimpCredentials(
      createSecretContext({
        apiKey: "mailchimp-key",
        serverPrefix: "US1"
      })
    ),
    {
      apiKey: "mailchimp-key",
      serverPrefix: "us1"
    }
  );
  assert.deepEqual(
    await credentials.readTwilioCredentials(
      createSecretContext({
        accountSid: "twilio-sid",
        authToken: "twilio-token"
      })
    ),
    {
      accountSid: "twilio-sid",
      authToken: "twilio-token"
    }
  );
});

async function importServiceCredentialsModule(): Promise<ServiceCredentialsModule> {
  const modulePath = "../src/main/extensions/serviceCredentials.js";
  return (await import(modulePath)) as ServiceCredentialsModule;
}

function createSecretContext(secrets: Record<string, string>): SecretContext {
  return {
    async readSecret(fieldId: string): Promise<string | null> {
      return secrets[fieldId] ?? null;
    }
  };
}
