import { describe, expect, it } from "vitest";
import {
  createDefaultModelSettings,
  getEnabledModels,
  loadModelSettings,
  mergeFetchedModels,
  saveModelSettings,
  setCurrentModel,
  setLanguage,
  setSpeed,
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
  it("starts with Chinese defaults and no enabled models", () => {
    const settings = createDefaultModelSettings();

    expect(settings.language).toBe("zh-CN");
    expect(settings.intelligence).toBe("high");
    expect(settings.speed).toBe("balanced");
    expect(getEnabledModels(settings)).toEqual([]);
  });

  it("only returns models explicitly enabled by the user", () => {
    let settings = createDefaultModelSettings();

    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = updateModelEnabled(settings, "anthropic:claude-sonnet", false);

    expect(getEnabledModels(settings).map((model) => model.id)).toEqual(["openai:gpt-5.5"]);
  });

  it("keeps the current model pointed at an enabled model", () => {
    let settings = createDefaultModelSettings();

    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = setCurrentModel(settings, "openai:gpt-5.5");

    expect(settings.currentModelId).toBe("openai:gpt-5.5");
  });

  it("persists user-facing settings and enabled model choices", () => {
    const storage = createMemoryStorage();
    let settings = createDefaultModelSettings();

    settings = setLanguage(settings, "en-US");
    settings = setSpeed(settings, "careful");
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = setCurrentModel(settings, "openai:gpt-5.5");

    saveModelSettings(storage, settings);

    const loaded = loadModelSettings(storage);

    expect(loaded.language).toBe("en-US");
    expect(loaded.speed).toBe("careful");
    expect(loaded.currentModelId).toBe("openai:gpt-5.5");
    expect(getEnabledModels(loaded).map((model) => model.id)).toEqual(["openai:gpt-5.5"]);
  });

  it("falls back to defaults when persisted settings are invalid", () => {
    const storage = createMemoryStorage("{ bad json");

    const loaded = loadModelSettings(storage);

    expect(loaded.language).toBe("zh-CN");
    expect(loaded.currentModelId).toBeNull();
    expect(getEnabledModels(loaded)).toEqual([]);
  });

  it("merges fetched provider models without enabling them by default", () => {
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
