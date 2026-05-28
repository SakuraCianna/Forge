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
      "gemini"
    ]);
  });

  it("keeps fetched models available without a manual enable step", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      createFetchedModel("anthropic", "claude-sonnet", "Claude Sonnet")
    ]);

    expect(getEnabledModels(settings).map((model) => model.id)).toContain(
      "anthropic:claude-sonnet"
    );
  });

  it("keeps the current model pointed at an enabled model", () => {
    let settings = createDefaultModelSettings();

    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = setCurrentModel(settings, "openai:gpt-5.5");

    expect(settings.currentModelId).toBe("openai:gpt-5.5");
  });

  it("persists user-facing settings and enabled model choices", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = setLanguage(settings, "en-US");
    settings = setSpeed(settings, "careful");
    settings = mergeFetchedModels(settings, [
      createFetchedModel("openai", "gpt-5.5", "GPT-5.5")
    ]);
    settings = setCurrentModel(settings, "openai:gpt-5.5");

    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.language).toBe("en-US");
    expect(loaded.speed).toBe("careful");
    expect(loaded.currentModelId).toBe("openai:gpt-5.5");
    expect(getEnabledModels(loaded).map((model) => model.id)).toContain("openai:gpt-5.5");
  });

  it("persists provider Base URL overrides", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = addCustomProvider(settings, "OpenRouter", "https://openrouter.ai/api/v1");
    settings = updateProviderBaseUrl(settings, "custom-openrouter", "https://example.com/api/v1");
    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.providers.find((provider) => provider.id === "custom-openrouter")?.baseUrl).toBe(
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

    expect(getEnabledModels(loaded).map((model) => model.id)).toContain("openai:gpt-5.5");
    expect(loaded.currentModelId).toBe("openai:gpt-5.5");
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
    expect(getEnabledModels(loaded).map((model) => model.id)).toContain(
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

  it("merges fetched provider models as immediately available", () => {
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
    expect(getEnabledModels(settings).map((model) => model.id)).toContain("openai:gpt-5.6");
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
