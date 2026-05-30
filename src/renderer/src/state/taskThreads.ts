import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { CommandOutputChunk } from "@shared/commandTypes";
import { getEnabledModels } from "./modelSettings";

export type TaskThreadStatus = "planned" | "running" | "blocked" | "completed";

export type TaskThreadEventKind = "user" | "plan" | "command" | "file" | "error" | "result";

export type CommandRunResult = {
  runId?: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled?: boolean;
};

export type CommandRunState = {
  runId?: string;
  command: string;
  status: "running";
  stdout?: string;
  stderr?: string;
};

export type TaskThreadEvent = {
  id: string;
  kind: TaskThreadEventKind;
  message: string;
  createdAt: string;
  completedAt?: string;
  commandRun?: CommandRunState;
  commandResult?: CommandRunResult;
};

export type TaskThread = {
  id: string;
  title: string;
  prompt: string;
  status: TaskThreadStatus;
  modelId: string;
  intelligence: IntelligenceLevel;
  speed: SpeedMode;
  createdAt: string;
  pinned?: boolean;
  archived?: boolean;
  mode?: "ask" | "project";
  projectPath?: string | null;
  agentActions?: AgentAction[];
  events: TaskThreadEvent[];
};

type ThreadDeps = {
  createId: () => string;
  now: () => string;
};

export type CreateThreadResult =
  | { ok: true; thread: TaskThread }
  | { ok: false; reason: "empty-prompt" | "missing-model" };

export function createThreadFromSettings(
  settings: ModelSettings,
  prompt: string,
  deps: ThreadDeps = {
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString()
  }
): CreateThreadResult {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    return { ok: false, reason: "empty-prompt" };
  }

  const enabledModels = getEnabledModels(settings);
  const selectedModel =
    enabledModels.find((model) => model.id === settings.currentModelId) ?? enabledModels[0] ?? null;

  if (!selectedModel) {
    return { ok: false, reason: "missing-model" };
  }

  const id = deps.createId();
  const createdAt = deps.now();

  return {
    ok: true,
    thread: {
      id,
      title: normalizedPrompt.slice(0, 32),
      prompt: normalizedPrompt,
      status: "planned",
      modelId: selectedModel.id,
      intelligence: settings.intelligence,
      speed: settings.speed,
      createdAt,
      events: [
        {
          id: `${id}-event-1`,
          kind: "plan",
          message: "任务已创建, 等待 Forge 生成执行计划",
          createdAt
        }
      ]
    }
  };
}

export function appendThreadEvents(
  threads: TaskThread[],
  threadId: string,
  events: TaskThreadEvent[],
  status?: TaskThreadStatus
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          status: status ?? thread.status,
          events: [...thread.events, ...events]
        }
      : thread
  );
}

export function appendThreadFollowUpPrompt(
  threads: TaskThread[],
  threadId: string,
  event: { id: string; message: string; createdAt: string }
): TaskThread[] {
  return appendThreadEvents(
    threads,
    threadId,
    [
      {
        id: event.id,
        kind: "user",
        message: event.message,
        createdAt: event.createdAt
      }
    ],
    "running"
  );
}

export function cancelThread(
  threads: TaskThread[],
  threadId: string,
  event: { createdAt: string; message: string }
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          status: "blocked",
          events: [
            ...thread.events,
            {
              id: `${threadId}-cancelled-${event.createdAt}`,
              kind: "error",
              message: event.message,
              createdAt: event.createdAt
            }
          ]
        }
      : thread
  );
}

export function appendThreadResultDelta(
  threads: TaskThread[],
  threadId: string,
  delta: {
    eventId: string;
    createdAt: string;
    completedAt?: string;
    delta: string;
    done: boolean;
    finalText?: string;
  }
): TaskThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }

    const existingEvent = thread.events.find((event) => event.id === delta.eventId);
    const events = existingEvent
      ? thread.events.map((event) =>
          event.id === delta.eventId
            ? {
                ...event,
                message: delta.finalText ?? `${event.message}${delta.delta}`,
                completedAt: delta.completedAt ?? event.completedAt
              }
            : event
        )
      : [
          ...thread.events,
          {
            id: delta.eventId,
            kind: "result" as const,
            message: delta.finalText ?? delta.delta,
            createdAt: delta.createdAt,
            completedAt: delta.completedAt
          }
        ];

    return {
      ...thread,
      status: delta.done ? "completed" : "running",
      events
    };
  });
}

