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
    id: "zhipu",
    label: "智谱 AI",
    kind: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    requiresBaseUrl: false
  },
  {
    id: "zai",
    label: "Z.AI",
    kind: "openai-compatible",
    baseUrl: "https://api.z.ai/api/paas/v4",
    requiresBaseUrl: false
  },
  {
    id: "zai-coding",
    label: "Z.AI Coding Plan",
    kind: "openai-compatible",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    requiresBaseUrl: false
  },
  {
    id: "minimax",
    label: "MiniMax",
    kind: "openai-compatible",
    baseUrl: "https://api.minimax.io/v1",
    requiresBaseUrl: false
  },
  {
    id: "xiaomi-mimo",
    label: "Xiaomi MiMo",
    kind: "openai-compatible",
    baseUrl: "https://api.xiaomimimo.com/v1",
    requiresBaseUrl: false
  },
  {
    id: "xiaomi-mimo-token",
    label: "Xiaomi MiMo Token Plan",
    kind: "openai-compatible",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    requiresBaseUrl: false
  },
  {
    id: "github-models",
    label: "GitHub Models / Copilot",
    kind: "openai-compatible",
    baseUrl: "https://models.github.ai/inference",
    modelListUrl: "https://models.github.ai/catalog/models",
    requestHeaders: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    requiresBaseUrl: false
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    modelListUrl: "http://localhost:11434/api/tags",
    requiresBaseUrl: false,
    requiresApiKey: false
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
