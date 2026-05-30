// 本文件说明: 验证远端模型列表筛选, 能力推断和请求头清理
import { describe, expect, it } from "vitest";
import type { ForgeProvider } from "@shared/modelTypes";
import { hydrateProviderFromCatalog, providerCatalog } from "@shared/providerCatalog";
import {
  assertHeaderValue,
  buildModelListRequest,
  parseProviderModelList,
  toForgeModel
} from "@shared/providerModels";

const openaiProvider: ForgeProvider = {
  id: "openai",
  label: "OpenAI",
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  requiresBaseUrl: false
};

const anthropicProvider: ForgeProvider = {
  id: "anthropic",
  label: "Anthropic",
  kind: "anthropic",
  baseUrl: "https://api.anthropic.com",
  requiresBaseUrl: false
};

const geminiProvider: ForgeProvider = {
  id: "gemini",
  label: "Gemini",
  kind: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  requiresBaseUrl: false
};

describe("provider model adapters", () => {
  it("builds an OpenAI compatible model list request", () => {
    const request = buildModelListRequest(openaiProvider, "Bearer sk-test");

    expect(request.url).toBe("https://api.openai.com/v1/models");
    expect(request.headers.Authorization).toBe("Bearer sk-test");
  });

  it("builds Xiaomi MiMo model list requests with api-key auth", () => {
    const xiaomiProvider = providerCatalog.find((provider) => provider.id === "xiaomi-mimo")!;
    const request = buildModelListRequest(xiaomiProvider, "mimo-test");

    expect(request.url).toBe("https://api.xiaomimimo.com/v1/models");
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.headers["api-key"]).toBe("mimo-test");
  });

  it("rejects non-ASCII values before they enter fetch headers", () => {
    expect(() => assertHeaderValue("Authorization", "Bearer API Key：sk-test")).toThrow(
      "包含非 ASCII 字符"
    );
  });

  it("builds no-key Ollama model requests against the tags endpoint", () => {
    const ollamaProvider = providerCatalog.find((provider) => provider.id === "ollama");

    expect(ollamaProvider).toBeDefined();

    const request = buildModelListRequest(ollamaProvider!, "");

    expect(request.url).toBe("http://localhost:11434/api/tags");
    expect(request.headers.Authorization).toBeUndefined();
  });

  it("keeps official and plan-specific provider base URLs distinct", () => {
    expect(providerCatalog.find((provider) => provider.id === "deepseek")?.baseUrl).toBe(
      "https://api.deepseek.com"
    );
    expect(providerCatalog.find((provider) => provider.id === "moonshot")?.baseUrl).toBe(
      "https://api.moonshot.cn/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "qwen-dashscope")?.baseUrl).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "qwen-dashscope-intl")?.baseUrl).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "siliconflow")?.baseUrl).toBe(
      "https://api.siliconflow.cn/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "volcengine-ark")?.baseUrl).toBe(
      "https://ark.cn-beijing.volces.com/api/v3"
    );
    expect(providerCatalog.find((provider) => provider.id === "baidu-qianfan-intl")?.baseUrl).toBe(
      "https://api.baiduqianfan.ai/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "zai")?.baseUrl).toBe(
      "https://api.z.ai/api/paas/v4"
    );
    expect(providerCatalog.find((provider) => provider.id === "zai-coding")?.baseUrl).toBe(
      "https://api.z.ai/api/coding/paas/v4"
    );
    expect(providerCatalog.find((provider) => provider.id === "minimax-cn")?.baseUrl).toBe(
      "https://api.minimaxi.com/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "tencent-hunyuan")?.baseUrl).toBe(
      "https://tokenhub.tencentmaas.com/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "openrouter")?.baseUrl).toBe(
      "https://openrouter.ai/api/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "groq")?.baseUrl).toBe(
      "https://api.groq.com/openai/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "together")?.baseUrl).toBe(
      "https://api.together.xyz/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "mistral")?.baseUrl).toBe(
      "https://api.mistral.ai/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "xai")?.baseUrl).toBe(
      "https://api.x.ai/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "fireworks")?.baseUrl).toBe(
      "https://api.fireworks.ai/inference/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "cerebras")?.baseUrl).toBe(
      "https://api.cerebras.ai/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "xiaomi-mimo")?.baseUrl).toBe(
      "https://api.xiaomimimo.com/v1"
    );
    expect(providerCatalog.find((provider) => provider.id === "xiaomi-mimo-token")?.baseUrl).toBe(
      "https://token-plan-cn.xiaomimimo.com/v1"
    );
  });

  it("hydrates stale built-in provider objects from the catalog", () => {
    const hydrated = hydrateProviderFromCatalog({
      id: "ollama",
      label: "Ollama",
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      requiresBaseUrl: false
    });

    expect(hydrated).toMatchObject({
      modelListUrl: "http://localhost:11434/api/tags",
      requiresApiKey: false,
      icon: "OL",
      iconAsset: "ollama"
    });
  });

  it("requires a base URL when no explicit model list URL exists", () => {
    expect(() =>
      buildModelListRequest(
        {
          id: "custom-empty",
          label: "Custom",
          kind: "openai-compatible",
          requiresBaseUrl: true
        },
        "sk-test"
      )
    ).toThrow("Custom Base URL 未配置");
  });

  it("builds an Anthropic model list request with Anthropic headers", () => {
    const request = buildModelListRequest(anthropicProvider, "sk-ant-test");

    expect(request.url).toBe("https://api.anthropic.com/v1/models");
    expect(request.headers["x-api-key"]).toBe("sk-ant-test");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("builds a Gemini model list request with key query parameter", () => {
    const request = buildModelListRequest(geminiProvider, "gemini-key");

    expect(request.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key");
    expect(request.headers.Authorization).toBeUndefined();
  });

  it("parses OpenAI compatible model list responses", () => {
    const models = parseProviderModelList(openaiProvider, {
      data: [{ id: "gpt-5.5" }, { id: "gpt-5.5-mini" }]
    });

    expect(models).toEqual([
      { id: "gpt-5.5", label: "gpt-5.5" },
      { id: "gpt-5.5-mini", label: "gpt-5.5-mini" }
    ]);
  });

  it("parses Anthropic model list responses", () => {
    const models = parseProviderModelList(anthropicProvider, {
      data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }]
    });

    expect(models).toEqual([{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }]);
  });

  it("parses Gemini model list responses", () => {
    const models = parseProviderModelList(geminiProvider, {
      models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro" }]
    });

    expect(models).toEqual([{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }]);
  });

  it("parses Ollama model list responses", () => {
    const ollamaProvider = providerCatalog.find((provider) => provider.id === "ollama")!;
    const models = parseProviderModelList(ollamaProvider, {
      models: [{ name: "qwen2.5-coder:7b" }]
    });

    expect(models).toEqual([{ id: "qwen2.5-coder:7b", label: "qwen2.5-coder:7b" }]);
  });

  it("filters provider models that cannot be used for coding tasks", () => {
    const xiaomiProvider = providerCatalog.find((provider) => provider.id === "xiaomi-mimo-token")!;
    const models = parseProviderModelList(xiaomiProvider, {
      data: [
        { id: "mimo-v2-pro" },
        { id: "mimo-v2-tts" },
        { id: "mimo-v2.5-tts-voiceclone" },
        { id: "text-embedding-v1" },
        { id: "mimo-v2.5-omni" }
      ]
    });

    expect(models.map((model) => model.id)).toEqual(["mimo-v2-pro", "mimo-v2.5-omni"]);
  });

  it("filters non-text output models before they enter coding model selection", () => {
    const models = parseProviderModelList(openaiProvider, {
      data: [
        { id: "gpt-5.5", output_modalities: ["text"] },
        { id: "gpt-audio-preview", output_modalities: ["audio"] }
      ]
    });

    expect(models.map((model) => model.id)).toEqual(["gpt-5.5"]);
  });

  it("preserves OpenRouter service tier metadata for speed-capable models", () => {
    const openRouterProvider = providerCatalog.find((provider) => provider.id === "openrouter")!;
    const models = parseProviderModelList(openRouterProvider, {
      data: [
        {
          id: "openai/gpt-5",
          name: "GPT-5",
          supported_parameters: ["tools", "service_tier"]
        }
      ]
    });
    const model = toForgeModel(openRouterProvider, models[0]);

    expect(models[0]).toMatchObject({
      id: "openai/gpt-5",
      label: "GPT-5",
      supportedParameters: ["tools", "service_tier"]
    });
    expect(model.capabilities.speedModes).toEqual(["balanced", "fast"]);
  });

  it("parses OpenRouter context length and token pricing metadata when available", () => {
    const openRouterProvider = providerCatalog.find((provider) => provider.id === "openrouter")!;
    const models = parseProviderModelList(openRouterProvider, {
      data: [
        {
          id: "openai/gpt-5-mini",
          name: "GPT-5 Mini",
          context_length: 272000,
          pricing: {
            prompt: "0.00000025",
            completion: "0.000002"
          }
        }
      ]
    });
    const model = toForgeModel(openRouterProvider, models[0]);

    expect(model.capabilities.contextWindow).toBe(272000);
    expect(model.pricing).toEqual({
      inputPerMillion: 0.25,
      outputPerMillion: 2
    });
  });

  it("parses direct array catalog responses", () => {
    const githubProvider = providerCatalog.find((provider) => provider.id === "github-models")!;
    const models = parseProviderModelList(githubProvider, [
      { id: "openai/gpt-4.1", name: "GPT-4.1" }
    ]);

    expect(models).toEqual([{ id: "openai/gpt-4.1", label: "GPT-4.1" }]);
  });

  it("converts fetched metadata into a disabled Forge model", () => {
    const model = toForgeModel(openaiProvider, { id: "gpt-5.5", label: "GPT-5.5" });

    expect(model).toMatchObject({
      id: "openai:gpt-5.5",
      providerId: "openai",
      label: "GPT-5.5",
      modelName: "gpt-5.5",
      enabled: false,
      capabilitySource: "provider-api"
    });
  });

  it("infers Xiaomi MiMo thinking support for adjustable models", () => {
    const xiaomiProvider = providerCatalog.find((provider) => provider.id === "xiaomi-mimo")!;
    const thinkingModel = toForgeModel(xiaomiProvider, {
      id: "mimo-v2.5-pro",
      label: "mimo-v2.5-pro"
    });
    const ttsModel = toForgeModel(xiaomiProvider, {
      id: "mimo-v2.5-tts",
      label: "mimo-v2.5-tts"
    });

    expect(thinkingModel.capabilities.reasoning).toEqual({
      type: "effort",
      values: ["low", "medium", "high", "xhigh"]
    });
    expect(ttsModel.capabilities.reasoning).toEqual({ type: "none" });
  });
});
