// 本文件说明: 覆盖客户与支持类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createCustomerExtensions } from "../src/main/extensions/serviceCustomerExtensions.js";

test("customer service extensions keep their production order and summaries", () => {
  const definitions = createCustomerExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "salesforce",
    "zendesk",
    "intercom",
    "freshdesk",
    "pipedrive"
  ]);

  assert.equal(definitions[0].summarizeInput?.("listAccounts", {}), "salesforce listAccounts");
  assert.equal(
    definitions[1].summarizeInput?.("searchTickets", {
      query: "priority:high"
    }),
    "zendesk priority:high"
  );
  assert.equal(definitions[1].summarizeInput?.("listTickets", {}), "zendesk listTickets");
  assert.equal(definitions[2].summarizeInput?.("listConversations", {}), "intercom listConversations");
  assert.equal(definitions[3].summarizeInput?.("listTickets", {}), "freshdesk listTickets");
  assert.equal(definitions[4].summarizeInput?.("listDeals", {}), "pipedrive listDeals");
});
