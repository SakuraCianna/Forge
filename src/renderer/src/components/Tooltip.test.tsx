// 本文件说明: 验证统一悬停提示的结构, 避免长文案撑出边界
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("uses wrapping tooltip classes for long labels", () => {
    render(
      <Tooltip label="项目更多选项 Werewolf 这个名字很长也不能撑出侧边栏">
        <button type="button">更多</button>
      </Tooltip>
    );

    expect(screen.getByRole("tooltip")).toHaveClass(
      "forge-tooltip",
      "forge-tooltip-readable",
      "forge-tooltip-align-center"
    );
  });

  it("can align long labels to the trigger edge", () => {
    render(
      <Tooltip align="end" label="项目更多选项 Werewolf 这个名字很长也不能撑出侧边栏">
        <button type="button">更多</button>
      </Tooltip>
    );

    expect(screen.getByRole("tooltip")).toHaveClass("forge-tooltip-align-end");
  });
});
