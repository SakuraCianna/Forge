import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, setLanguage } from "@/state/modelSettings";
import { createDefaultPersonalizationSettings } from "@/state/personalization";
import { SettingsPanel } from "./SettingsPanel";

function renderSettingsPanel(overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const settings = overrides.settings ?? setLanguage(createDefaultModelSettings(), "en-US");

  return render(
    <SettingsPanel
      settings={settings}
      keyStatuses={{}}
      onClearUsage={vi.fn()}
      onDeleteProviderKey={vi.fn()}
      onFetchModels={vi.fn()}
      onAddManualModel={vi.fn()}
      onSaveProviderKey={vi.fn()}
      onSetLanguage={vi.fn()}
      onUpdatePersonalization={vi.fn()}
      onUpdateProviderBaseUrl={vi.fn()}
      onUpdateUsageRate={vi.fn()}
      personalization={createDefaultPersonalizationSettings()}
      usageEvents={[]}
      usageRates={{}}
      {...overrides}
    />
  );
}

describe("SettingsPanel", () => {
  it("switches language through an explicit user control", async () => {
    const user = userEvent.setup();
    const onSetLanguage = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings, onSetLanguage });

    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.selectOptions(screen.getByLabelText("Interface language"), "zh-CN");

    expect(onSetLanguage).toHaveBeenCalledWith("zh-CN");
  });

  it("saves provider API keys without exposing them in settings state", async () => {
    const user = userEvent.setup();
    const onSaveProviderKey = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings, onSaveProviderKey });

    await user.click(screen.getByRole("button", { name: /Model providers/ }));
    await user.type(screen.getAllByLabelText(/^OpenAI API Key$/)[0], "sk-secret");
    await user.click(screen.getAllByRole("button", { name: "Save OpenAI API Key" })[0]);

    expect(onSaveProviderKey).toHaveBeenCalledWith("openai", "sk-secret");
  });

  it("edits provider Base URLs and adds manual models", async () => {
    const user = userEvent.setup();
    const onUpdateProviderBaseUrl = vi.fn();
    const onAddManualModel = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings, onAddManualModel, onUpdateProviderBaseUrl });

    await user.click(screen.getByRole("button", { name: /Model providers/ }));
    await user.click(screen.getByRole("button", { name: "Configure OpenRouter" }));
    await user.clear(screen.getByLabelText("OpenRouter Base URL"));
    await user.type(screen.getByLabelText("OpenRouter Base URL"), "https://gateway.example/v1");
    await user.type(screen.getByLabelText("OpenRouter model ID"), "moonshot-v1");
    await user.click(screen.getByRole("button", { name: "Add model OpenRouter" }));

    expect(onUpdateProviderBaseUrl).toHaveBeenLastCalledWith(
      "openrouter",
      "https://gateway.example/v1"
    );
    expect(onAddManualModel).toHaveBeenCalledWith("openrouter", "moonshot-v1");
  });

  it("edits usage rates and personalization settings", async () => {
    const user = userEvent.setup();
    const onUpdateUsageRate = vi.fn();
    const onUpdatePersonalization = vi.fn();

    renderSettingsPanel({ onUpdateUsageRate, onUpdatePersonalization });

    await user.click(screen.getByRole("button", { name: /Usage and billing/ }));
    await user.clear(screen.getAllByLabelText("Input price / 1M")[0]);
    await user.type(screen.getAllByLabelText("Input price / 1M")[0], "5");

    expect(onUpdateUsageRate).toHaveBeenLastCalledWith(
      "openai",
      expect.objectContaining({ inputPerMillion: 5 })
    );

    await user.click(screen.getByRole("button", { name: /Personalization/ }));
    await user.selectOptions(screen.getByLabelText("Response style"), "technical");

    expect(onUpdatePersonalization).toHaveBeenLastCalledWith(
      expect.objectContaining({ replyTone: "technical" })
    );
  });
});
