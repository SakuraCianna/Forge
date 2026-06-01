// 本文件说明: 定义 Agent 请求, 结果, 记忆和配置上下文类型
import type { ForgeModel, ForgeProvider, IntelligenceLevel, SpeedMode } from "./modelTypes.js";
import type { ProjectScanResult } from "./projectTypes.js";
import type { TokenUsage } from "./usageTypes.js";

export type AgentMemoryContext = {
  id: string;
  scope: "global" | "project";
  content: string;
  projectPath?: string | null;
};

export type AgentProfileContext = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  permissionMode: "auto" | "full";
  enabledTools: string[];
  contextBudget: number;
  planStepLimit: number;
  verificationPolicy: "suggest" | "require" | "skip";
};

export type AgentWorkMode = "code" | "daily";
export type AgentRuntime = "windows-native" | "wsl";

export type GenerateAgentPlanRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  agentProfile?: AgentProfileContext;
  memories?: AgentMemoryContext[];
  personalization?: string;
  speed: SpeedMode;
  workMode?: AgentWorkMode;
  agentRuntime?: AgentRuntime;
  taskPrompt: string;
  projectScan: ProjectScanResult;
};

export type GenerateAgentFileChangeRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  agentProfile?: AgentProfileContext;
  memories?: AgentMemoryContext[];
  personalization?: string;
  projectScan?: ProjectScanResult | null;
  speed: SpeedMode;
  workMode?: AgentWorkMode;
  agentRuntime?: AgentRuntime;
  taskPrompt: string;
  relativePath: string;
  currentContent: string;
};

export type GenerateAgentAskRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  agentProfile?: AgentProfileContext;
  memories?: AgentMemoryContext[];
  personalization?: string;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  projectScan?: ProjectScanResult | null;
  speed: SpeedMode;
  workMode?: AgentWorkMode;
  agentRuntime?: AgentRuntime;
  prompt: string;
};

export type AgentPlanStepKind = "inspect" | "edit" | "verify" | "commit" | "other";

export type AgentPlanStep = {
  id: string;
  title: string;
  description: string;
  kind: AgentPlanStepKind;
  status: "pending";
  target?: string;
};

export type AgentPlanResult = {
  providerId: string;
  modelId: string;
  text: string;
  steps: AgentPlanStep[];
  createdAt: string;
  usage?: TokenUsage;
};

export type AgentPlanStreamChunk =
  | { requestId: string; type: "delta"; delta: string }
  | { requestId: string; type: "done"; result: AgentPlanResult }
  | { requestId: string; type: "error"; message: string };

export type AgentFileChangeResult = {
  providerId: string;
  modelId: string;
  relativePath: string;
  nextContent: string;
  createdAt: string;
  usage?: TokenUsage;
};

export type AgentAskResult = {
  providerId: string;
  modelId: string;
  text: string;
  createdAt: string;
  usage?: TokenUsage;
};

export type AgentAskStreamChunk =
  | { requestId: string; type: "delta"; delta: string }
  | { requestId: string; type: "done"; result: AgentAskResult }
  | { requestId: string; type: "error"; message: string };
