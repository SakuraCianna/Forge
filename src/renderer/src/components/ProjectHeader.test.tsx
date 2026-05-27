import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectHeader } from "./ProjectHeader";

describe("ProjectHeader", () => {
  it("shows an empty project state", () => {
    render(<ProjectHeader language="zh-CN" project={null} onPickProject={vi.fn()} />);

    expect(screen.getByText("未选择项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择项目" })).toBeInTheDocument();
  });

  it("shows the selected project and triggers the picker", async () => {
    const user = userEvent.setup();
    const onPickProject = vi.fn();

    render(
      <ProjectHeader
        language="zh-CN"
        project={{
          name: "Forge",
          path: "E:\\CodeHome\\Forge",
          openedAt: "2026-05-27T13:00:00.000Z"
        }}
        onPickProject={onPickProject}
      />
    );

    expect(screen.getByText("Forge")).toBeInTheDocument();
    expect(screen.getByText("E:\\CodeHome\\Forge")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择项目" }));

    expect(onPickProject).toHaveBeenCalledOnce();
  });
});
