// 本文件说明: 共享模块 模型共享类型
export type ProviderKind = "openai" | "anthropic" | "gemini" | "openai-compatible";

export type Language = "zh-CN" | "en-US";

export type IntelligenceLevel = "low" | "medium" | "high" | "xhigh";

export type SpeedMode = "fast" | "balanced";

export type ReasoningControl =
  | { type: "none" }
  | { type: "effort"; values: IntelligenceLevel[] }
  | { type: "budget"; min: number; max: number };

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

export type ForgeProvider = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  modelListUrl?: string;
  requestHeaders?: Record<string, string>;
  requiresBaseUrl: boolean;
  requiresApiKey?: boolean;
  authHeader?: "authorization-bearer" | "api-key";
  reasoningStyle?: "openai-reasoning" | "mimo-thinking";
  icon?: string;
  iconAsset?: string;
  accentColor?: string;
  custom?: boolean;
};

export type ForgeModel = {
  id: string;
  providerId: string;
  label: string;
  modelName: string;
  enabled: boolean;
  selectionCount?: number;
  lastSelectedAt?: string;
  pricing?: ModelPricing;
  capabilities: {
    reasoning: ReasoningControl;
    toolCalling: boolean | "unknown";
    streaming: boolean | "unknown";
    vision: boolean | "unknown";
    contextWindow?: number;
    speedModes?: SpeedMode[];
  };
  capabilitySource: "built-in" | "provider-api" | "probe" | "manual";
};

export type ModelSettings = {
  language: Language;
  intelligence: IntelligenceLevel;
  speed: SpeedMode;
  currentModelId: string | null;
  providers: ForgeProvider[];
  models: ForgeModel[];
};
