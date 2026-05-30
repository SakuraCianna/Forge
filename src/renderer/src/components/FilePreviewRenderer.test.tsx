// 本文件说明: 验证代码预览和 Markdown 预览的渲染结果
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilePreviewRenderer } from "./FilePreviewRenderer";

describe("FilePreviewRenderer", () => {
  it("renders README markdown as document content", () => {
    render(
      <FilePreviewRenderer
        content={["# Forge", "", "Local coding agent.", "", "```ts", "const ok = true;", "```"].join("\n")}
        mode="rendered"
        path="README.md"
      />
    );

    expect(screen.getByRole("heading", { name: "Forge" })).toBeInTheDocument();
    expect(screen.getByText("Local coding agent.")).toBeInTheDocument();
    expect(screen.getByText("const")).toHaveClass("text-[#8b5cf6]");
  });

  it("highlights code tokens for source previews", () => {
    render(
      <FilePreviewRenderer
        content={'const label = "Forge";'}
        mode="raw"
        path="src/App.tsx"
      />
    );

    expect(screen.getByText("const")).toHaveClass("text-[#8b5cf6]");
    expect(screen.getByText('"Forge"')).toHaveClass("text-[#047857]");
  });
});
