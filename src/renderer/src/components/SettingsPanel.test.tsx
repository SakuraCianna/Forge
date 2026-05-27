import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings } from "@/state/modelSettings";
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
        onSaveProviderKey={vi.fn()}
        onSetLanguage={onSetLanguage}
        onToggleModel={vi.fn()}
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
        onSaveProviderKey={onSaveProviderKey}
        onSetLanguage={vi.fn()}
        onToggleModel={vi.fn()}
      />
    );

    await user.type(screen.getAllByLabelText(/^OpenAI API Key$/)[0], "sk-secret");
    await user.click(screen.getAllByRole("button", { name: "保存 OpenAI API Key" })[0]);

    expect(onSaveProviderKey).toHaveBeenCalledWith("openai", "sk-secret");
  });
});
