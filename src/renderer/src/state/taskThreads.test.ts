import { describe, expect, it } from "vitest";
import {
  createDefaultModelSettings,
  mergeFetchedModels,
  setCurrentModel,
  updateModelEnabled
} from "./modelSettings";
import {
  attachThreadAgentActions,
  appendCommandRunOutput,
  appendThreadEvents,
  archiveAllThreads,
  archiveProjectThreads,
  archiveThread,
  completeNextPendingAgentAction,
  createThreadFromSettings,
  cancelThread,
  restoreThread,
  toggleThreadPinned,
  updateThreadAgentActionStatus,
  type TaskThread
} from "./taskThreads";

const deps = {
  createId: () => "thread-1",
  now: () => "2026-05-27T13:00:00.000Z"
};

describe("taskThreads", () => {
  it("rejects empty task prompts", () => {
    const settings = createDefaultModelSettings();

    expect(createThreadFromSettings(settings, "   ", deps)).toEqual({
      ok: false,
      reason: "empty-prompt"
    });
  });

  it("requires at least one available model before creating a task thread", () => {
    const settings = { ...createDefaultModelSettings(), currentModelId: null, models: [] };

    expect(createThreadFromSettings(settings, "修复登录错误", deps)).toEqual({
      ok: false,
      reason: "missing-model"
    });
  });

  it("creates a task thread with the selected model, intelligence, speed, and initial event", () => {
    let settings = createDefaultModelSettings();
    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = setCurrentModel(settings, "openai:gpt-5.5");

    const result = createThreadFromSettings(settings, "实现设置持久化", deps);

    expect(result).toEqual({
      ok: true,
      thread: {
        id: "thread-1",
        title: "实现设置持久化",
        prompt: "实现设置持久化",
        status: "planned",
        modelId: "openai:gpt-5.5",
        intelligence: "high",
        speed: "balanced",
        createdAt: "2026-05-27T13:00:00.000Z",
        events: [
          {
            id: "thread-1-event-1",
            kind: "plan",
            message: "任务已创建, 等待 Forge 生成执行计划",
            createdAt: "2026-05-27T13:00:00.000Z"
          }
        ]
      }
    });
  });

  it("appends events to a matching thread and updates its status", () => {
    let settings = createDefaultModelSettings();
    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    const result = createThreadFromSettings(settings, "实现设置持久化", deps);

    if (!result.ok) {
      throw new Error("Expected thread");
    }

    const threads = appendThreadEvents(
      [result.thread],
      "thread-1",
      [
        {
          id: "thread-1-plan-2",
          kind: "plan",
          message: "初始计划",
          createdAt: "2026-05-27T13:00:00.000Z"
        }
      ],
      "running"
    );

    expect(threads[0].status).toBe("running");
    expect(threads[0].events.map((event) => event.message)).toEqual([
      "任务已创建, 等待 Forge 生成执行计划",
      "初始计划"
    ]);
  });

  it("marks a running thread as cancelled with a visible event", () => {
    const thread: TaskThread = {
      id: "thread-1",
      title: "Say hi",
      prompt: "你好",
      status: "running",
      modelId: "openai:gpt-5.5",
      intelligence: "high",
      speed: "balanced",
      createdAt: "2026-05-27T13:00:00.000Z",
      events: []
    };

    const threads = cancelThread([thread], "thread-1", {
      createdAt: "2026-05-27T13:01:00.000Z",
      message: "已终止"
    });

    expect(threads[0].status).toBe("blocked");
    expect(threads[0].events[0]).toMatchObject({
      kind: "error",
      message: "已终止"
    });
  });

  it("appends live command output to the matching running command", () => {
    const threads: TaskThread[] = [
      {
        id: "thread-1",
        title: "Run tests",
        prompt: "Run tests",
        status: "running" as const,
        modelId: "openai:gpt-5.5",
        intelligence: "high" as const,
        speed: "balanced" as const,
        createdAt: "2026-05-27T13:00:00.000Z",
        events: [
          {
            id: "event-command-started",
            kind: "command" as const,
            message: "Started command",
            createdAt: "2026-05-27T13:05:00.000Z",
            commandRun: {
              command: "npm test",
              runId: "run-1",
              status: "running" as const
            }
          }
        ]
      }
    ];

    const withStdout = appendCommandRunOutput(threads, {
      runId: "run-1",
      command: "npm test",
      stream: "stdout",
      chunk: "first line\n"
    });
    const withStderr = appendCommandRunOutput(withStdout, {
      runId: "run-1",
      command: "npm test",
      stream: "stderr",
      chunk: "warning line\n"
    });

    expect(threads[0].events[0].commandRun?.stdout).toBeUndefined();
    expect(withStderr[0].events[0].commandRun?.stdout).toBe("first line\n");
    expect(withStderr[0].events[0].commandRun?.stderr).toBe("warning line\n");
  });

  it("pins, archives, restores, and archives all conversations without losing events", () => {
    let settings = createDefaultModelSettings();
    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    const first = createThreadFromSettings(settings, "First conversation", deps);
    const second = createThreadFromSettings(settings, "Second conversation", {
      createId: () => "thread-2",
      now: deps.now
    });

    if (!first.ok || !second.ok) {
      throw new Error("Expected threads");
    }

    let threads = toggleThreadPinned([first.thread, second.thread], "thread-2");
    expect(threads.find((thread) => thread.id === "thread-2")?.pinned).toBe(true);

    threads = archiveThread(threads, "thread-1");
    expect(threads.find((thread) => thread.id === "thread-1")?.archived).toBe(true);
    expect(threads.find((thread) => thread.id === "thread-1")?.events.length).toBe(1);

    threads = restoreThread(threads, "thread-1");
    expect(threads.find((thread) => thread.id === "thread-1")?.archived).toBe(false);

    threads = archiveAllThreads(threads);
    expect(threads.every((thread) => thread.archived)).toBe(true);
  });

  it("archives only conversations for a selected project", () => {
    let settings = createDefaultModelSettings();
    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    const first = createThreadFromSettings(settings, "Project Forge", deps);
    const second = createThreadFromSettings(settings, "Project Aiko", {
      createId: () => "thread-2",
      now: deps.now
    });

    if (!first.ok || !second.ok) {
      throw new Error("Expected threads");
    }

    const threads = archiveProjectThreads(
      [
        { ...first.thread, projectPath: "E:\\CodeHome\\Forge" },
        { ...second.thread, projectPath: "E:\\CodeHome\\Aiko" }
      ],
      "E:\\CodeHome\\Forge"
    );

    expect(threads.find((thread) => thread.id === "thread-1")?.archived).toBe(true);
    expect(threads.find((thread) => thread.id === "thread-2")?.archived).toBeUndefined();
  });

  it("attaches generated agent actions to the matching thread", () => {
    const threads = attachThreadAgentActions(
      [
        {
          id: "thread-1",
          title: "Agent task",
          prompt: "Agent task",
          status: "planned",
          modelId: "openai:gpt-5.5",
          intelligence: "high",
          speed: "balanced",
          createdAt: "2026-05-27T13:00:00.000Z",
          events: []
        },
        {
          id: "thread-2",
          title: "Other task",
          prompt: "Other task",
          status: "planned",
          modelId: "openai:gpt-5.5",
          intelligence: "high",
          speed: "balanced",
          createdAt: "2026-05-27T13:00:00.000Z",
          events: []
        }
      ],
      "thread-1",
      [
        {
          id: "action-1",
          stepId: "step-1",
          kind: "inspect-file",
          label: "Inspect src/App.tsx",
          status: "pending",
          target: "src/App.tsx"
        }
      ]
    );

    expect(threads[0].agentActions).toHaveLength(1);
    expect(threads[1].agentActions).toBeUndefined();
  });

  it("updates a single agent action status without replacing the queue", () => {
    const threads = updateThreadAgentActionStatus(
      [
        {
          id: "thread-1",
          title: "Agent task",
          prompt: "Agent task",
          status: "running",
          modelId: "openai:gpt-5.5",
          intelligence: "high",
          speed: "balanced",
          createdAt: "2026-05-27T13:00:00.000Z",
          events: [],
          agentActions: [
            {
              id: "action-1",
              stepId: "step-1",
              kind: "inspect-file",
              label: "Inspect src/App.tsx",
              status: "pending",
              target: "src/App.tsx"
            },
            {
              id: "action-2",
              stepId: "step-2",
              kind: "run-command",
              label: "Run npm test",
              status: "pending",
              command: "npm test"
            }
          ]
        }
      ],
      "thread-1",
      "action-2",
      "running"
    );

    expect(threads[0].agentActions?.map((action) => action.status)).toEqual([
      "pending",
      "running"
    ]);
  });

  it("keeps the thread status in sync with running and failed agent actions", () => {
    const baseThread = {
      id: "thread-1",
      title: "Agent task",
      prompt: "Agent task",
      status: "planned" as const,
      modelId: "openai:gpt-5.5",
      intelligence: "high" as const,
      speed: "balanced" as const,
      createdAt: "2026-05-27T13:00:00.000Z",
      events: [],
      agentActions: [
        {
          id: "action-1",
          stepId: "step-1",
          kind: "run-command" as const,
          label: "Run npm test",
          status: "pending" as const,
          command: "npm test"
        }
      ]
    };

    const runningThreads = updateThreadAgentActionStatus(
      [baseThread],
      "thread-1",
      "action-1",
      "running"
    );
    const failedThreads = updateThreadAgentActionStatus(
      runningThreads,
      "thread-1",
      "action-1",
      "failed"
    );

    expect(runningThreads[0].status).toBe("running");
    expect(failedThreads[0].status).toBe("blocked");
  });

  it("marks the thread completed only after every agent action is done", () => {
    const thread = {
      id: "thread-1",
      title: "Agent task",
      prompt: "Agent task",
      status: "running" as const,
      modelId: "openai:gpt-5.5",
      intelligence: "high" as const,
      speed: "balanced" as const,
      createdAt: "2026-05-27T13:00:00.000Z",
      events: [],
      agentActions: [
        {
          id: "action-1",
          stepId: "step-1",
          kind: "run-command" as const,
          label: "Run npm test",
          status: "completed" as const,
          command: "npm test"
        },
        {
          id: "action-2",
          stepId: "step-2",
          kind: "run-command" as const,
          label: "Run npm run build",
          status: "running" as const,
          command: "npm run build"
        }
      ]
    };

    const completedThreads = updateThreadAgentActionStatus(
      [thread],
      "thread-1",
      "action-2",
      "completed"
    );
    const stillRunningThreads = updateThreadAgentActionStatus(
      [{ ...thread, agentActions: thread.agentActions.map((action) => ({ ...action })) }],
      "thread-1",
      "action-1",
      "completed"
    );

    expect(completedThreads[0].status).toBe("completed");
    expect(stillRunningThreads[0].status).toBe("running");
  });

  it("blocks the thread when completed work reaches a manual or commit gate", () => {
    const thread = {
      id: "thread-1",
      title: "Agent task",
      prompt: "Agent task",
      status: "running" as const,
      modelId: "openai:gpt-5.5",
      intelligence: "high" as const,
      speed: "balanced" as const,
      createdAt: "2026-05-27T13:00:00.000Z",
      events: [],
      agentActions: [
        {
          id: "action-1",
          stepId: "step-1",
          kind: "run-command" as const,
          label: "Run npm test",
          status: "running" as const,
          command: "npm test"
        },
        {
          id: "action-2",
          stepId: "step-2",
          kind: "commit" as const,
          label: "Commit changes",
          status: "pending" as const
        }
      ]
    };

    const threads = updateThreadAgentActionStatus(
      [thread],
      "thread-1",
      "action-1",
      "completed"
    );

    expect(threads[0].status).toBe("blocked");
  });

  it("completes the next pending commit action after a Git commit succeeds", () => {
    const threads = completeNextPendingAgentAction(
      [
        {
          id: "thread-1",
          title: "Agent task",
          prompt: "Agent task",
          status: "blocked",
          modelId: "openai:gpt-5.5",
          intelligence: "high",
          speed: "balanced",
          createdAt: "2026-05-27T13:00:00.000Z",
          events: [],
          agentActions: [
            {
              id: "action-1",
              stepId: "step-1",
              kind: "run-command",
              label: "Run npm test",
              status: "completed",
              command: "npm test"
            },
            {
              id: "action-2",
              stepId: "step-2",
              kind: "commit",
              label: "Commit changes",
              status: "pending"
            }
          ]
        }
      ],
      "thread-1",
      "commit"
    );

    expect(threads[0].agentActions?.map((action) => action.status)).toEqual([
      "completed",
      "completed"
    ]);
    expect(threads[0].status).toBe("completed");
  });
});

function createFetchedModel(providerId: string, modelName: string, label: string) {
  return {
    id: `${providerId}:${modelName}`,
    providerId,
    label,
    modelName,
    enabled: false,
    capabilities: {
      reasoning: { type: "none" as const },
      toolCalling: "unknown" as const,
      streaming: "unknown" as const,
      vision: "unknown" as const
    },
    capabilitySource: "provider-api" as const
  };
}
