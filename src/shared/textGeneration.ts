import type { ForgeModel, ForgeProvider, IntelligenceLevel, ProviderKind } from "./modelTypes.js";

export type TextGenerationRequestOptions = {
  provider: ForgeProvider;
  model: ForgeModel;
  apiKey: string;
  instructions: string;
  input: string;
  intelligence: IntelligenceLevel;
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
};

const thinkingBudgetByLevel: Record<IntelligenceLevel, number> = {
  low: 1024,
  medium: 2048,
  high: 4096,
  xhigh: 8192
};

export function buildTextGenerationRequest({
  provider,
  model,
  apiKey,
  instructions,
  input,
  intelligence
}: TextGenerationRequestOptions): BuiltTextGenerationRequest {
  const baseUrl = trimTrailingSlash(provider.baseUrl ?? "");

  if (!baseUrl) {
    throw new Error(`${provider.label} Base URL is not configured`);
  }

  if (provider.kind === "openai") {
    return buildOpenAIRequest({ baseUrl, model, apiKey, instructions, input, intelligence });
  }

  if (provider.kind === "anthropic") {
    return buildAnthropicRequest({ baseUrl, model, apiKey, instructions, input, intelligence });
  }

  if (provider.kind === "gemini") {
    return buildGeminiRequest({ baseUrl, model, apiKey, instructions, input, intelligence });
  }

  return buildOpenAICompatibleRequest({ baseUrl, model, apiKey, instructions, input, intelligence });
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

function buildOpenAIRequest({
  baseUrl,
  model,
  apiKey,
  instructions,
  input,
  intelligence
}: ProviderTextGenerationRequestOptions): BuiltTextGenerationRequest {
  const body: Record<string, unknown> = {
    model: model.modelName,
    instructions,
    input,
    store: false
  };
  const effort = resolveEffort(model, intelligence);

  if (effort) {
    body.reasoning = { effort };
  }

  return postJson(`${baseUrl}/responses`, apiKey, body);
}

function buildAnthropicRequest({
  baseUrl,
  model,
  apiKey,
  instructions,
  input,
  intelligence
}: ProviderTextGenerationRequestOptions): BuiltTextGenerationRequest {
  const body: Record<string, unknown> = {
    model: model.modelName,
    system: instructions,
    messages: [{ role: "user", content: input }],
    max_tokens: 4096
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

  return {
    url: `${baseUrl}/v1/messages`,
    init: {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
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
    contents: [{ role: "user", parts: [{ text: input }] }]
  };

  if (model.capabilities.reasoning.type !== "none") {
    body.generationConfig = {
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
  intelligence
}: ProviderTextGenerationRequestOptions): BuiltTextGenerationRequest {
  const body: Record<string, unknown> = {
    model: model.modelName,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input }
    ],
    stream: false
  };
  const effort = resolveEffort(model, intelligence);

  if (effort) {
    body.reasoning = { effort };
  }

  return postJson(`${baseUrl}/chat/completions`, apiKey, body);
}

function postJson(url: string, apiKey: string, body: Record<string, unknown>): BuiltTextGenerationRequest {
  return {
    url,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
