export type ProviderKind = "openai" | "anthropic" | "gemini" | "openai-compatible";

export type Language = "zh-CN" | "en-US";

export type IntelligenceLevel = "low" | "medium" | "high" | "xhigh";

export type SpeedMode = "fast" | "balanced" | "careful";

export type ReasoningControl =
  | { type: "none" }
  | { type: "effort"; values: IntelligenceLevel[] }
  | { type: "budget"; min: number; max: number };

export type ForgeProvider = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  requiresBaseUrl: boolean;
  custom?: boolean;
};

export type ForgeModel = {
  id: string;
  providerId: string;
  label: string;
  modelName: string;
  enabled: boolean;
  capabilities: {
    reasoning: ReasoningControl;
    toolCalling: boolean | "unknown";
    streaming: boolean | "unknown";
    vision: boolean | "unknown";
    contextWindow?: number;
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
