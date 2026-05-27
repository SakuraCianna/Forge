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

  if (provider.kind === "anthropic") {
    return {
      url: `${baseUrl}/v1/models`,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    };
  }

  if (provider.kind === "gemini") {
    return {
      url: `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      headers: {}
    };
  }

  return {
    url: `${baseUrl}/models`,
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  };
}

export function parseProviderModelList(provider: ForgeProvider, response: unknown): FetchedModel[] {
  if (!isRecord(response)) {
    return [];
  }

  if (provider.kind === "gemini") {
    return parseGeminiModels(response);
  }

  return parseDataModels(response, provider.kind === "anthropic");
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

function parseDataModels(response: UnknownRecord, preferDisplayName: boolean): FetchedModel[] {
  if (!Array.isArray(response.data)) {
    return [];
  }

  return response.data.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      return [];
    }

    const displayName = preferDisplayName && typeof item.display_name === "string" ? item.display_name : item.id;
    return [{ id: item.id, label: displayName }];
  });
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
