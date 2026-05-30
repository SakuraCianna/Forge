// 本文件说明: 验证模型选择器的模型, 智能档位和速度选择
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultModelSettings,
  mergeFetchedModels,
  setLanguage,
  updateModelEnabled
} from "@/state/modelSettings";
import { ModelSelector } from "./ModelSelector";

describe("ModelSelector", () => {
  it("shows all available models in the model submenu", async () => {
    const user = userEvent.setup();
    let settings = setLanguage(
      mergeFetchedModels(createDefaultModelSettings(), [
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
            vision: "unknown"
          },
          capabilitySource: "provider-api"
        },
        {
          id: "anthropic:claude-sonnet",
          providerId: "anthropic",
          label: "Claude Sonnet",
          modelName: "claude-sonnet",
          enabled: true,
          capabilities: {
            reasoning: { type: "none" },
            toolCalling: "unknown",
            streaming: "unknown",
            vision: "unknown"
          },
          capabilitySource: "provider-api"
        }
      ]),
      "en-US"
    );
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    settings = updateModelEnabled(settings, "anthropic:claude-sonnet", true);

    render(
      <ModelSelector
        settings={settings}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /GPT-5.5/ }));
    const menu = await screen.findByRole("menu");

    const modelSubTrigger = within(menu).getAllByText("GPT-5.5").at(-1);

    expect(modelSubTrigger).toBeDefined();

    await user.hover(modelSubTrigger as HTMLElement);

    expect(await screen.findByText("Claude Sonnet")).toBeInTheDocument();
    expect(await screen.findByText("From Anthropic")).toBeInTheDocument();
  });

  it("opens settings directly when no model exists", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    const settings = {
      ...createDefaultModelSettings(),
      currentModelId: null,
      models: []
    };

    const { container } = render(
      <ModelSelector
        settings={settings}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
        onOpenSettings={onOpenSettings}
      />
    );

    await user.click(screen.getByRole("button", { name: "配置模型" }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(container.querySelector("button[title]")).toBeNull();
    expect(screen.getByRole("tooltip", { name: "配置模型" })).toHaveClass("forge-tooltip");
  });

  it("shows only standard and fast speed choices when the model declares speed modes", async () => {
    const user = userEvent.setup();
    let settings = setLanguage(
      mergeFetchedModels(createDefaultModelSettings(), [
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
        }
      ]),
      "en-US"
    );
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);
    const { container, rerender } = render(
      <ModelSelector
        settings={settings}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    expect(container.querySelector(".lucide-zap")).toBeNull();

    await user.click(screen.getByRole("button", { name: /GPT-5.5/ }));
    await user.hover(screen.getByText("Speed"));

    expect(await screen.findByRole("menuitem", { name: /Standard/ })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /Fast/ })).toBeInTheDocument();
    expect(screen.queryByText("Careful")).not.toBeInTheDocument();

    rerender(
      <ModelSelector
        settings={{ ...settings, speed: "fast" }}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    expect(container.querySelector(".lucide-zap")).toBeInTheDocument();
  });

  it("hides speed choices when the current model has no speed modes", async () => {
    const user = userEvent.setup();
    let settings = setLanguage(
      mergeFetchedModels(createDefaultModelSettings(), [
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
      ]),
      "en-US"
    );
    settings = updateModelEnabled(settings, "deepseek:deepseek-v4-flash", true);

    render(
      <ModelSelector
        settings={{ ...settings, speed: "fast" }}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    expect(document.querySelector(".lucide-zap")).toBeNull();

    await user.click(screen.getByRole("button", { name: /deepseek-v4-flash/ }));

    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
  });

  it("keeps the model submenu compact and scrollable without visible scrollbars", async () => {
    const user = userEvent.setup();
    let settings = setLanguage(
      mergeFetchedModels(
        createDefaultModelSettings(),
        Array.from({ length: 16 }, (_, index) => ({
          id: `openai:gpt-list-${index}`,
          providerId: "openai",
          label: `GPT List ${index}`,
          modelName: `gpt-list-${index}`,
          enabled: true,
          capabilities: {
            reasoning: { type: "none" as const },
            toolCalling: "unknown" as const,
            streaming: "unknown" as const,
            vision: "unknown" as const
          },
          capabilitySource: "provider-api" as const
        }))
      ),
      "en-US"
    );

    for (const model of settings.models) {
      settings = updateModelEnabled(settings, model.id, true);
    }

    render(
      <ModelSelector
        settings={settings}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /GPT List 0/ }));
    await user.hover(screen.getByText("GPT List 0"));

    const modelMenu = await screen.findByText("GPT List 15");
    const menuContent = modelMenu.closest(".forge-model-menu-content");

    expect(menuContent).toHaveClass("max-h-[min(300px,calc(100vh-120px))]");
    expect(menuContent).toHaveClass("forge-scrollbar-none");
  });

  it("uses larger text inside model menus", async () => {
    const user = userEvent.setup();
    let settings = setLanguage(
      mergeFetchedModels(createDefaultModelSettings(), [
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
      ]),
      "en-US"
    );
    settings = updateModelEnabled(settings, "deepseek:deepseek-v4-flash", true);

    render(
      <ModelSelector
        settings={settings}
        onSelectModel={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectSpeed={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /deepseek-v4-flash/ }));

    expect(screen.getByRole("menuitem", { name: /deepseek-v4-flash/ })).toHaveClass("text-[12px]");
  });
});
