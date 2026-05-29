import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import type { AgentAction } from "@shared/agentExecutionPlan";
import { getEnabledModels } from "./modelSettings";

export type TaskThreadStatus = "planned" | "running" | "blocked" | "completed";

export type TaskThreadEventKind = "plan" | "command" | "file" | "error" | "result";

export type TaskThreadEvent = {
  id: string;
  kind: TaskThreadEventKind;
  message: string;
  createdAt: string;
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
