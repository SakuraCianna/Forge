import { describe, expect, it } from "vitest";
import type { AgentImageAttachment } from "@shared/agentTypes";
import type { ForgeModel, ForgeProvider, ModelSettings } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { TaskThread } from "./taskThreads";
import { createTaskSubmissionExecution } from "./taskSubmissionExecution";
import type { TaskSubmissionRoute } from "./taskSubmissionRouting";

const provider: ForgeProvider = {
  id: "provider-1",
  label: "Provider",
  kind: "openai-compatible",
  requiresBaseUrl: false
};

const visionModel: ForgeModel = {
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

const textModel: ForgeModel = {
  ...visionModel,
  id: "text-model",
  providerId: provider.id,
  label: "Text model",
  modelName: "text-model",
  capabilities: {
    ...visionModel.capabilities,
    vision: false
  }
};

const projectScan: ProjectScanResult = {
  rootPath: "E:/CodeHome/Forge",
  files: [],
  truncated: false
};

const imageAttachment: AgentImageAttachment = {
  id: "image-1",
  mediaType: "image/png",
  dataUrl: "data:image/png;base64,AA=="
};

describe("createTaskSubmissionExecution", () => {
  it("turns ask follow-up routes into thread mutation and ask execution", () => {
    const thread = createThread({
      id: "thread-active",
      projectPath: projectScan.rootPath,
      events: [{ id: "result-1", kind: "result", message: "Done", createdAt: now() }]
    });
    const draftThread = createThread({
      id: "thread-draft",
      attachments: [imageAttachment],
      attachmentContexts: [
        {
          id: "context-1",
          kind: "image",
          name: "screen.png",
          size: 128,
          content: "OCR text"
        }
      ]
    });
    const route: TaskSubmissionRoute = { kind: "ask-follow-up", draftThread, thread };
    const execution = createTaskSubmissionExecution({
      route,
      prompt: "What changed?",
      settings: createSettings(),
      submittedAttachments: [imageAttachment],
      currentProjectPath: projectScan.rootPath,
      projectScan,
      now
    });

    expect(execution.kind).toBe("run");

    if (execution.kind !== "run") {
      return;
    }

    expect(execution.threadMutation).toMatchObject({
      kind: "append-follow-up",
      threadId: "thread-active",
      event: {
        id: `thread-active-user-${now()}`,
        message: "What changed?"
      }
    });
    expect(execution.remember).toEqual({
      threadId: "thread-active",
      prompt: "What changed?",
      projectPath: projectScan.rootPath
    });
    expect(execution.modelExecution).toMatchObject({
      kind: "ask",
      threadId: "thread-active",
      prompt: "What changed?",
      model: visionModel,
      provider,
      attachments: [imageAttachment],
      attachmentContexts: draftThread.attachmentContexts,
      projectScan
    });
    expect(
      execution.modelExecution.kind === "ask"
        ? execution.modelExecution.conversation?.map((turn) => turn.role)
        : []
    ).toEqual(["user", "assistant"]);
  });

  it("turns new project routes into selected thread insertion and plan execution", () => {
    const thread = createThread({
      id: "thread-new",
      prompt: "Implement agent stability",
      projectPath: projectScan.rootPath,
      attachments: [imageAttachment]
    });
    const route: TaskSubmissionRoute = { kind: "project-new", thread };
    const execution = createTaskSubmissionExecution({
      route,
      prompt: thread.prompt,
      settings: createSettings(),
      currentProjectPath: projectScan.rootPath,
      projectScan,
      now
    });

    expect(execution.kind).toBe("run");

    if (execution.kind !== "run") {
      return;
    }

    expect(execution.threadMutation).toEqual({
      kind: "prepend-thread",
      thread,
      selectThread: true
    });
    expect(execution.modelExecution).toMatchObject({
      kind: "plan",
      threadId: "thread-new",
      taskPrompt: "Implement agent stability",
      model: visionModel,
      provider,
      attachments: [imageAttachment],
      projectScan
    });
  });

  it("keeps thread mutation but returns missing-model execution when provider is gone", () => {
    const thread = createThread({ id: "thread-new", modelId: "text-model" });
    const route: TaskSubmissionRoute = { kind: "ask-new", thread };
    const execution = createTaskSubmissionExecution({
      route,
      prompt: "Explain",
      settings: createSettings({ providers: [] }),
      submittedAttachments: [imageAttachment],
      currentProjectPath: null,
      projectScan: null,
      now
    });

    expect(execution.kind).toBe("run");

    if (execution.kind !== "run") {
      return;
    }

    expect(execution.threadMutation.kind).toBe("prepend-thread");
    expect(execution.modelExecution).toEqual({
      kind: "missing-model",
      threadId: "thread-new"
    });
  });

  it("keeps project routes waiting when the scan disappeared before execution", () => {
    const thread = createThread({
      id: "thread-project",
      projectPath: projectScan.rootPath
    });
    const route: TaskSubmissionRoute = { kind: "project-follow-up", draftThread: thread, thread };
    const execution = createTaskSubmissionExecution({
      route,
      prompt: "Continue project work",
      settings: createSettings(),
      currentProjectPath: projectScan.rootPath,
      projectScan: null,
      now
    });

    expect(execution).toEqual({ kind: "notice", reason: "project-scanning" });
  });

  it("drops image attachments for text-only ask executions", () => {
    const thread = createThread({ id: "thread-new", modelId: "text-model" });
    const route: TaskSubmissionRoute = { kind: "ask-new", thread };
    const execution = createTaskSubmissionExecution({
      route,
      prompt: "Explain image OCR",
      settings: createSettings({ models: [visionModel, textModel] }),
      submittedAttachments: [imageAttachment],
      currentProjectPath: null,
      projectScan: null,
      now
    });

    expect(execution.kind).toBe("run");

    if (execution.kind !== "run" || execution.modelExecution.kind !== "ask") {
      return;
    }

    expect(execution.modelExecution.attachments).toBeUndefined();
  });
});

function createSettings(
  overrides: Partial<Pick<ModelSettings, "models" | "providers">> = {}
): ModelSettings {
  return {
    language: "zh-CN",
    intelligence: "medium",
    speed: "balanced",
    currentModelId: "model-1",
    providers: [provider],
    models: [visionModel],
    ...overrides
  };
}

function createThread(overrides: Partial<TaskThread> = {}): TaskThread {
  return {
    id: "thread-1",
    title: "Thread",
    prompt: "Original task",
    status: "completed",
    modelId: "model-1",
    intelligence: "medium",
    speed: "balanced",
    createdAt: now(),
    events: [],
    ...overrides
  };
}

function now(): string {
  return "2026-06-03T00:00:00.000Z";
}
