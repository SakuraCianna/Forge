import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, setLanguage } from "@/state/modelSettings";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel", () => {
  it("switches language through an explicit user control", async () => {
    const user = userEvent.setup();
    const onSetLanguage = vi.fn();

    render(
      <SettingsPanel
        settings={createDefaultModelSettings()}
        keyStatuses={{}}
        onDeleteProviderKey={vi.fn()}
        onFetchModels={vi.fn()}
        onAddManualModel={vi.fn()}
        onSaveProviderKey={vi.fn()}
        onSetLanguage={onSetLanguage}
        onToggleModel={vi.fn()}
        onUpdateProviderBaseUrl={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText("界面语言"), "en-US");

    expect(onSetLanguage).toHaveBeenCalledWith("en-US");
  });

  it("saves provider API keys without exposing them in settings state", async () => {
    const user = userEvent.setup();
    const onSaveProviderKey = vi.fn();

    render(
      <SettingsPanel
        settings={createDefaultModelSettings()}
        keyStatuses={{}}
        onDeleteProviderKey={vi.fn()}
        onFetchModels={vi.fn()}
        onAddManualModel={vi.fn()}
        onSaveProviderKey={onSaveProviderKey}
        onSetLanguage={vi.fn()}
        onToggleModel={vi.fn()}
        onUpdateProviderBaseUrl={vi.fn()}
      />
    );

    await user.type(screen.getAllByLabelText(/^OpenAI API Key$/)[0], "sk-secret");
    await user.click(screen.getAllByRole("button", { name: "保存 OpenAI API Key" })[0]);

    expect(onSaveProviderKey).toHaveBeenCalledWith("openai", "sk-secret");
  });

  it("edits provider Base URLs and adds manual models", async () => {
    const user = userEvent.setup();
    const onUpdateProviderBaseUrl = vi.fn();
    const onAddManualModel = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    render(
      <SettingsPanel
        settings={settings}
        keyStatuses={{}}
        onDeleteProviderKey={vi.fn()}
        onFetchModels={vi.fn()}
        onAddManualModel={onAddManualModel}
        onSaveProviderKey={vi.fn()}
        onSetLanguage={vi.fn()}
        onToggleModel={vi.fn()}
        onUpdateProviderBaseUrl={onUpdateProviderBaseUrl}
      />
    );

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
});
