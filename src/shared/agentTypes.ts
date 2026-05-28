import type { ForgeModel, ForgeProvider, IntelligenceLevel, SpeedMode } from "./modelTypes.js";
import type { ProjectScanResult } from "./projectTypes.js";
import type { TokenUsage } from "./usageTypes.js";

export type GenerateAgentPlanRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  personalization?: string;
  speed: SpeedMode;
  taskPrompt: string;
  projectScan: ProjectScanResult;
};

export type GenerateAgentFileChangeRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
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
  personalization?: string;
  speed: SpeedMode;
  prompt: string;
};

export type AgentPlanResult = {
  providerId: string;
  modelId: string;
  text: string;
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
