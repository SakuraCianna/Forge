// 本文件说明: 覆盖服务扩展输入读取、URL 规范化和输出摘要辅助函数
import test from "node:test";
import assert from "node:assert/strict";

type ServiceInputModule = {
  createBasicAuthHeader(username: string, password: string): string;
  encodePathSegment(value: string): string;
  normalizeFreshdeskDomain(value: string): string;
  normalizeHttpsOrigin(value: string, label: string): string;
  normalizeDatadogSite(value: string): string;
  normalizeShopifyStoreDomain(value: string): string;
  normalizeSimpleHostLabel(value: string, label: string): string;
  normalizeZendeskSubdomain(value: string): string;
  readArrayLength(value: unknown): number;
  readCollectionLength(value: unknown): number;
  readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T;
  readLimit(value: unknown, fallback: number): number;
  readNestedObjectText(value: unknown, fields: string[], fallback: string): string;
  readNestedRecord(value: unknown, fields: string[]): Record<string, unknown>;
  readObjectText(value: unknown, field: string, fallback: string): string;
  readOptionalString(value: unknown, maxLength: number): string;
  readOptionalStringList(value: unknown, fieldName: string, maxLength: number): string[];
  readRecord(value: unknown): Record<string, unknown>;
  readRequiredIsoDate(value: unknown, fieldName: string): string;
  readRequiredString(value: unknown, fieldName: string, maxLength: number): string;
  toOutputRecord(value: unknown): Record<string, unknown>;
  withQuery(url: string, query: Record<string, string> | undefined): string;
};

test("service input helper reads and bounds user-provided values", async () => {
  const input = await importServiceInputModule();

  assert.equal(input.readRequiredString("  octocat  ", "owner", 120), "octocat");
  assert.throws(() => input.readRequiredString("   ", "owner", 120), /owner is required/u);
  assert.throws(() => input.readRequiredString("abcdef", "owner", 5), /owner is too long/u);
  assert.equal(input.readOptionalString("  abcdef  ", 3), "abc");
  assert.deepEqual(input.readOptionalStringList("read; write, admin", "scopes", 3), [
    "read",
    "write",
    "admin"
  ]);
  assert.throws(
    () => input.readOptionalStringList(["a", "b", "c"], "labels", 2),
    /labels has too many values/u
  );
  assert.equal(input.readLimit(undefined, 20), 20);
  assert.equal(input.readLimit(0.2, 20), 1);
  assert.equal(input.readLimit(220, 20), 100);
  assert.equal(input.readRequiredIsoDate("2026-06-17T08:00:00.000Z", "start"), "2026-06-17T08:00:00.000Z");
  assert.throws(() => input.readRequiredIsoDate("not-a-date", "start"), /valid ISO date-time/u);
});

test("service input helper normalizes service domains and request URLs", async () => {
  const input = await importServiceInputModule();

  assert.equal(
    input.normalizeHttpsOrigin(" https://example.my.salesforce.com/services/data/ ", "Salesforce instance URL"),
    "https://example.my.salesforce.com"
  );
  assert.throws(
    () => input.normalizeHttpsOrigin("http://example.my.salesforce.com", "Salesforce instance URL"),
    /must use https/u
  );
  assert.equal(input.normalizeZendeskSubdomain("https://Acme.zendesk.com/agent"), "acme");
  assert.equal(input.normalizeShopifyStoreDomain("https://Demo.myshopify.com/admin"), "demo.myshopify.com");
  assert.equal(input.normalizeDatadogSite("https://api.US5.DatadogHQ.com/dashboard"), "us5.datadoghq.com");
  assert.throws(() => input.normalizeDatadogSite("bad host"), /Datadog site is invalid/u);
  assert.equal(input.normalizeFreshdeskDomain("Support"), "support.freshdesk.com");
  assert.equal(input.normalizeSimpleHostLabel("Example-Team", "team"), "example-team");
  assert.throws(() => input.normalizeSimpleHostLabel("bad_host", "team"), /team is invalid/u);
  assert.equal(
    input.withQuery("https://api.example.com/items?existing=1", { empty: "", q: "a b" }),
    "https://api.example.com/items?existing=1&q=a+b"
  );
  assert.equal(input.encodePathSegment("owner/repo name"), "owner%2Frepo%20name");
});

test("service input helper extracts records and output summary fields", async () => {
  const input = await importServiceInputModule();

  assert.deepEqual(input.readRecord(null), {});
  assert.deepEqual(input.toOutputRecord("ok"), { result: "ok" });
  assert.equal(input.readObjectText({ login: "octocat" }, "login", "unknown"), "octocat");
  assert.equal(input.readObjectText({ login: "   " }, "login", "unknown"), "unknown");
  assert.equal(
    input.readNestedObjectText({ user: { profile: { name: "octocat" } } }, ["user", "profile", "name"], "unknown"),
    "octocat"
  );
  assert.deepEqual(input.readNestedRecord({ payload: { issue: { number: 42 } } }, ["payload", "issue"]), {
    number: 42
  });
  assert.equal(input.readArrayLength([{ id: 1 }, { id: 2 }, { id: 3 }]), 3);
  assert.equal(input.readArrayLength({ results: [] }), 0);
  assert.equal(input.readCollectionLength([{ id: 1 }, { id: 2 }]), 2);
  assert.equal(input.readCollectionLength({ results: [{ id: 1 }] }), 1);
  assert.equal(input.readEnum("closed", ["open", "closed"], "open"), "closed");
  assert.equal(input.readEnum("invalid", ["open", "closed"], "open"), "open");
  assert.equal(input.createBasicAuthHeader("user", "pass"), "Basic dXNlcjpwYXNz");
});

async function importServiceInputModule(): Promise<ServiceInputModule> {
  const modulePath = "../src/main/extensions/serviceInput.js";
  return (await import(modulePath)) as ServiceInputModule;
}
