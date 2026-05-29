import { describe, expect, it } from "vitest";
import type { ForgeModel, ForgeProvider } from "./modelTypes.js";
import {
  buildTextGenerationRequest,
  extractGeneratedText,
  extractTokenUsage
} from "./textGeneration.js";

const reasoningModel: ForgeModel = {
  id: "openai:gpt-5.5",
  providerId: "openai",
  label: "GPT-5.5",
  modelName: "gpt-5.5",
  enabled: true,
  capabilities: {
    reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
    toolCalling: true,
    streaming: true,
    vision: true
  },
  capabilitySource: "built-in"
};

const plainModel: ForgeModel = {
  ...reasoningModel,
  id: "openrouter:some-model",
  providerId: "openrouter",
  label: "Some Model",
  modelName: "some-model",
  capabilities: {
    reasoning: { type: "none" },
    toolCalling: "unknown",
    streaming: "unknown",
    vision: "unknown"
  }
};

describe("textGeneration", () => {
  it("builds an OpenAI Responses request with reasoning effort", () => {
    const provider: ForgeProvider = {
      id: "openai",
      label: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      requiresBaseUrl: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: reasoningModel,
      apiKey: "sk-test",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "xhigh"
    });

    expect(request.url).toBe("https://api.openai.com/v1/responses");
    expect(request.init.method).toBe("POST");
    expect(request.init.headers).toMatchObject({
      Authorization: "Bearer sk-test",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(request.init.body)).toMatchObject({
      model: "gpt-5.5",
      instructions: "You are Forge",
      input: "Plan the change",
      store: false,
      reasoning: { effort: "xhigh" }
    });
  });

  it("adds OpenAI service tier only for models that declare speed modes", () => {
    const provider: ForgeProvider = {
      id: "openai",
      label: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      requiresBaseUrl: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: {
        ...reasoningModel,
        capabilities: {
          ...reasoningModel.capabilities,
          speedModes: ["balanced", "fast"]
        }
      },
      apiKey: "sk-test",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "high",
      speed: "fast"
    });

    expect(JSON.parse(request.init.body)).toMatchObject({
      service_tier: "priority"
    });
  });

  it("builds an Anthropic Messages request with thinking budget", () => {
    const provider: ForgeProvider = {
      id: "anthropic",
      label: "Anthropic",
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com",
      requiresBaseUrl: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: {
        ...reasoningModel,
        providerId: "anthropic",
        modelName: "claude-sonnet",
        capabilities: {
          ...reasoningModel.capabilities,
          reasoning: { type: "budget", min: 1024, max: 32000 }
        }
      },
      apiKey: "sk-ant",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "high"
    });

    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.init.headers).toMatchObject({
      "x-api-key": "sk-ant",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(request.init.body)).toMatchObject({
      model: "claude-sonnet",
      system: "You are Forge",
      messages: [{ role: "user", content: "Plan the change" }],
      max_tokens: 8192,
      thinking: { type: "enabled", budget_tokens: 4096 }
    });
  });

  it("maps Anthropic speed mode to the official service tier field", () => {
    const provider: ForgeProvider = {
      id: "anthropic",
      label: "Anthropic",
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com",
      requiresBaseUrl: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: {
        ...reasoningModel,
        providerId: "anthropic",
        modelName: "claude-sonnet-4-5",
        capabilities: {
          ...reasoningModel.capabilities,
          reasoning: { type: "none" },
          speedModes: ["balanced", "fast"]
        }
      },
      apiKey: "sk-ant",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "high",
      speed: "balanced"
    });

    expect(JSON.parse(request.init.body)).toMatchObject({
      service_tier: "standard_only"
    });
  });

  it("builds a Gemini generateContent request with thinking level", () => {
    const provider: ForgeProvider = {
      id: "gemini",
      label: "Gemini",
      kind: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      requiresBaseUrl: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: {
        ...reasoningModel,
        providerId: "gemini",
        modelName: "gemini-2.5-pro"
      },
      apiKey: "AIza-test",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "xhigh"
    });

    expect(request.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=AIza-test"
    );
    expect(JSON.parse(request.init.body)).toMatchObject({
      systemInstruction: { parts: [{ text: "You are Forge" }] },
      contents: [{ role: "user", parts: [{ text: "Plan the change" }] }],
      generationConfig: {
        thinkingConfig: { thinkingLevel: "high" }
      }
    });
  });

  it("builds an OpenAI-compatible chat completions request", () => {
    const provider: ForgeProvider = {
      id: "openrouter",
      label: "OpenRouter",
      kind: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      requiresBaseUrl: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: plainModel,
      apiKey: "sk-router",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "medium"
    });

    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.init.headers.Authorization).toBe("Bearer sk-router");
    expect(JSON.parse(request.init.body)).toEqual({
      model: "some-model",
      messages: [
        { role: "system", content: "You are Forge" },
        { role: "user", content: "Plan the change" }
      ],
      stream: false
    });
  });

  it("adds OpenRouter priority service tier only when fast speed is supported", () => {
    const provider: ForgeProvider = {
      id: "openrouter",
      label: "OpenRouter",
      kind: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      requiresBaseUrl: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: {
        ...plainModel,
        capabilities: {
          ...plainModel.capabilities,
          speedModes: ["balanced", "fast"]
        }
      },
      apiKey: "sk-router",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "medium",
      speed: "fast"
    });

    expect(JSON.parse(request.init.body)).toMatchObject({
      service_tier: "priority"
    });
  });

  it("builds Xiaomi MiMo chat requests with api-key auth and thinking control", () => {
    const provider: ForgeProvider = {
      id: "xiaomi-mimo",
      label: "小米 MiMo",
      kind: "openai-compatible",
      baseUrl: "https://api.xiaomimimo.com/v1",
      requiresBaseUrl: false,
      authHeader: "api-key",
      reasoningStyle: "mimo-thinking"
    };

    const request = buildTextGenerationRequest({
      provider,
      model: { ...reasoningModel, providerId: "xiaomi-mimo", modelName: "mimo-v2.5-pro" },
      apiKey: "mimo-key",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "high"
    });
    const body = JSON.parse(request.init.body) as Record<string, unknown>;

    expect(request.url).toBe("https://api.xiaomimimo.com/v1/chat/completions");
    expect(request.init.headers.Authorization).toBeUndefined();
    expect(request.init.headers["api-key"]).toBe("mimo-key");
    expect(body).toMatchObject({
      model: "mimo-v2.5-pro",
      thinking: { type: "enabled" }
    });
    expect(body.reasoning).toBeUndefined();
  });

  it("maps low intelligence to disabled Xiaomi MiMo thinking", () => {
    const provider: ForgeProvider = {
      id: "xiaomi-mimo",
      label: "小米 MiMo",
      kind: "openai-compatible",
      baseUrl: "https://api.xiaomimimo.com/v1",
      requiresBaseUrl: false,
      authHeader: "api-key",
      reasoningStyle: "mimo-thinking"
    };

    const request = buildTextGenerationRequest({
      provider,
      model: { ...reasoningModel, providerId: "xiaomi-mimo", modelName: "mimo-v2.5-pro" },
      apiKey: "mimo-key",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "low"
    });

    expect(JSON.parse(request.init.body)).toMatchObject({
      thinking: { type: "disabled" }
    });
  });

  it("omits authorization for local OpenAI-compatible providers without API keys", () => {
    const provider: ForgeProvider = {
      id: "ollama",
      label: "Ollama",
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      requiresBaseUrl: false,
      requiresApiKey: false
    };

    const request = buildTextGenerationRequest({
      provider,
      model: { ...plainModel, providerId: "ollama", modelName: "qwen2.5-coder:7b" },
      apiKey: "",
      instructions: "You are Forge",
      input: "Plan the change",
      intelligence: "medium"
    });

    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(request.init.headers.Authorization).toBeUndefined();
  });

  it("stops before fetch when an API key contains non-ASCII header characters", () => {
    const provider: ForgeProvider = {
      id: "openrouter",
      label: "OpenRouter",
      kind: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      requiresBaseUrl: false
    };

    expect(() =>
      buildTextGenerationRequest({
        provider,
        model: plainModel,
        apiKey: "API Key：sk-router",
        instructions: "You are Forge",
        input: "Plan the change",
        intelligence: "medium"
      })
    ).toThrow("non-ASCII characters");
  });

  it("extracts generated text from supported provider responses", () => {
    expect(extractGeneratedText("openai", { output_text: "OpenAI plan" })).toBe("OpenAI plan");
    expect(
      extractGeneratedText("anthropic", {
        content: [
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "Anthropic plan" }
        ]
      })
    ).toBe("Anthropic plan");
    expect(
      extractGeneratedText("gemini", {
        candidates: [{ content: { parts: [{ text: "Gemini plan" }] } }]
      })
    ).toBe("Gemini plan");
    expect(
      extractGeneratedText("openai-compatible", {
        choices: [{ message: { content: "Compatible plan" } }]
      })
    ).toBe("Compatible plan");
  });

  it("extracts token usage from supported provider responses", () => {
    expect(
      extractTokenUsage("openai", {
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30,
          output_tokens_details: { reasoning_tokens: 4 },
          input_tokens_details: { cached_tokens: 2 }
        }
      })
    ).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      reasoningTokens: 4,
      cacheReadTokens: 2,
      cacheWriteTokens: undefined
    });
    expect(
      extractTokenUsage("anthropic", {
        usage: {
          input_tokens: 11,
          output_tokens: 21,
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 5
        }
      })
    ).toMatchObject({ inputTokens: 11, outputTokens: 21, totalTokens: 32 });
    expect(
      extractTokenUsage("gemini", {
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 22,
          totalTokenCount: 34,
          thoughtsTokenCount: 6
        }
      })
    ).toMatchObject({ inputTokens: 12, outputTokens: 22, totalTokens: 34 });
    expect(
      extractTokenUsage("openai-compatible", {
        usage: { prompt_tokens: 13, completion_tokens: 23, total_tokens: 36 }
      })
    ).toMatchObject({ inputTokens: 13, outputTokens: 23, totalTokens: 36 });
  });
});
