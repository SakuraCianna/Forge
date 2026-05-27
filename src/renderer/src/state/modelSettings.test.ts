import { describe, expect, it } from "vitest";
import {
  createDefaultModelSettings,
  getEnabledModels,
  setCurrentModel,
  updateModelEnabled
} from "./modelSettings";

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
});
