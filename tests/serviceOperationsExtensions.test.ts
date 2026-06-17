// 本文件说明: 覆盖运维与可观测性类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createOperationsExtensions } from "../src/main/extensions/serviceOperationsExtensions.js";

test("operations service extensions keep their production order and summaries", () => {
  const definitions = createOperationsExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "linear",
    "sentry",
    "pagerduty",
    "datadog",
    "cloudflare",
    "okta"
  ]);

  assert.equal(definitions[0].summarizeInput?.("listIssues", {}), "linear");
  assert.equal(definitions[1].summarizeInput?.("listOrganizations", {}), "sentry organizations");
  assert.equal(
    definitions[1].summarizeInput?.("listIssues", {
      organizationSlug: "acme"
    }),
    "sentry acme"
  );
  assert.equal(definitions[2].summarizeInput?.("listIncidents", {}), "pagerduty listIncidents");
  assert.equal(definitions[3].summarizeInput?.("listDashboards", {}), "datadog listDashboards");
  assert.equal(
    definitions[4].summarizeInput?.("listWorkerScripts", {
      accountId: "account-1"
    }),
    "cloudflare account-1"
  );
  assert.equal(definitions[4].summarizeInput?.("listZones", {}), "cloudflare listZones");
  assert.equal(definitions[5].summarizeInput?.("getCurrentUser", {}), "okta getCurrentUser");
});
