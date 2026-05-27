import { describe, expect, it } from "vitest";
import {
  createDefaultModelSettings,
  setCurrentModel,
  updateModelEnabled
} from "./modelSettings";
import { appendThreadEvents, createThreadFromSettings } from "./taskThreads";

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

  it("requires an enabled model before creating a task thread", () => {
    const settings = createDefaultModelSettings();

    expect(createThreadFromSettings(settings, "修复登录错误", deps)).toEqual({
      ok: false,
      reason: "missing-model"
    });
  });

  it("creates a task thread with the selected model, intelligence, speed, and initial event", () => {
    let settings = createDefaultModelSettings();
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
});
