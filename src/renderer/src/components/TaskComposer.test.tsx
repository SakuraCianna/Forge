import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, updateModelEnabled } from "@/state/modelSettings";
import { TaskComposer } from "./TaskComposer";

describe("TaskComposer", () => {
  it("submits the typed task prompt", async () => {
    const user = userEvent.setup();
    const onSubmitTask = vi.fn();
    const settings = updateModelEnabled(createDefaultModelSettings(), "openai:gpt-5.5", true);

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
});
