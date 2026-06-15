// 本文件说明: 集中组装发给模型服务商的 Agent 请求载荷, 让 App.tsx 只负责 UI 副作用和流式状态。
import type {
  AgentAttachmentContext,
  AgentImageAttachment,
  AgentProfileContext,
  AgentRuntime,
  AgentWorkMode,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "@shared/agentTypes";
import type {
  ForgeModel,
  ForgeProvider,
  IntelligenceLevel,
  Language,
  SpeedMode
} from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import {
  selectRelevantAgentMemoriesForProject,
  type AgentMemoryEntry
} from "@/state/agentMemory";
import { appendAttachmentContextsToPrompt } from "@/state/composerAttachments";
import {
  createPersonalizationPrompt,
  type PersonalizationSettings
} from "@/state/personalization";
import type { ExtensionRegistrySnapshot } from "@shared/extensionTypes";
import { formatExtensionActionSchemaForPrompt } from "@/state/extensions";
import { resolveVisionAttachments } from "@/state/threadSelectors";
import { formatBuiltInToolCatalogForPrompt } from "@shared/builtInToolPromptContext";

export type AgentRequestRuntimeContext = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  agentProfile?: AgentProfileContext;
  personalization: PersonalizationSettings;
  speed: SpeedMode;
  workMode: AgentWorkMode;
  agentRuntime: AgentRuntime;
  language: Language;
  extensions: ExtensionRegistrySnapshot;
};

export type AgentRequestPayload<TRequest> = {
  request: TRequest;
  memories: AgentMemoryEntry[];
};

export function createAgentPlanRequestPayload({
  runtime,
  agentMemories,
  taskPrompt,
  attachmentContexts,
  attachments,
  projectScan
}: {
  runtime: AgentRequestRuntimeContext;
  agentMemories: AgentMemoryEntry[];
  taskPrompt: string;
  attachmentContexts?: AgentAttachmentContext[];
  attachments?: AgentImageAttachment[];
  projectScan: ProjectScanResult;
}): AgentRequestPayload<GenerateAgentPlanRequest> {
  const memories = selectRelevantAgentMemoriesForProject({
    agentMemories,
    projectScan,
    query: taskPrompt
  });

  return {
    memories,
    request: {
      ...createCommonAgentRequestFields(runtime, attachments),
      memories,
      // 规划记忆检索使用原始任务, 只有模型请求体追加附件上下文。
      taskPrompt: appendAttachmentContextsToPrompt(
        taskPrompt,
        attachmentContexts,
        runtime.language
      ),
      projectScan
    }
  };
}

export function createAgentAskRequestPayload({
  runtime,
  agentMemories,
  prompt,
  attachmentContexts,
  attachments,
  projectScan,
  conversation
}: {
  runtime: AgentRequestRuntimeContext;
  agentMemories: AgentMemoryEntry[];
  prompt: string;
  attachmentContexts?: AgentAttachmentContext[];
  attachments?: AgentImageAttachment[];
  projectScan?: ProjectScanResult | null;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
}): AgentRequestPayload<GenerateAgentAskRequest> {
  const memories = selectRelevantAgentMemoriesForProject({
    agentMemories,
    projectScan,
    query: prompt
  });

  return {
    memories,
    request: {
      ...createCommonAgentRequestFields(runtime, attachments),
      memories,
      conversation,
      projectScan,
      prompt: appendAttachmentContextsToPrompt(prompt, attachmentContexts, runtime.language)
    }
  };
}

export function createAgentFileChangeRequestPayload({
  runtime,
  agentMemories,
  memoryQuery,
  taskPrompt,
  attachmentContexts,
  attachments,
  projectRoot,
  projectScan,
  relativePath,
  currentContent
}: {
  runtime: AgentRequestRuntimeContext;
  agentMemories: AgentMemoryEntry[];
  memoryQuery: string;
  taskPrompt: string;
  attachmentContexts?: AgentAttachmentContext[];
  attachments?: AgentImageAttachment[];
  projectRoot: string;
  projectScan?: ProjectScanResult | null;
  relativePath: string;
  currentContent: string;
}): AgentRequestPayload<GenerateAgentFileChangeRequest> {
  const memories = selectRelevantAgentMemoriesForProject({
    agentMemories,
    projectPath: projectRoot,
    projectScan,
    query: memoryQuery
  });

  return {
    memories,
    request: {
      ...createCommonAgentRequestFields(runtime, attachments),
      memories,
      projectScan,
      taskPrompt: appendAttachmentContextsToPrompt(
        taskPrompt,
        attachmentContexts,
        runtime.language
      ),
      relativePath,
      currentContent
    }
  };
}

function createCommonAgentRequestFields(
  runtime: AgentRequestRuntimeContext,
  attachments: AgentImageAttachment[] | undefined
): Pick<
  GenerateAgentPlanRequest,
  | "provider"
  | "model"
  | "intelligence"
  | "agentProfile"
  | "personalization"
  | "speed"
  | "workMode"
  | "agentRuntime"
  | "builtInToolContext"
  | "extensionContext"
  | "attachments"
> {
  return {
    provider: runtime.provider,
    model: runtime.model,
    intelligence: runtime.intelligence,
    agentProfile: runtime.agentProfile,
    personalization: createPersonalizationPrompt(runtime.personalization),
    speed: runtime.speed,
    workMode: runtime.workMode,
    agentRuntime: runtime.agentRuntime,
    builtInToolContext: formatBuiltInToolCatalogForPrompt(),
    extensionContext: formatExtensionActionSchemaForPrompt(runtime.extensions),
    // 视觉附件由统一出口过滤, 避免非视觉模型收到 data URL 造成无效请求或额外 token 开销。
    attachments: resolveVisionAttachments(runtime.model, attachments)
  };
}
