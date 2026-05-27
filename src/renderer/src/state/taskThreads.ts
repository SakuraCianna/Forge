import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
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
