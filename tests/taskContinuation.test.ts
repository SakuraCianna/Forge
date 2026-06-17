// 本文件说明: 验证继续上一轮任务的线程续写判定
import test from "node:test";
import assert from "node:assert/strict";
import type { TaskThread, TaskThreadEvent } from "../src/renderer/src/state/taskThreads.js";
import { shouldSubmitAsContinuation } from "../src/renderer/src/state/taskContinuation.js";

test("continuation prompts resume a stopped thread with project execution history", () => {
  assert.equal(
    shouldSubmitAsContinuation(
      thread({
        status: "blocked",
        projectPath: "E:\\CodeHome\\Demo",
        agentActions: [
          {
            id: "edit-readme",
            stepId: "step-edit-readme",
            kind: "edit-file",
            label: "编辑 README",
            status: "pending",
            target: "README.md"
          }
        ]
      }),
      "E:\\CodeHome\\Demo",
      "继续"
    ),
    true
  );
});

test("continuation prompts do not attach to running or different-project threads", () => {
  assert.equal(
    shouldSubmitAsContinuation(
      thread({ status: "running", projectPath: "E:\\CodeHome\\Demo" }),
      "E:\\CodeHome\\Demo",
      "继续"
    ),
    false
  );
  assert.equal(
    shouldSubmitAsContinuation(
      thread({ status: "blocked", projectPath: "E:\\CodeHome\\Demo", events: [planEvent()] }),
      "E:\\CodeHome\\Other",
      "继续"
    ),
    false
  );
});

test("continuation prompts require prior execution context", () => {
  assert.equal(
    shouldSubmitAsContinuation(
      thread({ status: "blocked", projectPath: "E:\\CodeHome\\Demo" }),
      "E:\\CodeHome\\Demo",
      "继续"
    ),
    false
  );
  assert.equal(
    shouldSubmitAsContinuation(
      thread({ status: "blocked", projectPath: "E:\\CodeHome\\Demo", events: [planEvent()] }),
      "E:\\CodeHome\\Demo",
      "继续"
    ),
    true
  );
});

test("continuation prompts accept file and command events as execution context", () => {
  const executionEvents: TaskThreadEvent[] = [
    {
      id: "file-1",
      kind: "file",
      message: "updated README.md",
      createdAt: "2026-06-17T00:01:00.000Z"
    },
    {
      id: "command-run-1",
      kind: "command",
      message: "running npm test",
      createdAt: "2026-06-17T00:02:00.000Z",
      commandRun: {
        command: "npm test",
        status: "running"
      }
    },
    {
      id: "command-result-1",
      kind: "command",
      message: "npm test finished",
      createdAt: "2026-06-17T00:03:00.000Z",
      commandResult: {
        command: "npm test",
        cwd: "E:\\CodeHome\\Demo",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        timedOut: false
      }
    }
  ];

  for (const event of executionEvents) {
    assert.equal(
      shouldSubmitAsContinuation(
        thread({ status: "blocked", projectPath: "E:\\CodeHome\\Demo", events: [event] }),
        "E:\\CodeHome\\Demo",
        "继续"
      ),
      true
    );
  }
});

test("non-continuation prompts stay on the normal submission route", () => {
  assert.equal(
    shouldSubmitAsContinuation(
      thread({ status: "blocked", projectPath: "E:\\CodeHome\\Demo", events: [planEvent()] }),
      "E:\\CodeHome\\Demo",
      "修复 README"
    ),
    false
  );
});

function thread({
  status,
  projectPath,
  agentActions = [],
  events = []
}: {
  status: TaskThread["status"];
  projectPath: string | null;
  agentActions?: TaskThread["agentActions"];
  events?: TaskThread["events"];
}): TaskThread {
  return {
    id: "thread-1",
    title: "Old task",
    prompt: "修改 README",
    status,
    modelId: "test:model",
    intelligence: "high",
    speed: "balanced",
    createdAt: "2026-06-17T00:00:00.000Z",
    projectPath,
    agentActions,
    events
  };
}

function planEvent(): TaskThreadEvent {
  return {
    id: "plan-1",
    kind: "plan",
    message: "old plan",
    createdAt: "2026-06-17T00:01:00.000Z"
  };
}
