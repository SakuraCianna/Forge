// 本文件说明: 验证任务线程中仍在运行的命令 runId 判定
import test from "node:test";
import assert from "node:assert/strict";
import type { TaskThread, TaskThreadEvent } from "../src/renderer/src/state/taskThreads.js";
import { getRunningThreadCommandRunIds } from "../src/renderer/src/state/threadCommandRuns.js";

test("running command run ids are empty when there is no active thread", () => {
  assert.deepEqual(getRunningThreadCommandRunIds(null), []);
});

test("running command run ids include unfinished command runs in first-seen order", () => {
  assert.deepEqual(
    getRunningThreadCommandRunIds(
      thread([
        commandRunEvent("run-test", "npm test"),
        commandRunEvent("run-build", "npm run build")
      ])
    ),
    ["run-test", "run-build"]
  );
});

test("running command run ids are deduped when command output repeats the run event", () => {
  assert.deepEqual(
    getRunningThreadCommandRunIds(
      thread([
        commandRunEvent("run-test", "npm test"),
        commandRunEvent("run-test", "npm test")
      ])
    ),
    ["run-test"]
  );
});

test("running command run ids exclude command runs that already have a result", () => {
  assert.deepEqual(
    getRunningThreadCommandRunIds(
      thread([
        commandRunEvent("run-test", "npm test"),
        commandRunEvent("run-build", "npm run build"),
        commandResultEvent("run-test", "npm test")
      ])
    ),
    ["run-build"]
  );
});

test("running command run ids ignore command runs without cancellable run ids", () => {
  assert.deepEqual(
    getRunningThreadCommandRunIds(
      thread([
        commandRunEvent(undefined, "npm test"),
        commandRunEvent("run-build", "npm run build")
      ])
    ),
    ["run-build"]
  );
});

test("running command run ids preserve existing runId matching semantics", () => {
  assert.deepEqual(
    getRunningThreadCommandRunIds(
      thread([
        commandRunEvent("run-test", "npm test"),
        commandRunEvent("run-build", "npm run build"),
        commandResultEvent(undefined, "npm test"),
        commandResultEvent("run-build", "npm run build --ci")
      ])
    ),
    ["run-test"]
  );
});

function thread(events: TaskThreadEvent[]): TaskThread {
  return {
    id: "thread-1",
    title: "Run checks",
    prompt: "运行检查",
    status: "running",
    modelId: "test:model",
    intelligence: "high",
    speed: "balanced",
    createdAt: "2026-06-17T00:00:00.000Z",
    projectPath: "E:\\CodeHome\\Forge",
    events
  };
}

function commandRunEvent(runId: string | undefined, command: string): TaskThreadEvent {
  return {
    id: `command-run-${runId ?? "legacy"}`,
    kind: "command",
    message: `running ${command}`,
    createdAt: "2026-06-17T00:01:00.000Z",
    commandRun: {
      runId,
      command,
      status: "running"
    }
  };
}

function commandResultEvent(runId: string | undefined, command: string): TaskThreadEvent {
  return {
    id: `command-result-${runId ?? "legacy"}`,
    kind: "command",
    message: `finished ${command}`,
    createdAt: "2026-06-17T00:02:00.000Z",
    commandResult: {
      runId,
      command,
      cwd: "E:\\CodeHome\\Forge",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false
    }
  };
}
