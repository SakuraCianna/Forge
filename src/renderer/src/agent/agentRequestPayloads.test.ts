import { describe, expect, it } from "vitest";
import type { AgentAttachmentContext, AgentImageAttachment } from "@shared/agentTypes";
import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { AgentMemoryEntry } from "@/state/agentMemory";
import type { PersonalizationSettings } from "@/state/personalization";
import {
  createAgentAskRequestPayload,
  createAgentFileChangeRequestPayload,
  createAgentPlanRequestPayload,
  type AgentRequestRuntimeContext
} from "./agentRequestPayloads";

const provider: ForgeProvider = {
  id: "provider-1",
  label: "Provider",
  kind: "openai-compatible",
  requiresBaseUrl: false
};

const visionModel: ForgeModel = {
  id: "vision-model",
  providerId: provider.id,
  label: "Vision Model",
  modelName: "vision-model",
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
  label: "Text Model",
  modelName: "text-model",
  capabilities: {
    ...visionModel.capabilities,
    vision: false
  }
};

const personalization: PersonalizationSettings = {
  replyTone: "friendly",
  customInstructions: "Prefer concise implementation notes.",
  contextSuggestionsEnabled: true
};

const projectScan: ProjectScanResult = {
  rootPath: "E:/CodeHome/Forge",
  files: [],
  truncated: false
};

const imageAttachment: AgentImageAttachment = {
  id: "image-1",
  mediaType: "image/png",
  dataUrl: "data:image/png;base64,AA==",
  name: "screen.png",
  size: 128
};

const attachmentContext: AgentAttachmentContext = {
  id: "context-1",
  kind: "word",
  name: "brief.docx",
  size: 2048,
  content: "Attachment-only product requirement"
};

const memories: AgentMemoryEntry[] = [
  createMemory("memory-clean", "This project prefers clean task routing."),
  createMemory("memory-attachment", "Attachment-only product requirement")
];

describe("agent request payloads", () => {
  it("keeps memory selection on the clean task while injecting attachment context into plan requests", () => {
    const { request, memories: selectedMemories } = createAgentPlanRequestPayload({
      runtime: createRuntime(visionModel),
      agentMemories: memories,
      taskPrompt: "clean task routing",
      attachmentContexts: [attachmentContext],
      attachments: [imageAttachment],
      projectScan
    });

    expect(selectedMemories[0]?.id).toBe("memory-clean");
    expect(request.taskPrompt).toContain("clean task routing");
    expect(request.taskPrompt).toContain("Attachment-only product requirement");
    expect(request.attachments).toEqual([imageAttachment]);
    expect(request.personalization).toContain("Prefer concise implementation notes.");
  });

  it("drops image data for non-vision ask models but keeps local attachment text", () => {
    const { request } = createAgentAskRequestPayload({
      runtime: createRuntime(textModel),
      agentMemories: [],
      prompt: "Summarize this",
      attachmentContexts: [attachmentContext],
      attachments: [imageAttachment],
      projectScan,
      conversation: [{ role: "user", content: "Earlier question" }]
    });

    expect(request.prompt).toContain("Summarize this");
    expect(request.prompt).toContain("Attachment-only product requirement");
    expect(request.attachments).toBeUndefined();
    expect(request.conversation).toEqual([{ role: "user", content: "Earlier question" }]);
  });

  it("builds file-change requests with project-scoped memories and attachment context", () => {
    const { request, memories: selectedMemories } = createAgentFileChangeRequestPayload({
      runtime: createRuntime(visionModel),
      agentMemories: memories,
      memoryQuery: "clean task routing frontend/src/App.tsx",
      taskPrompt: "Rewrite only the target file",
      attachmentContexts: [attachmentContext],
      attachments: [imageAttachment],
      projectRoot: projectScan.rootPath,
      projectScan,
      relativePath: "frontend/src/App.tsx",
      currentContent: "export function App() {}"
    });

    expect(selectedMemories[0]?.id).toBe("memory-clean");
    expect(request.relativePath).toBe("frontend/src/App.tsx");
    expect(request.currentContent).toBe("export function App() {}");
    expect(request.taskPrompt).toContain("Rewrite only the target file");
    expect(request.taskPrompt).toContain("Attachment-only product requirement");
    expect(request.attachments).toEqual([imageAttachment]);
  });
});

function createRuntime(model: ForgeModel): AgentRequestRuntimeContext {
  return {
    provider,
    model,
    intelligence: "medium",
    personalization,
    speed: "balanced",
    workMode: "code",
    agentRuntime: "windows-native",
    language: "en-US"
  };
}

function createMemory(id: string, content: string): AgentMemoryEntry {
  return {
    id,
    scope: "global",
    projectPath: null,
    content,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: id === "memory-clean" ? "2026-06-02T00:00:01.000Z" : "2026-06-02T00:00:00.000Z"
  };
}
