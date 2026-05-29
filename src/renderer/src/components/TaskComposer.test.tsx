import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultGeneralPreferences } from "@/state/generalPreferences";
import { createDefaultModelSettings, mergeFetchedModels, updateModelEnabled } from "@/state/modelSettings";
import { TaskComposer } from "./TaskComposer";

describe("TaskComposer", () => {
  it("submits the typed task prompt", async () => {
    const user = userEvent.setup();
    const onSubmitTask = vi.fn();
    let settings = mergeFetchedModels(createDefaultModelSettings(), [
      {
        id: "openai:gpt-5.5",
        providerId: "openai",
        label: "GPT-5.5",
        modelName: "gpt-5.5",
        enabled: true,
        capabilities: {
          reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
          toolCalling: true,
          streaming: true,
          vision: true
        },
        capabilitySource: "provider-api"
      }
    ]);
    settings = updateModelEnabled(settings, "openai:gpt-5.5", true);

    render(
      <TaskComposer
        settings={settings}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={onSubmitTask}
      />
    );

    await user.type(screen.getByPlaceholderText("描述你想锻造的代码任务"), "实现任务线程");
    await user.click(screen.getByRole("button", { name: "开始" }));

    expect(onSubmitTask).toHaveBeenCalledWith("实现任务线程");
    expect(screen.getByPlaceholderText("描述你想锻造的代码任务")).toHaveValue("");
  });
  it("submits the prompt with Enter and keeps Shift Enter for multiline input", async () => {
    const user = userEvent.setup();
    const onSubmitTask = vi.fn();
    const settings = { ...createDefaultModelSettings(), language: "en-US" as const };

    render(
      <TaskComposer
        settings={settings}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={onSubmitTask}
      />
    );

    const textbox = screen.getByRole("textbox");

    await user.type(textbox, "Implement send shortcut");
    await user.keyboard("{Enter}");

    expect(onSubmitTask).toHaveBeenCalledWith("Implement send shortcut");
    expect(textbox).toHaveValue("");

    await user.type(textbox, "Line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onSubmitTask).toHaveBeenCalledTimes(1);
    expect(textbox).toHaveValue("Line one\n");
  });

  it("keeps the add control visible in the dock composer", () => {
    const settings = { ...createDefaultModelSettings(), language: "en-US" as const };

    render(
      <TaskComposer
        settings={settings}
        generalPreferences={{ ...createDefaultGeneralPreferences(), autoReview: false }}
        onUpdateGeneralPreferences={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Add project" })).toBeInTheDocument();
    expect(screen.getByTestId("composer-left-controls")).toContainElement(
      screen.getByRole("button", { name: "Default permission" })
    );
  });

  it("offers permission choices without exposing chat-only separation", async () => {
    const user = userEvent.setup();
    const onUpdateGeneralPreferences = vi.fn();
    const settings = { ...createDefaultModelSettings(), language: "en-US" as const };

    render(
      <TaskComposer
        settings={settings}
        generalPreferences={{ ...createDefaultGeneralPreferences(), autoReview: false }}
        onUpdateGeneralPreferences={onUpdateGeneralPreferences}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={vi.fn()}
        variant="hero"
      />
    );

    expect(screen.queryByText(/Chat only/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Default permission" }));
    await user.click(await screen.findByRole("menuitem", { name: /Full access/ }));

    expect(onUpdateGeneralPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPermission: true,
        autoReview: true,
        fullAccess: true
      })
    );
  });

  it("keeps the hero composer controls borderless inside the input box", () => {
    const settings = { ...createDefaultModelSettings(), language: "en-US" as const };

    render(
      <TaskComposer
        settings={settings}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={vi.fn()}
        variant="hero"
      />
    );

    expect(screen.getByTestId("composer-control-row")).toHaveClass("overflow-visible");
    expect(screen.getByRole("button", { name: "Add project" })).not.toHaveClass("border");
    expect(screen.getByRole("button", { name: "Configure model" })).not.toHaveClass("border");
  });

  it("uses a shorter dock input and exposes a stop button while generating", async () => {
    const user = userEvent.setup();
    const onCancelTask = vi.fn();
    const onSubmitTask = vi.fn();
    const settings = { ...createDefaultModelSettings(), language: "en-US" as const };

    render(
      <TaskComposer
        busy
        settings={settings}
        onCancelTask={onCancelTask}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={onSubmitTask}
      />
    );

    expect(screen.getByRole("textbox")).toHaveClass("min-h-[22px]");
    await user.click(screen.getByRole("button", { name: "Stop response" }));

    expect(onCancelTask).toHaveBeenCalledOnce();
    expect(onSubmitTask).not.toHaveBeenCalled();
  });
});
