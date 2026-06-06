import test from "node:test";
import assert from "node:assert/strict";
import { shouldAutoApplyGeneratedFileChange } from "../src/renderer/src/state/fileChanges.js";

test("full access auto-applies generated file changes instead of blocking on review", () => {
  assert.equal(
    shouldAutoApplyGeneratedFileChange({
      fullAccess: true,
      hasActionSource: true
    }),
    true
  );
});

test("auto review mode keeps generated file changes in the review queue", () => {
  assert.equal(
    shouldAutoApplyGeneratedFileChange({
      fullAccess: false,
      hasActionSource: true
    }),
    false
  );
});
