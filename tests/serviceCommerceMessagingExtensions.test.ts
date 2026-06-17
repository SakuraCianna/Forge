// 本文件说明: 覆盖商业与消息类内置服务 Extension 的模块边界和摘要行为
import test from "node:test";
import assert from "node:assert/strict";

import { createCommerceMessagingExtensions } from "../src/main/extensions/serviceCommerceMessagingExtensions.js";

test("commerce messaging service extensions keep their production order and summaries", () => {
  const definitions = createCommerceMessagingExtensions();

  assert.deepEqual(definitions.map((definition) => definition.manifest.id), [
    "stripe",
    "shopify",
    "mailchimp",
    "postmark",
    "twilio"
  ]);

  assert.equal(definitions[0].summarizeInput?.("listCharges", {}), "stripe listCharges");
  assert.equal(definitions[1].summarizeInput?.("listProducts", { query: "shoes" }), "shopify listProducts shoes");
  assert.equal(definitions[1].summarizeInput?.("getShop", {}), "shopify getShop");
  assert.equal(definitions[2].summarizeInput?.("listAudiences", {}), "mailchimp listAudiences");
  assert.equal(definitions[3].summarizeInput?.("sendEmail", { subject: "Welcome" }), "postmark send Welcome");
  assert.equal(definitions[3].summarizeInput?.("listOutboundMessages", {}), "postmark listOutboundMessages");
  assert.equal(definitions[4].summarizeInput?.("listMessages", {}), "twilio listMessages");
});
