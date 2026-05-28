import type { ForgeModel, ForgeProvider } from "./modelTypes.js";

export const providerCatalog: ForgeProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    requiresBaseUrl: false,
    icon: "AI",
    iconAsset: "openai",
    accentColor: "#10a37f"
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    requiresBaseUrl: false,
    icon: "A",
    iconAsset: "anthropic",
    accentColor: "#d97757"
  },
  {
    id: "gemini",
    label: "Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    requiresBaseUrl: false,
    icon: "G",
    iconAsset: "gemini",
    accentColor: "#1a73e8"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    requiresBaseUrl: false,
    icon: "OR",
    accentColor: "#7c3aed"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    requiresBaseUrl: false,
    icon: "DS",
    iconAsset: "deepseek",
    accentColor: "#4d6bfe"
  },
  {
    id: "moonshot",
    label: "月之暗面 / Kimi",
    kind: "openai-compatible",
    baseUrl: "https://api.moonshot.cn/v1",
    requiresBaseUrl: false,
    icon: "K",
    iconAsset: "moonshot",
    accentColor: "#1f6feb"
  },
  {
    id: "qwen-dashscope",
    label: "通义千问 / 百炼",
    kind: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    requiresBaseUrl: false,
    icon: "Q",
    iconAsset: "qwen",
    accentColor: "#615ced"
  },
  {
    id: "qwen-dashscope-intl",
    label: "Qwen / DashScope International",
    kind: "openai-compatible",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    requiresBaseUrl: false,
    icon: "Q",
    iconAsset: "qwen",
    accentColor: "#615ced"
  },
  {
    id: "zhipu",
    label: "智谱 AI",
    kind: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    requiresBaseUrl: false,
    icon: "GLM",
    iconAsset: "zhipu",
    accentColor: "#315efb"
  },
  {
    id: "zai",
    label: "Z.AI 海外版",
    kind: "openai-compatible",
    baseUrl: "https://api.z.ai/api/paas/v4",
    requiresBaseUrl: false,
    icon: "Z",
    iconAsset: "zhipu",
    accentColor: "#0f766e"
  },
  {
    id: "zai-coding",
    label: "Z.AI Coding Plan 海外版",
    kind: "openai-compatible",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    requiresBaseUrl: false,
    icon: "ZC",
    iconAsset: "zhipu",
    accentColor: "#0e7490"
  },
  {
    id: "minimax-cn",
    label: "MiniMax",
    kind: "openai-compatible",
    baseUrl: "https://api.minimaxi.com/v1",
    requiresBaseUrl: false,
    icon: "MM",
    iconAsset: "minimax",
    accentColor: "#111827"
  },
  {
    id: "minimax",
    label: "MiniMax 海外版",
    kind: "openai-compatible",
    baseUrl: "https://api.minimax.io/v1",
    requiresBaseUrl: false,
    icon: "MM",
    iconAsset: "minimax",
    accentColor: "#111827"
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    kind: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    requiresBaseUrl: false,
    icon: "SF",
    iconAsset: "siliconflow",
    accentColor: "#00a36c"
  },
  {
    id: "volcengine-ark",
    label: "火山方舟",
    kind: "openai-compatible",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    requiresBaseUrl: false,
    icon: "ARK",
    iconAsset: "volcengine",
    accentColor: "#1664ff"
  },
  {
    id: "baidu-qianfan",
    label: "百度千帆",
    kind: "openai-compatible",
    baseUrl: "https://qianfan.baidubce.com/v2",
    requiresBaseUrl: false,
    icon: "BD",
    iconAsset: "baidu",
    accentColor: "#2932e1"
  },
  {
    id: "baidu-qianfan-intl",
    label: "Baidu Qianfan International",
    kind: "openai-compatible",
    baseUrl: "https://api.baiduqianfan.ai/v1",
    requiresBaseUrl: false,
    icon: "BD",
    iconAsset: "baidu",
    accentColor: "#2932e1"
  },
  {
    id: "tencent-hunyuan",
    label: "腾讯 TokenHub / 混元",
    kind: "openai-compatible",
    baseUrl: "https://tokenhub.tencentmaas.com/v1",
    requiresBaseUrl: false,
    icon: "TC",
    iconAsset: "hunyuan",
    accentColor: "#0052d9"
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    requiresBaseUrl: false,
    icon: "GQ",
    accentColor: "#f55036"
  },
  {
    id: "together",
    label: "Together AI",
    kind: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    requiresBaseUrl: false,
    icon: "TG",
    accentColor: "#111827"
  },
  {
    id: "mistral",
    label: "Mistral AI",
    kind: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    requiresBaseUrl: false,
    icon: "MS",
    accentColor: "#ff7000"
  },
  {
    id: "xai",
    label: "xAI",
    kind: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    requiresBaseUrl: false,
    icon: "X",
    accentColor: "#202123"
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    kind: "openai-compatible",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    requiresBaseUrl: false,
    icon: "FW",
    accentColor: "#ef4444"
  },
  {
    id: "cerebras",
    label: "Cerebras",
    kind: "openai-compatible",
    baseUrl: "https://api.cerebras.ai/v1",
    requiresBaseUrl: false,
    icon: "CB",
    accentColor: "#111827"
  },
  {
    id: "stepfun",
    label: "阶跃星辰",
    kind: "openai-compatible",
    baseUrl: "https://api.stepfun.com/v1",
    requiresBaseUrl: false,
    icon: "ST",
    iconAsset: "stepfun",
    accentColor: "#7c3aed"
  },
  {
    id: "modelscope",
    label: "魔搭 ModelScope",
    kind: "openai-compatible",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    requiresBaseUrl: false,
    icon: "MS",
    iconAsset: "modelscope",
    accentColor: "#1677ff"
  },
  {
    id: "xiaomi-mimo",
    label: "小米 MiMo",
    kind: "openai-compatible",
    baseUrl: "https://api.xiaomimimo.com/v1",
    requiresBaseUrl: false,
    authHeader: "api-key",
    reasoningStyle: "mimo-thinking",
    icon: "MI",
    iconAsset: "xiaomi",
    accentColor: "#ff6900"
  },
  {
    id: "xiaomi-mimo-token",
    label: "小米 MiMo Token Plan",
    kind: "openai-compatible",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    requiresBaseUrl: false,
    authHeader: "api-key",
    reasoningStyle: "mimo-thinking",
    icon: "MI",
    iconAsset: "xiaomi",
    accentColor: "#ff6900"
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
    requiresBaseUrl: false,
    icon: "GH",
    iconAsset: "github-copilot",
    accentColor: "#24292f"
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    modelListUrl: "http://localhost:11434/api/tags",
    requiresBaseUrl: false,
    requiresApiKey: false,
    icon: "OL",
    iconAsset: "ollama",
    accentColor: "#262626"
  }
];

export function hydrateProviderFromCatalog(provider: ForgeProvider): ForgeProvider {
  const catalogProvider = providerCatalog.find((candidate) => candidate.id === provider.id);

  if (!catalogProvider) {
    return provider;
  }

  return {
    ...catalogProvider,
    ...provider,
    baseUrl: provider.baseUrl ?? catalogProvider.baseUrl,
    modelListUrl: provider.modelListUrl ?? catalogProvider.modelListUrl,
    requestHeaders: provider.requestHeaders ?? catalogProvider.requestHeaders,
    requiresApiKey: provider.requiresApiKey ?? catalogProvider.requiresApiKey,
    authHeader: provider.authHeader ?? catalogProvider.authHeader,
    reasoningStyle: provider.reasoningStyle ?? catalogProvider.reasoningStyle,
    icon: provider.icon ?? catalogProvider.icon,
    iconAsset: provider.iconAsset ?? catalogProvider.iconAsset,
    accentColor: provider.accentColor ?? catalogProvider.accentColor
  };
}

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
