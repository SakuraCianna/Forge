import { describe, expect, it } from "vitest";
import type {
  AgentAttachmentContext,
  AgentImageAttachment,
  AgentProfileContext
} from "@shared/agentTypes";
import type { ModelSettings } from "@shared/modelTypes";
import { appendThreadFollowUpPrompt, createThreadFromSettings, type TaskThread } from "./taskThreads";

const modelSettings: ModelSettings = {
  language: "en-US",
  intelligence: "high",
  speed: "balanced",
  currentModelId: "model-1",
  providers: [
    {
      id: "provider-1",
      label: "Provider",
      kind: "openai-compatible",
      requiresBaseUrl: true
    }
  ],
  models: [
    {
      id: "model-1",
      providerId: "provider-1",
      label: "Model",
      modelName: "model-1",
      enabled: true,
      capabilities: {
        reasoning: { type: "none" },
        toolCalling: "unknown",
        streaming: "unknown",
        vision: "unknown"
      },
      capabilitySource: "manual"
    }
  ]
};

const agentProfile: AgentProfileContext = {
  id: "build",
  name: "Coding agent",
  description: "Code changes",
  instructions: "Work carefully",
  permissionMode: "auto",
  enabledTools: ["read", "edit", "command", "git"],
  contextBudget: 12000,
  planStepLimit: 6,
  autoRunBatchSize: 3,
  verificationPolicy: "require",
  failureRecoveryPolicy: "auto",
  maxFailureRecoveryAttempts: 2
};

const attachmentContexts: AgentAttachmentContext[] = [
  {
    id: "attachment-1",
    kind: "word",
    name: "brief.docx",
    size: 2048,
    content: "Project notes"
  }
];

describe("task threads", () => {
  it("stores an immutable agent profile snapshot when creating a thread", () => {
    const result = createThreadFromSettings(modelSettings, "Implement a feature", {
      agentProfile,
      attachmentContexts,
      createId: () => "thread-1",
      now: () => "2026-06-01T00:00:00.000Z"
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    agentProfile.enabledTools.length = 0;
    agentProfile.failureRecoveryPolicy = "manual";
    agentProfile.autoRunBatchSize = 1;
    agentProfile.maxFailureRecoveryAttempts = 0;
    attachmentContexts[0]!.content = "Mutated";

    expect(result.thread.agentProfile?.enabledTools).toEqual([
      "read",
      "edit",
      "command",
      "git"
    ]);
    expect(result.thread.agentProfile?.failureRecoveryPolicy).toBe("auto");
    expect(result.thread.agentProfile?.autoRunBatchSize).toBe(3);
    expect(result.thread.agentProfile?.maxFailureRecoveryAttempts).toBe(2);
    expect(result.thread.attachmentContexts?.[0].content).toBe("Project notes");
  });

  it("merges follow-up attachments into the existing thread snapshot", () => {
    const existingAttachment: AgentImageAttachment = {
      id: "image-1",
      mediaType: "image/png",
      dataUrl: "data:image/png;base64,AA=="
    };
    const incomingAttachment: AgentImageAttachment = {
      id: "image-2",
      mediaType: "image/png",
      dataUrl: "data:image/png;base64,BB=="
    };
    const thread = createThread({
      attachments: [existingAttachment],
      attachmentContexts: [
        {
          id: "context-1",
          kind: "image",
          name: "first.png",
          size: 128,
          content: "First image text"
        }
      ]
    });

    const [updatedThread] = appendThreadFollowUpPrompt([thread], thread.id, {
      id: "follow-up-1",
      message: "Use the new brief too",
      createdAt: "2026-06-02T00:00:00.000Z",
      attachments: [incomingAttachment],
      attachmentContexts: [
        {
          id: "context-2",
          kind: "word",
          name: "brief.docx",
          size: 2048,
          content: "New brief text"
        }
      ]
    });

    expect(updatedThread?.attachments?.map((attachment) => attachment.id)).toEqual([
      "image-1",
      "image-2"
    ]);
    expect(updatedThread?.attachmentContexts?.map((context) => context.content)).toEqual([
      "First image text",
      "New brief text"
    ]);
    expect(updatedThread?.events.at(-1)?.message).toBe("Use the new brief too");
  });
});

function createThread(overrides: Partial<TaskThread> = {}): TaskThread {
  return {
    id: "thread-1",
    title: "Thread",
    prompt: "Original task",
    status: "completed",
    modelId: "model-1",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2026-06-01T00:00:00.000Z",
    events: [],
    ...overrides
  };
}
