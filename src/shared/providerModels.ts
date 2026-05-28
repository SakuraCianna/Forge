import type { ForgeModel, ForgeProvider } from "./modelTypes.js";

export type ModelListRequest = {
  url: string;
  headers: Record<string, string>;
};

export type FetchedModel = {
  id: string;
  label: string;
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

  const headers: Record<string, string> = { ...extraHeaders };

  if (provider.requiresApiKey !== false) {
    headers.Authorization = `Bearer ${assertHeaderValue("Authorization", headerApiKey)}`;
  }

  return {
    url: provider.modelListUrl ?? `${baseUrl}/models`,
    headers
  };
}

export function parseProviderModelList(provider: ForgeProvider, response: unknown): FetchedModel[] {
  if (Array.isArray(response)) {
    return parseModelItems(response, provider.kind === "anthropic");
  }

  if (!isRecord(response)) {
    return [];
  }

  if (provider.kind === "gemini") {
    return parseGeminiModels(response);
  }

  return parseOpenAICompatibleModels(response, provider.kind === "anthropic");
}

export function toForgeModel(provider: ForgeProvider, fetchedModel: FetchedModel): ForgeModel {
  return {
    id: `${provider.id}:${fetchedModel.id}`,
    providerId: provider.id,
    label: fetchedModel.label,
    modelName: fetchedModel.id,
    enabled: false,
    capabilities: {
      reasoning: { type: "none" },
      toolCalling: "unknown",
      streaming: "unknown",
      vision: "unknown"
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

    return [{ id, label }];
  });
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
