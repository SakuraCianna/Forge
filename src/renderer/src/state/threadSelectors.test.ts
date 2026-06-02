import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { ForgeModel } from "@shared/modelTypes";
import type { TaskThread } from "./taskThreads";
import {
  createThreadConversation,
  formatAgentCommitMessageSuggestion,
  hasContinuableAgentActions,
  resolveVisionAttachments,
  selectThreadById,
  selectVisibleWorkspaceThreads
} from "./threadSelectors";

const thread: TaskThread = {
  id: "thread-1",
  title: "Task",
  prompt: "Start",
  status: "running",
  modelId: "model-1",
  intelligence: "high",
  speed: "balanced",
  createdAt: "2026-06-02T00:00:00.000Z",
  projectPath: "E:\\CodeHome\\Forge",
  events: [
    {
      id: "user-1",
      kind: "user",
      message: "Follow up",
      createdAt: "2026-06-02T00:00:01.000Z"
    },
    {
      id: "result-1",
      kind: "result",
      message: "Answer",
      createdAt: "2026-06-02T00:00:02.000Z"
    },
    {
      id: "command-1",
      kind: "command",
      message: "npm test",
      createdAt: "2026-06-02T00:00:03.000Z"
    }
  ]
};

describe("thread selectors", () => {
  it("selects active and workspace-visible threads", () => {
    const threads: TaskThread[] = [
      thread,
      { ...thread, id: "thread-2", projectPath: null },
      { ...thread, id: "thread-3", archived: true }
    ];

    expect(selectThreadById(threads, "thread-1")?.id).toBe("thread-1");
    expect(selectVisibleWorkspaceThreads(threads, "E:\\CodeHome\\Forge").map((item) => item.id)).toEqual([
      "thread-1"
    ]);
    expect(selectVisibleWorkspaceThreads(threads, null).map((item) => item.id)).toEqual(["thread-2"]);
  });

  it("creates model conversation turns from user and result events only", () => {
    expect(createThreadConversation(thread)).toEqual([
      { role: "user", content: "Start" },
      { role: "user", content: "Follow up" },
      { role: "assistant", content: "Answer" }
    ]);
  });

  it("keeps image attachments only for vision models", () => {
    const attachment = {
      id: "image-1",
      dataUrl: "data:image/png;base64,abc",
      mediaType: "image/png",
      size: 3
    };
    const visionModel: ForgeModel = {
      id: "model-1",
      providerId: "provider-1",
      label: "Vision",
      modelName: "vision",
      enabled: true,
      capabilities: {
        reasoning: { type: "none" },
        streaming: "unknown",
        toolCalling: "unknown",
        vision: true
      },
      capabilitySource: "manual"
    };

    expect(resolveVisionAttachments(visionModel, [attachment])).toEqual([attachment]);
    expect(resolveVisionAttachments({ ...visionModel, capabilities: { ...visionModel.capabilities, vision: false } }, [
      attachment
    ])).toBeUndefined();
  });

  it("formats commit message suggestions and continuable state", () => {
    const action: AgentAction = {
      id: "action-1",
      stepId: "step-1",
      kind: "commit",
      label: "Commit changes",
      status: "pending",
      target: 'git commit -m "完善 Agent 稳定性"'
    };

    expect(formatAgentCommitMessageSuggestion(action)).toBe("完善 Agent 稳定性");
    expect(hasContinuableAgentActions({ ...thread, agentActions: [action] })).toBe(true);
  });
});
