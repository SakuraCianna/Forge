// 本文件说明: 共享模块 文本生成共享类型
import type {
  ForgeModel,
  ForgeProvider,
  IntelligenceLevel,
  ProviderKind,
  SpeedMode
} from "./modelTypes.js";
import { assertHeaderValue, normalizeApiKeyForHeader } from "./providerModels.js";
import type { TokenUsage } from "./usageTypes.js";

export type TextGenerationRequestOptions = {
  provider: ForgeProvider;
  model: ForgeModel;
  apiKey: string;
  instructions: string;
  input: string;
  intelligence: IntelligenceLevel;
  speed?: SpeedMode;
};

export type BuiltTextGenerationRequest = {
  url: string;
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  };
};

type ProviderTextGenerationRequestOptions = Omit<TextGenerationRequestOptions, "provider"> & {
  baseUrl: string;
  providerId: string;
  requestHeaders?: Record<string, string>;
  requiresApiKey?: boolean;
  authHeader?: ForgeProvider["authHeader"];
  reasoningStyle?: ForgeProvider["reasoningStyle"];
};

const thinkingBudgetByLevel: Record<IntelligenceLevel, number> = {
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 8192
};

const defaultOutputTokenLimit = 8192;

export function buildTextGenerationRequest({
  provider,
  model,
  apiKey,
  instructions,
  input,
  intelligence,
  speed = "balanced"
}: TextGenerationRequestOptions): BuiltTextGenerationRequest {
  const baseUrl = trimTrailingSlash(provider.baseUrl ?? "");

  if (!baseUrl) {
    throw new Error(`${provider.label} Base URL is not configured`);
  }

  if (provider.kind === "openai") {
    return buildOpenAIRequest({
      baseUrl,
      providerId: provider.id,
      model,
      apiKey,
      instructions,
      input,
      intelligence,
      speed,
      requestHeaders: provider.requestHeaders,
      requiresApiKey: provider.requiresApiKey,
      authHeader: provider.authHeader,
      reasoningStyle: provider.reasoningStyle
    });
  }

  if (provider.kind === "anthropic") {
    return buildAnthropicRequest({
      baseUrl,
      providerId: provider.id,
      model,
      apiKey,
      instructions,
      input,
      intelligence,
      speed,
      requestHeaders: provider.requestHeaders
    });
  }

  if (provider.kind === "gemini") {
    return buildGeminiRequest({
      baseUrl,
      providerId: provider.id,
      model,
      apiKey,
      instructions,
      input,
      intelligence,
      speed
    });
  }

  return buildOpenAICompatibleRequest({
    baseUrl,
    providerId: provider.id,
    model,
    apiKey,
    instructions,
    input,
    intelligence,
    speed,
    requestHeaders: provider.requestHeaders,
    requiresApiKey: provider.requiresApiKey,
    authHeader: provider.authHeader,
    reasoningStyle: provider.reasoningStyle
  });
}

export function extractGeneratedText(providerKind: ProviderKind, response: unknown): string {
  if (!isRecord(response)) {
    return "";
  }

  if (providerKind === "openai") {
    return extractOpenAIText(response);
  }

  if (providerKind === "anthropic") {
    return extractAnthropicText(response);
  }

  if (providerKind === "gemini") {
    return extractGeminiText(response);
  }

  return extractChatCompletionsText(response);
}

export function extractTokenUsage(providerKind: ProviderKind, response: unknown): TokenUsage | undefined {
  if (!isRecord(response)) {
    return undefined;
  }

  if (providerKind === "openai") {
    return extractOpenAITokenUsage(response);
  }

  if (providerKind === "anthropic") {
    return extractAnthropicTokenUsage(response);
  }

  if (providerKind === "gemini") {
    return extractGeminiTokenUsage(response);
  }

  return extractChatCompletionsTokenUsage(response);
}

function buildOpenAIRequest({
  baseUrl,
  model,
  apiKey,
  instructions,
  input,
  intelligence,
  speed,
  requestHeaders,
  requiresApiKey,
  authHeader
}: ProviderTextGenerationRequestOptions): BuiltTextGenerationRequest {
  const body: Record<string, unknown> = {
    model: model.modelName,
    instructions,
    input,
    max_output_tokens: defaultOutputTokenLimit,
    store: false
  };
  const effort = resolveEffort(model, intelligence);

  if (effort) {
    body.reasoning = { effort };
  }

  const serviceTier = resolveOpenAIServiceTier(model, speed);

  if (serviceTier) {
    body.service_tier = serviceTier;
  }

  return postJson(`${baseUrl}/responses`, apiKey, body, requestHeaders, requiresApiKey, authHeader);
}

