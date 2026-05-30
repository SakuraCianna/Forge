// 本文件说明: 验证设置面板的常规, API, Agent 和记忆配置交互
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, mergeFetchedModels, setLanguage } from "@/state/modelSettings";
import { createDefaultGeneralPreferences } from "@/state/generalPreferences";
import { createDefaultPersonalizationSettings } from "@/state/personalization";
import { createDefaultAgentProfiles } from "@/state/agentProfiles";
import { SettingsPanel } from "./SettingsPanel";

// 使用默认 props 渲染设置页, 用例只覆盖关心的差异
function renderSettingsPanel(overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const settings = overrides.settings ?? setLanguage(createDefaultModelSettings(), "en-US");

  return render(
    <SettingsPanel
      settings={settings}
      agentMemories={[]}
      agentProfiles={createDefaultAgentProfiles()}
      generalPreferences={createDefaultGeneralPreferences()}
      keyStatuses={{}}
      onClearAgentMemories={vi.fn()}
      onSelectAgentProfile={vi.fn()}
      onUpdateAgentProfile={vi.fn()}
      onDeleteAgentMemory={vi.fn()}
      onClearUsage={vi.fn()}
      onDeleteProviderKey={vi.fn()}
      onFetchModels={vi.fn()}
      onAddManualModel={vi.fn()}
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
  it("opens settings on General instead of Available models", () => {
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({ settings });

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Work mode")).toBeInTheDocument();
  });

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

    expect(screen.queryByRole("button", { name: "Default permission" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Full access" }));

    expect(onUpdateGeneralPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ autoReview: true, fullAccess: true })
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

  it("shows local agent memories and lets users delete one", async () => {
    const user = userEvent.setup();
    const onDeleteAgentMemory = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({
      settings,
      onDeleteAgentMemory,
      agentMemories: [
        {
          id: "memory-1",
          scope: "project",
          projectPath: "E:\\CodeHome\\Forge",
          content: "Use PowerShell-safe commands",
          createdAt: "2026-05-30T10:00:00.000Z",
          updatedAt: "2026-05-30T10:00:00.000Z"
        }
      ]
    });

    await user.click(screen.getByRole("button", { name: /Memory/ }));

    expect(screen.getByText("Agent memory")).toBeInTheDocument();
    expect(screen.getByText("Use PowerShell-safe commands")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete memory" }));

    expect(onDeleteAgentMemory).toHaveBeenCalledWith("memory-1");
  });

  it("shows configurable agent profiles and updates the active profile", async () => {
    const user = userEvent.setup();
    const onSelectAgentProfile = vi.fn();
    const onUpdateAgentProfile = vi.fn();
    const settings = setLanguage(createDefaultModelSettings(), "zh-CN");

    renderSettingsPanel({
      settings,
      onSelectAgentProfile,
      onUpdateAgentProfile
    });

    await user.click(screen.getByRole("button", { name: /Agent 配置/ }));

    expect(screen.getAllByText("编码 Agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("审查 Agent").length).toBeGreaterThan(0);
    expect(screen.queryByText("Build agent")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-profile-workbench")).toHaveClass(
      "lg:grid-cols-[260px_minmax(0,1fr)]"
    );
    expect(screen.getByTestId("agent-profile-list")).toHaveClass("self-start", "content-start");
    expect(screen.getByTestId("agent-profile-editor")).toHaveClass("bg-[#fbfbfc]");
    expect(screen.getByTestId("agent-tool-grid")).toHaveClass("sm:grid-cols-4");

    await user.click(screen.getByRole("button", { name: "选择 审查 Agent" }));
    expect(onSelectAgentProfile).toHaveBeenCalledWith("review");

    fireEvent.change(screen.getByLabelText("Agent 指令"), {
      target: { value: "Review risky code paths" }
    });

    expect(onUpdateAgentProfile).toHaveBeenLastCalledWith(
      "build",
      expect.objectContaining({
        systemPrompt: "Review risky code paths"
      })
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

  it("adds a manual model ID for a custom API profile from a single inline row", async () => {
    const user = userEvent.setup();
    const onAddManualModel = vi.fn();
    const settings = setLanguage(
      {
        ...createDefaultModelSettings(),
        providers: [
          ...createDefaultModelSettings().providers,
          {
            id: "custom-cherry",
            label: "Cherry Gateway",
            kind: "openai-compatible",
            baseUrl: "https://gateway.example/v1",
            requiresBaseUrl: true,
            custom: true
          }
        ]
      },
      "en-US"
    );

    renderSettingsPanel({ settings, onAddManualModel });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));
    await user.click(screen.getByRole("button", { name: /Configure Cherry Gateway/ }));
    await user.click(screen.getByRole("button", { name: "Add model ID for Cherry Gateway" }));
    await user.type(screen.getByLabelText("Cherry Gateway model ID"), "deepseek-coder");
    await user.click(screen.getByRole("button", { name: "Save Cherry Gateway model ID" }));

    expect(onAddManualModel).toHaveBeenCalledWith("custom-cherry", "deepseek-coder", "");
    expect(screen.getByTestId("manual-model-row-custom-cherry")).toHaveClass("flex-nowrap");
  });

  it("keeps provider fetch errors on one line without squeezing action buttons", async () => {
    const user = userEvent.setup();
    const settings = setLanguage(createDefaultModelSettings(), "en-US");

    renderSettingsPanel({
      settings,
      providerFetchStates: {
        openai: {
          status: "error",
          message:
            "Error invoking remote method 'forge:provider-models:fetch': SyntaxError: Unexpected token '<', '<!doctype html>' is not valid JSON"
        }
      }
    });

    await user.click(screen.getByRole("button", { name: /API profiles/ }));

    expect(screen.getByRole("button", { name: "Fetch models" })).toHaveClass("shrink-0");
    expect(screen.getByText(/Unexpected token/)).toHaveClass(
      "min-w-0",
      "flex-1",
      "truncate",
      "whitespace-nowrap"
    );
    expect(screen.getByText(/Unexpected token/)).not.toHaveAttribute("title");
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
    await user.click(screen.getByRole("button", { name: /Available models/ }));

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
    await user.click(screen.getByRole("button", { name: /Available models/ }));

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
