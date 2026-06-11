import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("language verification commands are in the safe command allowlist", async () => {
  const source = await readFile("src/renderer/src/agent/agentActionExecutor.ts", "utf8");

  assert.match(source, /cargo\\s\+test/u);
  assert.match(source, /--manifest-path/u);
  assert.match(source, /go\\s\+\(\?:-c\\s\+\\S\+\\s\+\)\?test/u);
  assert.match(source, /test\\s\+\\.\\\/\\.\\.\\.\(\?:\\s\|\$\)/u);
});
