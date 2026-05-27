import type { ForgeModel, ForgeProvider, IntelligenceLevel, SpeedMode } from "./modelTypes.js";
import type { ProjectScanResult } from "./projectTypes.js";

export type GenerateAgentPlanRequest = {
  provider: ForgeProvider;
  model: ForgeModel;
  intelligence: IntelligenceLevel;
  speed: SpeedMode;
  taskPrompt: string;
  projectScan: ProjectScanResult;
};

export type AgentPlanResult = {
  providerId: string;
  modelId: string;
  text: string;
  createdAt: string;
};
