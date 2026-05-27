import type { ForgeModel, ForgeProvider } from "./modelTypes.js";

export const providerCatalog: ForgeProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    requiresBaseUrl: false
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    requiresBaseUrl: false
  },
  {
    id: "gemini",
    label: "Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    requiresBaseUrl: false
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresBaseUrl: false
  },
  {
    id: "custom-openai-compatible",
    label: "OpenAI Compatible",
    kind: "openai-compatible",
    requiresBaseUrl: true
  }
];

export const catalogModels: ForgeModel[] = [
  {
    id: "openai:gpt-5.5",
    providerId: "openai",
    label: "GPT-5.5",
    modelName: "gpt-5.5",
    enabled: false,
    capabilities: {
      reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
      toolCalling: true,
      streaming: true,
      vision: true
    },
    capabilitySource: "built-in"
  },
  {
    id: "anthropic:claude-sonnet",
    providerId: "anthropic",
    label: "Claude Sonnet",
    modelName: "claude-sonnet",
    enabled: false,
    capabilities: {
      reasoning: { type: "budget", min: 1024, max: 32000 },
      toolCalling: true,
      streaming: true,
      vision: true
    },
    capabilitySource: "built-in"
  },
  {
    id: "gemini:gemini-2.5-pro",
    providerId: "gemini",
    label: "Gemini 2.5 Pro",
    modelName: "gemini-2.5-pro",
    enabled: false,
    capabilities: {
      reasoning: { type: "budget", min: 0, max: 32768 },
      toolCalling: true,
      streaming: true,
      vision: true
    },
    capabilitySource: "built-in"
  }
];
