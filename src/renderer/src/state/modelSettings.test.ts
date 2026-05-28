import { describe, expect, it } from "vitest";
import {
  addCustomProvider,
  createDefaultModelSettings,
  addManualModel,
  deleteCustomProvider,
  getEnabledModels,
  loadModelSettings,
  mergeFetchedModels,
  saveModelSettings,
  setCurrentModel,
  setLanguage,
  setSpeed,
  updateProviderLabel,
  updateProviderBaseUrl,
  updateModelEnabled
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
  it("starts with Chinese defaults and all known models available", () => {
    const settings = createDefaultModelSettings();

    expect(settings.language).toBe("zh-CN");
    expect(settings.intelligence).toBe("high");
    expect(settings.speed).toBe("balanced");
    expect(settings.currentModelId).toBe("openai:gpt-5.5");
    expect(getEnabledModels(settings).map((model) => model.id)).toEqual([
      "openai:gpt-5.5",
      "anthropic:claude-sonnet",
      "gemini:gemini-2.5-pro"
    ]);
  });

  it("keeps detected models available without a manual enable step", () => {
    let settings = createDefaultModelSettings();

    settings = updateModelEnabled(settings, "anthropic:claude-sonnet", false);

    expect(getEnabledModels(settings).map((model) => model.id)).toContain(
      "anthropic:claude-sonnet"
    );
  });

  it("keeps the current model pointed at an enabled model", () => {
    let settings = createDefaultModelSettings();

    settings = setCurrentModel(settings, "openai:gpt-5.5");

    expect(settings.currentModelId).toBe("openai:gpt-5.5");
  });

  it("persists user-facing settings and enabled model choices", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = setLanguage(settings, "en-US");
    settings = setSpeed(settings, "careful");
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

    settings = updateProviderBaseUrl(settings, "openrouter", "https://example.com/api/v1");
    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.providers.find((provider) => provider.id === "openrouter")?.baseUrl).toBe(
      "https://example.com/api/v1"
    );
  });

  it("adds manual provider models and restores them from storage", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = addManualModel(settings, "openrouter", "moonshot-v1");
    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(getEnabledModels(loaded).map((model) => model.id)).toContain("openrouter:moonshot-v1");
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
    settings = addManualModel(settings, "custom-cherry-gateway", "deepseek-chat");
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

  it("deletes custom API profiles without touching built-in providers", () => {
    let settings = createDefaultModelSettings();

    settings = addCustomProvider(settings, "Cherry Gateway", "https://gateway.example/v1");
    settings = addManualModel(settings, "custom-cherry-gateway", "deepseek-chat");
    settings = deleteCustomProvider(settings, "custom-cherry-gateway");

    expect(settings.providers.some((provider) => provider.id === "custom-cherry-gateway")).toBe(false);
    expect(settings.models.some((model) => model.providerId === "custom-cherry-gateway")).toBe(false);

    const unchanged = deleteCustomProvider(settings, "openai");

    expect(unchanged.providers.some((provider) => provider.id === "openai")).toBe(true);
  });

  it("falls back to defaults when persisted settings are invalid", () => {
    const storage = createMemoryStorage("{ bad json");

    const loaded = loadModelSettings(storage);

    expect(loaded.language).toBe("zh-CN");
    expect(loaded.currentModelId).toBe("openai:gpt-5.5");
    expect(getEnabledModels(loaded).length).toBeGreaterThan(0);
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
