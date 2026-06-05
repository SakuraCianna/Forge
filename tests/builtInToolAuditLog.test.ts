import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createBuiltInToolAuditLogStore,
  createBuiltInToolCallLogRecordInput
} from "../src/main/builtInTools/builtInToolAuditLog.js";

test("built-in tool audit log records timing, status, risk and errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-tool-audit-"));

  try {
    const store = createBuiltInToolAuditLogStore({
      directory,
      createId: () => "tool-log-1"
    });
    const record = await store.append(
      createBuiltInToolCallLogRecordInput({
        toolName: "runCommand",
        category: "terminal",
        riskLevel: "medium",
        startTime: "2026-06-04T01:00:00.000Z",
        endTime: "2026-06-04T01:00:02.000Z",
        status: "failed",
        errorMessage: "Command exited with code 1"
      })
    );
    const logs = await store.list(5);

    assert.equal(record.id, "tool-log-1");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].toolName, "runCommand");
    assert.equal(logs[0].category, "terminal");
    assert.equal(logs[0].riskLevel, "medium");
    assert.equal(logs[0].status, "failed");
    assert.equal(logs[0].errorMessage, "Command exited with code 1");
    assert.equal(logs[0].durationMs, 2000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
