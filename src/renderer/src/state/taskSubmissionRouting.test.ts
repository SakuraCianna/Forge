import { describe, expect, it } from "vitest";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { ForgeModel, ForgeProvider, ModelSettings } from "@shared/modelTypes";
import type { TaskThread } from "./taskThreads";
import { createTaskSubmissionRoute } from "./taskSubmissionRouting";

describe("createTaskSubmissionRoute", () => {
  it("routes direct answer prompts to a follow-up when a non-running thread is selected", () => {
    const activeThread = createThread({ id: "active-thread", status: "completed" });
    const route = createTaskSubmissionRoute({
      activeThread,
      currentProjectPath: "E:/CodeHome/Forge",
      hasProjectScan: true,
      prompt: "What did we do?",
      settings: createSettings(),
      ...deterministicDeps()
    });

    expect(route.kind).toBe("ask-follow-up");
    expect(route.kind === "ask-follow-up" ? route.thread : null).toBe(activeThread);
    expect(route.kind === "ask-follow-up" ? route.draftThread.modelId : null).toBe("model-1");
  });

  it("routes direct answer prompts to a new running ask thread when no resumable thread exists", () => {
    const route = createTaskSubmissionRoute({
      activeThread: createThread({ status: "running" }),
      currentProjectPath: null,
      hasProjectScan: false,
      prompt: "Explain this code?",
      settings: createSettings(),
      ...deterministicDeps()
    });

    expect(route).toMatchObject({
      kind: "ask-new",
      thread: {
        id: "thread-1",
        prompt: "Explain this code?",
        projectPath: null,
        status: "running"
      }
    });
  });

  it("requires a project before routing project action prompts", () => {
    const route = createTaskSubmissionRoute({
      activeThread: null,
      currentProjectPath: null,
      hasProjectScan: false,
      prompt: "Implement file icons",
      settings: createSettings(),
      ...deterministicDeps()
    });

    expect(route).toEqual({ kind: "project-required" });
  });

  it("waits for project scanning before creating project routes", () => {
    const route = createTaskSubmissionRoute({
      activeThread: null,
      currentProjectPath: "E:/CodeHome/Forge",
      hasProjectScan: false,
      prompt: "Implement file icons",
      settings: createSettings(),
      ...deterministicDeps()
    });

    expect(route).toEqual({ kind: "project-scanning" });
  });

  it("routes project prompts to a follow-up only when the selected thread is in the same project", () => {
    const activeThread = createThread({
      id: "project-thread",
      projectPath: "E:/CodeHome/Forge",
      status: "completed"
    });
    const route = createTaskSubmissionRoute({
      activeThread,
      currentProjectPath: "E:/CodeHome/Forge",
      hasProjectScan: true,
      prompt: "Implement file icons",
      settings: createSettings(),
      ...deterministicDeps()
    });

    expect(route.kind).toBe("project-follow-up");
    expect(route.kind === "project-follow-up" ? route.thread : null).toBe(activeThread);
  });

  it("routes project prompts to a new running project thread when the selected thread is unrelated", () => {
    const route = createTaskSubmissionRoute({
      activeThread: createThread({ projectPath: "E:/CodeHome/Other", status: "completed" }),
      currentProjectPath: "E:/CodeHome/Forge",
      hasProjectScan: true,
      prompt: "Implement file icons",
      settings: createSettings(),
      ...deterministicDeps()
    });

    expect(route).toMatchObject({
      kind: "project-new",
      thread: {
        id: "thread-1",
        projectPath: "E:/CodeHome/Forge",
        status: "running"
      }
    });
  });

  it("keeps agent profile and attachments on newly drafted threads", () => {
    const agentProfile: AgentProfileContext = {
      id: "profile-1",
      name: "Builder",
      description: "Builds code changes",
      instructions: "Prefer careful changes",
      permissionMode: "auto",
      enabledTools: ["inspect", "edit"],
      contextBudget: 12000,
      planStepLimit: 6,
      autoRunBatchSize: 3,
      verificationPolicy: "require",
      failureRecoveryPolicy: "auto",
      maxFailureRecoveryAttempts: 2
    };
    const route = createTaskSubmissionRoute({
      activeThread: null,
      agentProfile,
      attachments: [
        {
          id: "image-1",
          mediaType: "image/png",
          dataUrl: "data:image/png;base64,AA=="
        }
      ],
      currentProjectPath: null,
      hasProjectScan: false,
      prompt: "What is in this image?",
      settings: createSettings(),
      ...deterministicDeps()
    });

    expect(route.kind === "ask-new" ? route.thread.agentProfile : null).toEqual(agentProfile);
    expect(route.kind === "ask-new" ? route.thread.attachments?.[0].id : null).toBe("image-1");
  });
});

function deterministicDeps(): { createId: () => string; now: () => string } {
  return {
    createId: () => "thread-1",
    now: () => "2026-06-02T00:00:00.000Z"
  };
}

function createSettings(): ModelSettings {
  const provider: ForgeProvider = {
    id: "provider-1",
    label: "Provider",
    kind: "openai-compatible",
    requiresBaseUrl: false
  };
  const model: ForgeModel = {
    id: "model-1",
    providerId: provider.id,
    label: "Model",
    modelName: "model",
    enabled: true,
    capabilities: {
      reasoning: { type: "none" },
      toolCalling: true,
      streaming: true,
      vision: true
    },
    capabilitySource: "manual"
  };

  return {
    language: "zh-CN",
    intelligence: "medium",
    speed: "balanced",
    currentModelId: model.id,
    providers: [provider],
    models: [model]
  };
}

function createThread(overrides: Partial<TaskThread> = {}): TaskThread {
  return {
    id: "thread-active",
    title: "Thread",
    prompt: "Original task",
    status: "completed",
    modelId: "model-1",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2026-06-02T00:00:00.000Z",
    events: [],
    ...overrides
  };
}
