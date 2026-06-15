import test from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveMemoryContent } from "../src/shared/memoryRedaction.js";

test("shared memory redaction removes common secrets before MEMORY.md writes or injection", () => {
  const redacted = redactSensitiveMemoryContent(
    [
      "api_key=sk-1234567890abcdef",
      "Authorization: Bearer ghp_1234567890abcdef",
      "aws=AKIA1234567890ABCDEF",
      "cookie=sessionid=secret-cookie",
      "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----"
    ].join("\n")
  );

  assert.match(redacted, /api_key=\[redacted\]/u);
  assert.match(redacted, /Bearer \[redacted\]/u);
  assert.match(redacted, /\[redacted aws access key\]/u);
  assert.match(redacted, /cookie=\[redacted\]/u);
  assert.match(redacted, /\[redacted private key\]/u);
  assert.doesNotMatch(redacted, /sk-1234567890abcdef/u);
  assert.doesNotMatch(redacted, /ghp_1234567890abcdef/u);
  assert.doesNotMatch(redacted, /AKIA1234567890ABCDEF/u);
  assert.doesNotMatch(redacted, /secret-cookie/u);
  assert.doesNotMatch(redacted, /abc123/u);
});
