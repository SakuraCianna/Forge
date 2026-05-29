import type { ForgeModel, ForgeProvider, ReasoningControl, SpeedMode } from "./modelTypes.js";

export type ModelListRequest = {
  url: string;
  headers: Record<string, string>;
};

export type FetchedModel = {
  id: string;
  label: string;
  outputModalities?: string[];
  supportedParameters?: string[];
};

type UnknownRecord = Record<string, unknown>;

export function buildModelListRequest(provider: ForgeProvider, apiKey: string): ModelListRequest {
  const baseUrl = trimTrailingSlash(provider.baseUrl ?? "");
  const headerApiKey = normalizeApiKeyForHeader(apiKey);
  const extraHeaders = validateHeaders(provider.requestHeaders ?? {});

  if (!baseUrl && !provider.modelListUrl) {
    throw new Error(`${provider.label} Base URL is not configured`);
  }

  if (provider.kind === "anthropic") {
    return {
      url: provider.modelListUrl ?? `${baseUrl}/v1/models`,
      headers: {
        ...extraHeaders,
        "x-api-key": assertHeaderValue("x-api-key", headerApiKey),
        "anthropic-version": "2023-06-01"
      }
    };
  }

  if (provider.kind === "gemini") {
    return {
      url: `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      headers: extraHeaders
    };
  }

  const headers = applyAuthHeader({ ...extraHeaders }, provider, headerApiKey);

  return {
    url: provider.modelListUrl ?? `${baseUrl}/models`,
    headers
  };
}

export function parseProviderModelList(provider: ForgeProvider, response: unknown): FetchedModel[] {
  const filterCodingModels = (models: FetchedModel[]): FetchedModel[] =>
    models.filter((model) => isUsableCodingModel(provider, model.id, model));

  if (Array.isArray(response)) {
    return filterCodingModels(parseModelItems(response, provider.kind === "anthropic"));
  }

  if (!isRecord(response)) {
    return [];
  }

  if (provider.kind === "gemini") {
    return filterCodingModels(parseGeminiModels(response));
  }

  return filterCodingModels(parseOpenAICompatibleModels(response, provider.kind === "anthropic"));
}

export function toForgeModel(provider: ForgeProvider, fetchedModel: FetchedModel): ForgeModel {
  const capabilities = inferFetchedModelCapabilities(provider, fetchedModel.id, fetchedModel);

  return {
    id: `${provider.id}:${fetchedModel.id}`,
    providerId: provider.id,
    label: fetchedModel.label,
    modelName: fetchedModel.id,
    enabled: false,
    capabilities: {
      reasoning: capabilities.reasoning,
      toolCalling: "unknown",
      streaming: "unknown",
      vision: "unknown",
      speedModes: capabilities.speedModes
    },
    capabilitySource: "provider-api"
  };
}

export function normalizeApiKeyForHeader(apiKey: string): string {
  return apiKey.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
}

export function assertHeaderValue(headerName: string, value: string): string {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (codePoint > 255) {
      throw new Error(
        `${headerName} contains non-ASCII characters. Paste the raw API key only, without labels, Chinese punctuation, or extra notes.`
      );
    }

    if (character === "\r" || character === "\n") {
      throw new Error(`${headerName} contains line breaks. Paste the raw API key on one line.`);
    }
  }

  return value;
}

export function inferFetchedModelCapabilities(
  provider: ForgeProvider,
  modelName: string,
  metadata?: Pick<FetchedModel, "supportedParameters">
): { reasoning: ReasoningControl; speedModes?: SpeedMode[] } {
  const normalizedModelName = modelName.toLowerCase();
  const speedModes = inferSpeedModes(provider, normalizedModelName, metadata);

  if (provider.reasoningStyle === "mimo-thinking" && isMimoThinkingModel(normalizedModelName)) {
    return {
      reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
      speedModes
    };
  }

  if (provider.kind === "gemini" && /(^|[-.])2\.5([-_.]|$)/.test(normalizedModelName)) {
    return { reasoning: { type: "budget", min: 0, max: 32768 }, speedModes };
  }

  if (provider.id === "deepseek" && /(^|[-_])(reasoner|r1)([-_]|$)/.test(normalizedModelName)) {
    return {
      reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
      speedModes
    };
  }

  return { reasoning: { type: "none" }, speedModes };
}

export function isUsableCodingModel(
  provider: ForgeProvider,
  modelName: string,
  metadata?: Pick<FetchedModel, "outputModalities">
): boolean {
  const normalizedModelName = modelName.toLowerCase();

  if (
    metadata?.outputModalities?.length &&
    !metadata.outputModalities.some((modality) => modality.toLowerCase() === "text")
  ) {
    return false;
  }

  if (provider.reasoningStyle === "mimo-thinking" && normalizedModelName.includes("tts")) {
    return false;
  }

  return !isNonCodingModelName(normalizedModelName);
}

function applyAuthHeader(
  headers: Record<string, string>,
  provider: ForgeProvider,
  apiKey: string
): Record<string, string> {
  if (provider.requiresApiKey === false) {
    return headers;
  }

  if (provider.authHeader === "api-key") {
    headers["api-key"] = assertHeaderValue("api-key", apiKey);
    return headers;
  }

  headers.Authorization = `Bearer ${assertHeaderValue("Authorization", apiKey)}`;
  return headers;
}

function isMimoThinkingModel(normalizedModelName: string): boolean {
  if (normalizedModelName.includes("tts")) {
    return false;
  }

  return /^mimo-v(2|2\.5)(-(pro|omni|flash))?$/.test(normalizedModelName);
}

function isNonCodingModelName(normalizedModelName: string): boolean {
  return /(^|[-_.:/])(tts|voiceclone|voicedesign|speech|audio|whisper|embedding|embed|rerank|image|video|moderation|guard)([-_.:/]|$)/.test(
    normalizedModelName
  );
}

function inferSpeedModes(
  provider: ForgeProvider,
  normalizedModelName: string,
  metadata?: Pick<FetchedModel, "supportedParameters">
): SpeedMode[] | undefined {
  if (provider.kind === "openai") {
    return ["balanced", "fast"];
  }

  if (provider.kind === "anthropic" && !normalizedModelName.includes("mythos")) {
    return ["balanced", "fast"];
  }

  if (
    provider.id === "openrouter" &&
    metadata?.supportedParameters?.some((parameter) => parameter.toLowerCase() === "service_tier")
  ) {
    return ["balanced", "fast"];
  }

  return undefined;
}

function validateHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, assertHeaderValue(name, value)])
  );
}

function parseOpenAICompatibleModels(response: UnknownRecord, preferDisplayName: boolean): FetchedModel[] {
  if (Array.isArray(response.data)) {
    return parseModelItems(response.data, preferDisplayName);
  }

  if (Array.isArray(response.models)) {
    return parseModelItems(response.models, preferDisplayName);
  }

  return [];
}

function parseModelItems(items: unknown[], preferDisplayName: boolean): FetchedModel[] {
  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = readModelId(item);

    if (!id) {
      return [];
    }

    const label =
      (preferDisplayName && typeof item.display_name === "string" ? item.display_name : undefined) ??
      (typeof item.displayName === "string" ? item.displayName : undefined) ??
      (typeof item.name === "string" && item.name !== id ? item.name : undefined) ??
      id;
    const architecture = isRecord(item.architecture) ? item.architecture : undefined;
    const outputModalities =
      readStringArray(item.output_modalities) ?? readStringArray(architecture?.output_modalities);
    const supportedParameters = readStringArray(item.supported_parameters);

    return [
      {
        id,
        label,
        ...(outputModalities ? { outputModalities } : {}),
        ...(supportedParameters ? { supportedParameters } : {})
      }
    ];
  });
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }

  return value;
}

function readModelId(item: UnknownRecord): string | null {
  if (typeof item.id === "string") {
    return item.id;
  }

  if (typeof item.model === "string") {
    return item.model;
  }

  if (typeof item.name === "string") {
    return item.name.replace(/^models\//, "");
  }

  return null;
}

function parseGeminiModels(response: UnknownRecord): FetchedModel[] {
  if (!Array.isArray(response.models)) {
    return [];
  }

  return response.models.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string") {
      return [];
    }

    const id = item.name.replace(/^models\//, "");
    const label = typeof item.displayName === "string" ? item.displayName : id;
    return [{ id, label }];
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
