import type { ForgeModel, ForgeProvider, IntelligenceLevel, SpeedMode } from "./modelTypes.js";
import type { ProjectScanResult } from "./projectTypes.js";
import type { TokenUsage } from "./usageTypes.js";

export type AgentMemoryContext = {
  id: string;
  scope: "global" | "project";
  content: string;
  projectPath?: string | null;
};

export type GenerateAgentPlanRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  memories?: AgentMemoryContext[];
  personalization?: string;
  speed: SpeedMode;
  taskPrompt: string;
  projectScan: ProjectScanResult;
};

export type GenerateAgentFileChangeRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  memories?: AgentMemoryContext[];
  personalization?: string;
  speed: SpeedMode;
  taskPrompt: string;
  relativePath: string;
  currentContent: string;
};

export type GenerateAgentAskRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  memories?: AgentMemoryContext[];
  personalization?: string;
  conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  projectScan?: ProjectScanResult | null;
  speed: SpeedMode;
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
