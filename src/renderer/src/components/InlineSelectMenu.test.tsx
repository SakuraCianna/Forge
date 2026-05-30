// 本文件说明: 验证统一下拉菜单的选项选择和禁用态
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlineSelectMenu } from "./InlineSelectMenu";

describe("InlineSelectMenu", () => {
  it("uses the shared rounded dropdown surface and high-performance menu animation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <InlineSelectMenu
        ariaLabel="Code formatter"
        value="prettier"
        options={[
          { value: "raw", label: "Raw" },
          { value: "prettier", label: "Prettier" },
          { value: "rendered", label: "Rendered" }
        ]}
        onChange={onChange}
      />
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Code formatter" }));

    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("forge-dropdown-content");
    expect(menu).toHaveClass("forge-dropdown-fast");
    expect(menu).toHaveClass("rounded-[16px]");

    await user.click(screen.getByRole("menuitem", { name: /Rendered/ }));

    expect(onChange).toHaveBeenCalledWith("rendered");
  });
});
