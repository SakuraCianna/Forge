import assert from "node:assert/strict";
import test from "node:test";

import { formatFailureRecoverySuggestion } from "../src/renderer/src/agent/failureRecoveryPolicy.js";

test("suggested failure recovery wording says Forge is paused instead of auto-recovering", () => {
  const zhMessage = formatFailureRecoverySuggestion("zh-CN", { label: "运行命令 npm run build" });
  const enMessage = formatFailureRecoverySuggestion("en-US", { label: "Run npm run build" });

  assert.match(zhMessage, /已暂停自动恢复/u);
  assert.doesNotMatch(zhMessage, /自动准备恢复步骤/u);
  assert.match(enMessage, /paused automatic recovery/u);
  assert.doesNotMatch(enMessage, /prepare recovery steps automatically/u);
});
