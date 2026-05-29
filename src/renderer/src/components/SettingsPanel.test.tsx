import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, mergeFetchedModels, setLanguage } from "@/state/modelSettings";
import { createDefaultGeneralPreferences } from "@/state/generalPreferences";
import { createDefaultPersonalizationSettings } from "@/state/personalization";
import { SettingsPanel } from "./SettingsPanel";

function renderSettingsPanel(overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const settings = overrides.settings ?? setLanguage(createDefaultModelSettings(), "en-US");

  return render(
    <SettingsPanel
      settings={settings}
      generalPreferences={createDefaultGeneralPreferences()}
      keyStatuses={{}}
      onClearUsage={vi.fn()}
      onDeleteProviderKey={vi.fn()}
      onFetchModels={vi.fn()}
      onAddProvider={vi.fn()}
      onDeleteProvider={vi.fn()}
      onSaveProviderKey={vi.fn()}
      onSetLanguage={vi.fn()}
      onUpdateGeneralPreferences={vi.fn()}
      onToggleModelEnabled={vi.fn()}
      onSelectModel={vi.fn()}
      onUpdatePersonalization={vi.fn()}
      onUpdateProviderBaseUrl={vi.fn()}
      onUpdateProviderLabel={vi.fn()}
      onUpdateUsageRate={vi.fn()}
      providerFetchStates={{}}
      archivedThreads={[]}
      onRestoreArchivedThread={vi.fn()}
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
    await user.click(screen.getByRole("button", { name: /Interface language/ }));
    await user.click(screen.getByRole("menuitem", { name: "中文" }));

    expect(onSetLanguage).toHaveBeenCalledWith("zh-CN");
  });

  it("updates Codex-like general preferences", async () => {
    const user = userEvent.setup();
    const onUpdateGeneralPreferences = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings, onUpdateGeneralPreferences });

    await user.click(screen.getByRole("button", { name: /General/ }));
    await user.click(screen.getByRole("button", { name: /Daily work/ }));

    expect(onUpdateGeneralPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ workMode: "daily" })
    );

    await user.click(screen.getByRole("button", { name: "Auto review" }));

    expect(onUpdateGeneralPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ autoReview: false })
    );
  });

  it("shows wallpaper controls in general preferences", async () => {
    const user = userEvent.setup();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");
    const preferences = {
      ...createDefaultGeneralPreferences(),
      backgroundImageDataUrl: "data:image/png;base64,abc",
      backgroundOpacity: 0.2
    };
    const onUpdateGeneralPreferences = vi.fn();

    renderSettingsPanel({ settings, generalPreferences: preferences, onUpdateGeneralPreferences });

    await user.click(screen.getByRole("button", { name: /General/ }));

    expect(screen.getByText("App background")).toBeInTheDocument();
    expect(screen.getByTestId("wallpaper-settings-panel")).toHaveClass("min-h-[156px]");
    expect(screen.getByTestId("wallpaper-preview")).toHaveStyle({
      backgroundImage: "url(data:image/png;base64,abc)"
    });
    expect(screen.getByLabelText("App background opacity")).toHaveValue("20");

    await user.click(screen.getByRole("button", { name: "Clear background image" }));

    expect(onUpdateGeneralPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundImageDataUrl: null })
    );
  });

  it("saves provider API keys without exposing them in settings state", async () => {
    const user = userEvent.setup();
    const onSaveProviderKey = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings, onSaveProviderKey });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));
    await user.type(screen.getAllByLabelText(/^OpenAI API Key$/)[0], "sk-secret");
    await user.click(screen.getAllByRole("button", { name: "Save OpenAI API Key" })[0]);

    expect(onSaveProviderKey).toHaveBeenCalledWith("openai", "sk-secret");
  });

  it("edits provider Base URLs without manual model entry", async () => {
    const user = userEvent.setup();
    const onUpdateProviderBaseUrl = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings, onUpdateProviderBaseUrl });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));
    await user.clear(screen.getByLabelText("OpenAI Base URL"));
    await user.type(screen.getByLabelText("OpenAI Base URL"), "https://gateway.example/v1");

    expect(onUpdateProviderBaseUrl).toHaveBeenLastCalledWith(
      "openai",
      "https://gateway.example/v1"
    );
    expect(screen.queryByLabelText(/model ID/)).not.toBeInTheDocument();
  });

  it("mounts only the expanded API profile details to avoid hidden form layout work", async () => {
    const user = userEvent.setup();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));

    expect(screen.getAllByTestId("provider-profile-details")).toHaveLength(1);
    expect(screen.getByLabelText("OpenAI Base URL")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Configure Anthropic/ }));

    expect(screen.getAllByTestId("provider-profile-details")).toHaveLength(1);
    expect(screen.queryByLabelText("OpenAI Base URL")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Anthropic Base URL")).toBeInTheDocument();
  });

  it("adds custom OpenAI-compatible API profiles without a fixed key limit", async () => {
    const user = userEvent.setup();
    const onAddProvider = vi.fn();

    renderSettingsPanel({ onAddProvider });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));
    await user.type(screen.getByLabelText("Profile name"), "Cherry Gateway");
    await user.type(screen.getByLabelText("Base URL"), "https://gateway.example/v1");
    await user.click(screen.getByRole("button", { name: "Add API profile" }));

    expect(onAddProvider).toHaveBeenCalledWith(
      "Cherry Gateway",
      "https://gateway.example/v1"
    );
  });

  it("edits usage rates from collapsed provider groups and personalization settings", async () => {
    const user = userEvent.setup();
    const onUpdateUsageRate = vi.fn();
    const onUpdatePersonalization = vi.fn();
    const settings = mergeFetchedModels(setLanguage(createDefaultModelSettings(), "en-US"), [
      {
        id: "openai:gpt-4.1",
        providerId: "openai",
        label: "GPT-4.1",
        modelName: "gpt-4.1",
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

    renderSettingsPanel({ settings, onUpdateUsageRate, onUpdatePersonalization });

    await user.click(screen.getByRole("button", { name: /Usage and billing/ }));

    expect(screen.queryByLabelText("Input price / 1M")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /OpenAI/ }));
    await user.clear(screen.getByLabelText("Model input price / 1M"));
    await user.type(screen.getByLabelText("Model input price / 1M"), "5");

    expect(onUpdateUsageRate).toHaveBeenLastCalledWith(
      "openai:gpt-4.1",
      expect.objectContaining({ inputPerMillion: 5 })
    );

    await user.click(screen.getByRole("button", { name: /Personalization/ }));
    await user.click(screen.getByRole("button", { name: /Response style/ }));
    await user.click(screen.getByRole("menuitem", { name: "Technical" }));

    expect(onUpdatePersonalization).toHaveBeenLastCalledWith(
      expect.objectContaining({ replyTone: "technical" })
    );
  });

  it("shows provider model fetch feedback", async () => {
    const user = userEvent.setup();
    const onFetchModels = vi.fn();

    renderSettingsPanel({
      onFetchModels,
      providerFetchStates: {
        openai: { status: "error", message: "OpenAI API Key is not configured" }
      }
    });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));

    expect(screen.getByText("OpenAI API Key is not configured")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Fetch models" })[0]);
    expect(onFetchModels).toHaveBeenCalledWith("openai", "");
  });

  it("lets users enable fetched models explicitly from the model list", async () => {
    const user = userEvent.setup();
    const onToggleModelEnabled = vi.fn();
    const onSelectModel = vi.fn();
    const settings = mergeFetchedModels(setLanguage(createDefaultModelSettings(), "en-US"), [
      {
        id: "openai:gpt-4.1",
        providerId: "openai",
        label: "GPT-4.1",
        modelName: "gpt-4.1",
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

    renderSettingsPanel({ settings, onToggleModelEnabled, onSelectModel });

    expect(screen.getByText("Disabled")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enable GPT-4.1" }));

    expect(onToggleModelEnabled).toHaveBeenCalledWith("openai:gpt-4.1", true);
    expect(onSelectModel).not.toHaveBeenCalled();
  });

  it("filters available models by fuzzy query, provider label, and model id", async () => {
    const user = userEvent.setup();
    const settings = mergeFetchedModels(setLanguage(createDefaultModelSettings(), "en-US"), [
      {
        id: "openai:gpt-4.1",
        providerId: "openai",
        label: "GPT-4.1",
        modelName: "gpt-4.1",
        enabled: false,
        capabilities: {
          reasoning: { type: "none" },
          toolCalling: "unknown",
          streaming: "unknown",
          vision: "unknown"
        },
        capabilitySource: "provider-api"
      },
      {
        id: "deepseek:deepseek-v4-flash",
        providerId: "deepseek",
        label: "DeepSeek V4 Flash",
        modelName: "deepseek-v4-flash",
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

    renderSettingsPanel({ settings });

    await user.type(screen.getByRole("searchbox", { name: "Search models" }), "deep");

    expect(screen.getByText("DeepSeek V4 Flash")).toBeInTheDocument();
    expect(screen.queryByText("GPT-4.1")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search models" }));
    await user.type(screen.getByRole("searchbox", { name: "Search models" }), "gpt41");

    expect(screen.getByText("GPT-4.1")).toBeInTheDocument();
    expect(screen.queryByText("DeepSeek V4 Flash")).not.toBeInTheDocument();
  });

  it("passes the draft API key when fetching models", async () => {
    const user = userEvent.setup();
    const onFetchModels = vi.fn();

    renderSettingsPanel({ onFetchModels });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));
    await user.type(screen.getAllByLabelText(/^OpenAI API Key$/)[0], "sk-live");
    await user.click(screen.getAllByRole("button", { name: "Fetch models" })[0]);

    expect(onFetchModels).toHaveBeenCalledWith("openai", "sk-live");
  });

  it("shows fetched models inside each provider profile and selects one", async () => {
    const user = userEvent.setup();
    const onSelectModel = vi.fn();
    const settings = mergeFetchedModels(setLanguage(createDefaultModelSettings(), "en-US"), [
      {
        id: "openai:gpt-4.1",
        providerId: "openai",
        label: "GPT-4.1",
        modelName: "gpt-4.1",
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

    renderSettingsPanel({ settings, onSelectModel });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));
    await user.click(screen.getByRole("button", { name: /OpenAI available models/ }));
    await user.click(screen.getByRole("menuitem", { name: /GPT-4.1/ }));

    expect(onSelectModel).toHaveBeenCalledWith("openai:gpt-4.1");
  });

  it("disables provider model dropdowns before models are fetched", async () => {
    const user = userEvent.setup();

    renderSettingsPanel();

    await user.click(screen.getByRole("button", { name: /API profiles/ }));

    expect(screen.getByRole("button", { name: /OpenAI available models/ })).toBeDisabled();
  });

  it("does not ask local Ollama profiles for an API key", async () => {
    const user = userEvent.setup();

    renderSettingsPanel();

    await user.click(screen.getByRole("button", { name: /API profiles/ }));
    await user.click(screen.getByRole("button", { name: /Configure Ollama/ }));

    expect(screen.queryByLabelText(/^Ollama API Key$/)).not.toBeInTheDocument();
  });

  it("lists archived conversations and restores them", async () => {
    const user = userEvent.setup();
    const onRestoreArchivedThread = vi.fn();

    renderSettingsPanel({
      archivedThreads: [
        {
          id: "thread-1",
          title: "Old chat",
          prompt: "Old chat",
          status: "completed",
          modelId: "openai:gpt-5.5",
          intelligence: "high",
          speed: "balanced",
          createdAt: "2026-05-27T13:00:00.000Z",
          archived: true,
          events: []
        }
      ],
      onRestoreArchivedThread
    });

    await user.click(screen.getByRole("button", { name: /Archived chats/ }));
    await user.click(screen.getByRole("button", { name: /Restore Old chat/ }));

    expect(onRestoreArchivedThread).toHaveBeenCalledWith("thread-1");
  });
});
