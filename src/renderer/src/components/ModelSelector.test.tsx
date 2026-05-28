import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, mergeFetchedModels, setLanguage } from "@/state/modelSettings";
import { ModelSelector } from "./ModelSelector";

describe("ModelSelector", () => {
  it("shows all available models in the model submenu", async () => {
    const user = userEvent.setup();
    const settings = setLanguage(
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

    render(
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
  });
});
