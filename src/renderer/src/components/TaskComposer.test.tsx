// 本文件说明: 验证输入框发送快捷键, 权限菜单和加号菜单
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

    expect(screen.getByRole("button", { name: "Open add menu" })).toBeInTheDocument();
    expect(screen.getByTestId("composer-left-controls")).toContainElement(
      screen.getByRole("button", { name: "Auto review" })
    );
  });

  it("opens an attachment-oriented add menu without picking a project", async () => {
    const user = userEvent.setup();
    const onPickProject = vi.fn();
    const settings = { ...createDefaultModelSettings(), language: "en-US" as const };

    render(
      <TaskComposer
        settings={settings}
        onPickProject={onPickProject}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open add menu" }));

    expect(screen.getByRole("menuitem", { name: "Add photos and files" })).toBeInTheDocument();
    expect(screen.getByText("Goal mode")).toBeInTheDocument();
    expect(screen.getByText("Plugin system")).toBeInTheDocument();
    expect(screen.getByTestId("add-menu-goal-switch")).toContainElement(
      screen.getByTestId("add-menu-goal-switch-knob")
    );
    expect(screen.getByTestId("add-menu-plugins-switch")).toContainElement(
      screen.getByTestId("add-menu-plugins-switch-knob")
    );
    expect(screen.queryByText("Plan mode")).not.toBeInTheDocument();
    expect(onPickProject).not.toHaveBeenCalled();
  });

  it("offers only auto review and full access permission choices", async () => {
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
    expect(screen.queryByRole("button", { name: "Default permission" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Auto review" }));

    expect(screen.queryByRole("menuitem", { name: "Default permission" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Auto review" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Full access" })).toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: "Open add menu" })).not.toHaveClass("border");
    expect(screen.getByRole("button", { name: "Configure model" })).not.toHaveClass("border");
  });

  it("removes browser focus outlines and hover tooltips from input-box controls", () => {
    const settings = { ...createDefaultModelSettings(), language: "en-US" as const };

    const { container } = render(
      <TaskComposer
        settings={settings}
        generalPreferences={{ ...createDefaultGeneralPreferences(), autoReview: true }}
        onUpdateGeneralPreferences={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Open add menu" })).toHaveClass("outline-none");
    expect(screen.getByRole("button", { name: "Auto review" })).toHaveClass("outline-none");
    expect(screen.getByRole("button", { name: "Start" })).toHaveClass("outline-none");
    expect(container.querySelector("button[title]")).toBeNull();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("uses smaller typography for the prompt, permission, and model controls", () => {
    let settings = mergeFetchedModels(
      { ...createDefaultModelSettings(), language: "en-US" as const },
      [
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
      ]
    );
    settings = updateModelEnabled(settings, "deepseek:deepseek-v4-flash", true);

    render(
      <TaskComposer
        settings={settings}
        generalPreferences={{ ...createDefaultGeneralPreferences(), fullAccess: true }}
        onUpdateGeneralPreferences={vi.fn()}
        onSelectIntelligence={vi.fn()}
        onSelectModel={vi.fn()}
        onSelectSpeed={vi.fn()}
        onSubmitTask={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox")).toHaveClass("text-[10px]");
    expect(screen.getByRole("button", { name: "Full access" })).toHaveClass("text-[10px]");
    expect(screen.getByRole("button", { name: /deepseek-v4-flash/ })).toHaveClass(
      "text-[10px]"
    );
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