export function appendCommandRunOutput(
  threads: TaskThread[],
  output: CommandOutputChunk
): TaskThread[] {
  return threads.map((thread) => {
    let changed = false;
    const events = thread.events.map((event) => {
      if (!event.commandRun || !commandRunMatchesOutput(event.commandRun, output)) {
        return event;
      }

      changed = true;
      const currentOutput = event.commandRun[output.stream] ?? "";

      return {
        ...event,
        commandRun: {
          ...event.commandRun,
          [output.stream]: limitLiveCommandOutput(`${currentOutput}${output.chunk}`)
        }
      };
    });

    return changed ? { ...thread, events } : thread;
  });
}

export function attachThreadAgentActions(
  threads: TaskThread[],
  threadId: string,
  actions: AgentAction[]
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          agentActions: actions
        }
      : thread
  );
}

export function updateThreadAgentActionStatus(
  threads: TaskThread[],
  threadId: string,
  actionId: string,
  status: AgentAction["status"]
): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? updateThreadActionStatus(thread, actionId, status) : thread
  );
}

export function completeNextPendingAgentAction(
  threads: TaskThread[],
  threadId: string,
  kind: AgentAction["kind"]
): TaskThread[] {
  return threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }

    const action = thread.agentActions?.find(
      (candidate) => candidate.kind === kind && candidate.status === "pending"
    );

    return action ? updateThreadActionStatus(thread, action.id, "completed") : thread;
  });
}

function updateThreadActionStatus(
  thread: TaskThread,
  actionId: string,
  status: AgentAction["status"]
): TaskThread {
  const agentActions = thread.agentActions?.map((action) =>
    action.id === actionId ? { ...action, status } : action
  );

  return {
    ...thread,
    status: getThreadStatusForAgentActions(agentActions, thread.status),
    agentActions
  };
}

function getThreadStatusForAgentActions(
  actions: AgentAction[] | undefined,
  currentStatus: TaskThreadStatus
): TaskThreadStatus {
  if (!actions || actions.length === 0) {
    return currentStatus;
  }

  if (actions.some((action) => action.status === "failed")) {
    return "blocked";
  }

  if (actions.some((action) => action.status === "running")) {
    return "running";
  }

  if (actions.every((action) => action.status === "completed" || action.status === "skipped")) {
    return "completed";
  }

  const nextIncompleteAction = actions.find(
    (action) => action.status !== "completed" && action.status !== "skipped"
  );

  if (
    nextIncompleteAction?.status === "pending" &&
    (nextIncompleteAction.kind === "manual" || nextIncompleteAction.kind === "commit")
  ) {
    return "blocked";
  }

  return currentStatus;
}

export function toggleThreadPinned(threads: TaskThread[], threadId: string): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, pinned: !thread.pinned } : thread
  );
}

export function archiveThread(threads: TaskThread[], threadId: string): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, archived: true, pinned: false } : thread
  );
}

export function restoreThread(threads: TaskThread[], threadId: string): TaskThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, archived: false } : thread
  );
}

export function archiveAllThreads(threads: TaskThread[]): TaskThread[] {
  return threads.map((thread) => ({ ...thread, archived: true, pinned: false }));
}

export function archiveProjectThreads(threads: TaskThread[], projectPath: string): TaskThread[] {
  return threads.map((thread) =>
    thread.projectPath === projectPath ? { ...thread, archived: true, pinned: false } : thread
  );
}

const maxLiveCommandOutputLength = 12000;

function commandRunMatchesOutput(
  commandRun: CommandRunState,
  output: CommandOutputChunk
): boolean {
  if (commandRun.runId && output.runId) {
    return commandRun.runId === output.runId;
  }

  return !commandRun.runId && !output.runId && commandRun.command === output.command;
}

function limitLiveCommandOutput(value: string): string {
  if (value.length <= maxLiveCommandOutputLength) {
    return value;
  }

  return value.slice(value.length - maxLiveCommandOutputLength);
}
