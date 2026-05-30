// 本文件说明: 验证项目缺失提示的重新选择和打开最近项目操作
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectMissingNotice } from "./ProjectMissingNotice";

describe("ProjectMissingNotice", () => {
  it("shows a red missing-project warning and lets users remove the stale record", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <ProjectMissingNotice
        language="zh-CN"
        projectPath="E:\\CodeHome\\Missing"
        onRemove={onRemove}
      />
    );

    expect(screen.getByText("该项目不存在")).toBeInTheDocument();
    expect(screen.getByText(/CodeHome.*Missing/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除项目记录" }));

    expect(onRemove).toHaveBeenCalledOnce();
  });
});