function buildAnthropicRequest({
  baseUrl,
  model,
  apiKey,
  instructions,
  input,
  intelligence,
  speed,
  requestHeaders
}: ProviderTextGenerationRequestOptions): BuiltTextGenerationRequest {
  const body: Record<string, unknown> = {
    model: model.modelName,
    system: instructions,
    messages: [{ role: "user", content: input }],
    max_tokens: defaultOutputTokenLimit
  };

  if (model.capabilities.reasoning.type === "budget") {
    const budgetTokens = clamp(
      thinkingBudgetByLevel[intelligence],
      model.capabilities.reasoning.min,
      model.capabilities.reasoning.max
    );

    body.thinking = { type: "enabled", budget_tokens: budgetTokens };
    body.max_tokens = Math.min(budgetTokens + 4096, 16384);
  }

  const serviceTier = resolveAnthropicServiceTier(model, speed);

  if (serviceTier) {
    body.service_tier = serviceTier;
  }

  return {
    url: `${baseUrl}/v1/messages`,
    init: {
      method: "POST",
      headers: {
        ...validateHeaders(requestHeaders ?? {}),
        "x-api-key": assertHeaderValue("x-api-key", normalizeApiKeyForHeader(apiKey)),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  };
}

function buildGeminiRequest({
  baseUrl,
  model,
  apiKey,
  instructions,
  input,
  intelligence
}: ProviderTextGenerationRequestOptions): BuiltTextGenerationRequest {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: {
      maxOutputTokens: defaultOutputTokenLimit
    }
  };

  if (model.capabilities.reasoning.type !== "none") {
    body.generationConfig = {
      ...(body.generationConfig as Record<string, unknown>),
      thinkingConfig: {
        thinkingLevel: intelligence === "xhigh" ? "high" : intelligence
      }
    };
  }

  return {
    url: `${baseUrl}/v1beta/models/${encodeURIComponent(model.modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  };
}

function buildOpenAICompatibleRequest({
  baseUrl,
  model,
  apiKey,
  instructions,
  input,
  intelligence,
  speed,
  requestHeaders,
  requiresApiKey,
  authHeader,
  providerId,
  reasoningStyle
}: ProviderTextGenerationRequestOptions): BuiltTextGenerationRequest {
  const body: Record<string, unknown> = {
    model: model.modelName,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input }
    ],
    max_tokens: defaultOutputTokenLimit,
    stream: false
  };
  const effort = resolveEffort(model, intelligence);

  if (effort && reasoningStyle === "mimo-thinking") {
    body.thinking = { type: intelligence === "low" ? "disabled" : "enabled" };
  } else if (effort) {
    body.reasoning = { effort };
  }

  const serviceTier = resolveOpenAICompatibleServiceTier(providerId, model, speed);

  if (serviceTier) {
    body.service_tier = serviceTier;
  }

  return postJson(`${baseUrl}/chat/completions`, apiKey, body, requestHeaders, requiresApiKey, authHeader);
}

function postJson(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  requestHeaders: Record<string, string> = {},
  requiresApiKey = true,
  authHeader: ForgeProvider["authHeader"] = "authorization-bearer"
): BuiltTextGenerationRequest {
  const headers: Record<string, string> = {
    ...validateHeaders(requestHeaders),
    "Content-Type": "application/json"
  };

  if (requiresApiKey && authHeader === "api-key") {
    headers["api-key"] = assertHeaderValue("api-key", normalizeApiKeyForHeader(apiKey));
  } else if (requiresApiKey) {
    headers.Authorization = assertHeaderValue(
      "Authorization",
      `Bearer ${normalizeApiKeyForHeader(apiKey)}`
    );
  }

  return {
    url,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    }
  };
}

function resolveEffort(model: ForgeModel, intelligence: IntelligenceLevel): IntelligenceLevel | null {
  if (model.capabilities.reasoning.type !== "effort") {
    return null;
  }

  if (model.capabilities.reasoning.values.includes(intelligence)) {
    return intelligence;
  }

  return model.capabilities.reasoning.values.at(-1) ?? null;
}

function resolveOpenAIServiceTier(model: ForgeModel, speed?: SpeedMode): string | null {
  if (!speed || !model.capabilities.speedModes?.includes(speed)) {
    return null;
  }

  return speed === "fast" ? "priority" : "default";
}

function resolveAnthropicServiceTier(model: ForgeModel, speed?: SpeedMode): string | null {
  if (!speed || !model.capabilities.speedModes?.includes(speed)) {
    return null;
  }

  return speed === "fast" ? "auto" : "standard_only";
}

function resolveOpenAICompatibleServiceTier(
  providerId: string,
  model: ForgeModel,
  speed?: SpeedMode
): string | null {
  if (
    providerId !== "openrouter" ||
    speed !== "fast" ||
    !model.capabilities.speedModes?.includes(speed)
  ) {
    return null;
  }

  return "priority";
}

function extractOpenAIText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return "";
  }

  return response.output
    .flatMap((outputItem) => (isRecord(outputItem) && Array.isArray(outputItem.content) ? outputItem.content : []))
    .flatMap((contentItem) => (isRecord(contentItem) && typeof contentItem.text === "string" ? [contentItem.text] : []))
    .join("\n");
}

function extractAnthropicText(response: Record<string, unknown>): string {
  if (!Array.isArray(response.content)) {
    return "";
  }

  return response.content
    .flatMap((contentItem) =>
      isRecord(contentItem) && contentItem.type === "text" && typeof contentItem.text === "string"
        ? [contentItem.text]
        : []
    )
    .join("\n");
}

function extractGeminiText(response: Record<string, unknown>): string {
  if (!Array.isArray(response.candidates)) {
    return "";
  }

  return response.candidates
    .flatMap((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
        return [];
      }

      return candidate.content.parts;
    })
    .flatMap((part) => (isRecord(part) && typeof part.text === "string" ? [part.text] : []))
    .join("\n");
}

function extractChatCompletionsText(response: Record<string, unknown>): string {
  if (!Array.isArray(response.choices)) {
    return "";
  }

  return response.choices
    .flatMap((choice) => {
      if (!isRecord(choice) || !isRecord(choice.message)) {
        return [];
      }

      const { content } = choice.message;

      if (typeof content === "string") {
        return [content];
      }

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => (isRecord(part) && typeof part.text === "string" ? [part.text] : []));
    })
    .join("\n");
}

function extractOpenAITokenUsage(response: Record<string, unknown>): TokenUsage | undefined {
  if (!isRecord(response.usage)) {
    return undefined;
  }

  const inputTokens = readNumber(response.usage.input_tokens);
  const outputTokens = readNumber(response.usage.output_tokens);
  const totalTokens = readNumber(response.usage.total_tokens) ?? sumKnown(inputTokens, outputTokens);
  const outputDetails = isRecord(response.usage.output_tokens_details)
    ? response.usage.output_tokens_details
    : {};
  const inputDetails = isRecord(response.usage.input_tokens_details)
    ? response.usage.input_tokens_details
    : {};

  return createTokenUsage({
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens: readNumber(outputDetails.reasoning_tokens),
    cacheReadTokens: readNumber(inputDetails.cached_tokens)
  });
}

function extractAnthropicTokenUsage(response: Record<string, unknown>): TokenUsage | undefined {
  if (!isRecord(response.usage)) {
    return undefined;
  }

  const inputTokens = readNumber(response.usage.input_tokens);
  const outputTokens = readNumber(response.usage.output_tokens);

  return createTokenUsage({
    inputTokens,
    outputTokens,
    totalTokens: sumKnown(inputTokens, outputTokens),
    cacheReadTokens: readNumber(response.usage.cache_read_input_tokens),
    cacheWriteTokens: readNumber(response.usage.cache_creation_input_tokens)
  });
}

function extractGeminiTokenUsage(response: Record<string, unknown>): TokenUsage | undefined {
  if (!isRecord(response.usageMetadata)) {
    return undefined;
  }

  const inputTokens = readNumber(response.usageMetadata.promptTokenCount);
  const outputTokens = readNumber(response.usageMetadata.candidatesTokenCount);
  const totalTokens =
    readNumber(response.usageMetadata.totalTokenCount) ?? sumKnown(inputTokens, outputTokens);

  return createTokenUsage({
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens: readNumber(response.usageMetadata.thoughtsTokenCount)
  });
}

function extractChatCompletionsTokenUsage(response: Record<string, unknown>): TokenUsage | undefined {
  if (!isRecord(response.usage)) {
    return undefined;
  }

  const inputTokens = readNumber(response.usage.prompt_tokens);
  const outputTokens = readNumber(response.usage.completion_tokens);
  const totalTokens = readNumber(response.usage.total_tokens) ?? sumKnown(inputTokens, outputTokens);
  const completionDetails = isRecord(response.usage.completion_tokens_details)
    ? response.usage.completion_tokens_details
    : {};
  const promptDetails = isRecord(response.usage.prompt_tokens_details)
    ? response.usage.prompt_tokens_details
    : {};

  return createTokenUsage({
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens: readNumber(completionDetails.reasoning_tokens),
    cacheReadTokens: readNumber(promptDetails.cached_tokens)
  });
}

function createTokenUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): TokenUsage | undefined {
  if (
    usage.inputTokens === undefined &&
    usage.outputTokens === undefined &&
    usage.totalTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? sumKnown(usage.inputTokens, usage.outputTokens) ?? 0,
    reasoningTokens: usage.reasoningTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens
  };
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumKnown(first?: number, second?: number): number | undefined {
  if (first === undefined && second === undefined) {
    return undefined;
  }

  return (first ?? 0) + (second ?? 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, assertHeaderValue(name, value)])
  );
}
