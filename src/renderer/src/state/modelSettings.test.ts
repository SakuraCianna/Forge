import { describe, expect, it } from "vitest";
import {
  addCustomProvider,
  createDefaultModelSettings,
  deleteCustomProvider,
  getEnabledModels,
  loadModelSettings,
  mergeFetchedModels,
  removeProviderModels,
  saveModelSettings,
  setCurrentModel,
  setLanguage,
  setSpeed,
  updateModelEnabled,
  updateProviderLabel,
  updateProviderBaseUrl
} from "./modelSettings";

function createMemoryStorage(initialValue?: string): Storage {
  const values = new Map<string, string>();

  if (initialValue) {
    values.set("forge.modelSettings", initialValue);
  }

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("modelSettings", () => {
  it("starts with Chinese defaults and no models before the user fetches them", () => {
    const settings = createDefaultModelSettings();

    expect(settings.language).toBe("zh-CN");
    expect(settings.intelligence).toBe("high");
    expect(settings.speed).toBe("balanced");
    expect(settings.currentModelId).toBeNull();
    expect(getEnabledModels(settings)).toEqual([]);
    expect(settings.providers.map((provider) => provider.id)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "openrouter",
      "deepseek",
      "moonshot",
      "qwen-dashscope",
      "qwen-dashscope-intl",
      "zhipu",
      "zai",
      "zai-coding",
      "minimax-cn",
      "minimax",
      "siliconflow",
      "volcengine-ark",
      "baidu-qianfan",
      "baidu-qianfan-intl",
      "tencent-hunyuan",
      "groq",
      "together",
      "mistral",
      "xai",
      "fireworks",
      "cerebras",
      "stepfun",
      "modelscope",
      "xiaomi-mimo",
      "xiaomi-mimo-token",
      "github-models",
      "ollama"
    ]);
  });

  it("keeps fetched models disabled until the user enables them", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      createFetchedModel("anthropic", "claude-sonnet", "Claude Sonnet")
    ]);

    expect(settings.models.map((model) => model.id)).toContain("anthropic:claude-sonnet");
    expect(getEnabledModels(settings)).toEqual([]);
    expect(settings.currentModelId).toBeNull();
  });

  it("keeps the current model pointed at an enabled model", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = setCurrentModel(settings, "openai:gpt-5.5");

    expect(settings.currentModelId).toBe("openai:gpt-5.5");
  });

  it("enables and disables fetched models explicitly", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5"),
      createFetchedModel("deepseek", "deepseek-chat", "deepseek-chat")
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);

    expect(settings.currentModelId).toBe("openai:gpt-5.5");
    expect(getEnabledModels(settings).map((model) => model.id)).toEqual(["openai:gpt-5.5"]);

    settings = updateModelEnabled(settings, "openai:gpt-5.5", false);

    expect(settings.currentModelId).toBeNull();
    expect(getEnabledModels(settings)).toEqual([]);
  });

  it("sorts selected and frequently used enabled models first", () => {
    const settings = {
      ...createDefaultModelSettings(),
      currentModelId: "deepseek:deepseek-chat",
      models: [
        {
          ...createFetchedModel("openai", "rare", "Rare"),
          enabled: true
        },
        {
          ...createFetchedModel("openai", "frequent", "Frequent"),
          enabled: true,
          selectionCount: 8,
          lastSelectedAt: "2026-05-27T13:00:00.000Z"
        },
        {
          ...createFetchedModel("deepseek", "deepseek-chat", "DeepSeek Chat"),
          enabled: true,
          selectionCount: 1,
          lastSelectedAt: "2026-05-26T13:00:00.000Z"
        }
      ]
    };

    expect(getEnabledModels(settings).map((model) => model.id)).toEqual([
      "deepseek:deepseek-chat",
      "openai:frequent",
      "openai:rare"
    ]);
  });

  it("persists user-facing settings and enabled model choices", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = setLanguage(settings, "en-US");
    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = setCurrentModel(settings, "openai:gpt-5.5");
    settings = setSpeed(settings, "fast");

    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.language).toBe("en-US");
    expect(loaded.speed).toBe("fast");
    expect(loaded.currentModelId).toBe("openai:gpt-5.5");
    expect(getEnabledModels(loaded).map((model) => model.id)).toContain("openai:gpt-5.5");
  });

  it("coerces legacy careful speed settings back to standard", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        language: "en-US",
        speed: "careful",
        detectedModels: []
      })
    );

    const loaded = loadModelSettings(storage);

    expect(loaded.speed).toBe("balanced");
  });

  it("resets fast speed when the current model does not support speed modes", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      {
        id: "openai:gpt-5.5",
        providerId: "openai",
        label: "GPT-5.5",
        modelName: "gpt-5.5",
        enabled: true,
        capabilities: {
          reasoning: { type: "none" },
          toolCalling: "unknown",
          streaming: "unknown",
          vision: "unknown",
          speedModes: ["balanced", "fast"]
        },
        capabilitySource: "provider-api"
      },
      {
        id: "deepseek:deepseek-v4-flash",
        providerId: "deepseek",
        label: "deepseek-v4-flash",
        modelName: "deepseek-v4-flash",
        enabled: true,
        capabilities: {
          reasoning: { type: "none" },
          toolCalling: "unknown",
          streaming: "unknown",
          vision: "unknown"
        },
        capabilitySource: "provider-api"
      }
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = updateModelEnabled(settings, "deepseek:deepseek-v4-flash", true);
    settings = setCurrentModel(settings, "openai:gpt-5.5");
    settings = setSpeed(settings, "fast");
    settings = setCurrentModel(settings, "deepseek:deepseek-v4-flash");

    expect(settings.speed).toBe("balanced");
  });

  it("persists provider Base URL overrides", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = addCustomProvider(settings, "Cherry Gateway", "https://gateway.example/v1");
    settings = updateProviderBaseUrl(settings, "custom-cherry-gateway", "https://example.com/api/v1");
    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.providers.find((provider) => provider.id === "custom-cherry-gateway")?.baseUrl).toBe(
      "https://example.com/api/v1"
    );
  });

  it("persists fetched provider models and restores them from storage", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.models.map((model) => model.id)).toContain("openai:gpt-5.5");
    expect(getEnabledModels(loaded)).toEqual([]);
    expect(loaded.currentModelId).toBeNull();
  });

  it("drops persisted provider models that are not usable for coding tasks", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        detectedModels: [
          { providerId: "xiaomi-mimo-token", modelName: "mimo-v2-pro", label: "mimo-v2-pro" },
          { providerId: "xiaomi-mimo-token", modelName: "mimo-v2-tts", label: "mimo-v2-tts" }
        ]
      })
    );

    const loaded = loadModelSettings(storage);

    expect(loaded.models.map((model) => model.modelName)).toEqual(["mimo-v2-pro"]);
    expect(getEnabledModels(loaded)).toEqual([]);
  });

  it("adds unlimited custom API profiles and restores them from storage", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = addCustomProvider(settings, "Cherry Gateway", "https://gateway.example/v1");
    const provider = settings.providers.find((candidate) => candidate.id === "custom-cherry-gateway");

    expect(provider).toMatchObject({
      label: "Cherry Gateway",
      kind: "openai-compatible",
      custom: true,
      baseUrl: "https://gateway.example/v1"
    });

    settings = updateProviderLabel(settings, "custom-cherry-gateway", "Campus Gateway");
    settings = mergeFetchedModels(settings, [
      createFetchedModel("custom-cherry-gateway", "deepseek-chat", "deepseek-chat")
    ]);
    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.providers.find((candidate) => candidate.id === "custom-cherry-gateway")).toMatchObject({
      label: "Campus Gateway",
      custom: true,
      baseUrl: "https://gateway.example/v1"
    });
    expect(loaded.models.map((model) => model.id)).toContain(
      "custom-cherry-gateway:deepseek-chat"
    );
  });

  it("keeps custom API profile labels unique", () => {
    let settings = createDefaultModelSettings();

    settings = addCustomProvider(settings, "Custom Provider", "https://one.example/v1");
    settings = addCustomProvider(settings, "Custom Provider", "https://two.example/v1");

    expect(settings.providers.filter((provider) => provider.custom).map((provider) => provider.label)).toEqual([
      "Custom Provider",
      "Custom Provider 2"
    ]);

    settings = updateProviderLabel(settings, "custom-custom-provider-2", "Custom Provider");

    expect(settings.providers.find((provider) => provider.id === "custom-custom-provider-2")?.label).toBe(
      "Custom Provider 2"
    );
  });

  it("deletes custom API profiles without touching built-in providers", () => {
    let settings = createDefaultModelSettings();

    settings = addCustomProvider(settings, "Cherry Gateway", "https://gateway.example/v1");
    settings = mergeFetchedModels(settings, [
      createFetchedModel("custom-cherry-gateway", "deepseek-chat", "deepseek-chat")
    ]);
    settings = deleteCustomProvider(settings, "custom-cherry-gateway");

    expect(settings.providers.some((provider) => provider.id === "custom-cherry-gateway")).toBe(false);
    expect(settings.models.some((model) => model.providerId === "custom-cherry-gateway")).toBe(false);

    const unchanged = deleteCustomProvider(settings, "openai");

    expect(unchanged.providers.some((provider) => provider.id === "openai")).toBe(true);
  });

  it("removes provider models when the provider key is deleted", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = removeProviderModels(settings, "openai");

    expect(settings.currentModelId).toBeNull();
    expect(settings.models).toEqual([]);
  });

  it("falls back to defaults when persisted settings are invalid", () => {
    const storage = createMemoryStorage("{ bad json");

    const loaded = loadModelSettings(storage);

    expect(loaded.language).toBe("zh-CN");
    expect(loaded.currentModelId).toBeNull();
    expect(getEnabledModels(loaded)).toEqual([]);
  });

  it("merges fetched provider models as disabled until explicitly enabled", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      {
        id: "openai:gpt-5.6",
        providerId: "openai",
        label: "GPT-5.6",
        modelName: "gpt-5.6",
        enabled: false,
        capabilities: {
          reasoning: { type: "none" },
          toolCalling: "unknown",
          streaming: "unknown",
          vision: "unknown"
        },
        capabilitySource: "provider-api"
      }
    ]);

    expect(settings.models.some((model) => model.id === "openai:gpt-5.6")).toBe(true);
    expect(getEnabledModels(settings)).toEqual([]);
  });
});

function createFetchedModel(providerId: string, modelName: string, label: string) {
  return {
    id: `${providerId}:${modelName}`,
    providerId,
    label,
    modelName,
    enabled: false,
    capabilities: {
      reasoning: { type: "none" as const },
      toolCalling: "unknown" as const,
      streaming: "unknown" as const,
      vision: "unknown" as const
    },
    capabilitySource: "provider-api" as const
  };
}
