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

  it("renders GitHub-style markdown tables as tables", () => {
    render(
      <FilePreviewRenderer
        content={[
          "`.env` 主要配置项:",
          "",
          "| 变量 | 说明 | 示例 |",
          "| ---- | ---- | ---- |",
          "| `LLM_PROVIDER` | AI 提供商 | `openai` |",
          "| `OPENAI_API_KEY` | OpenAI API Key | `sk-xxx` |"
        ].join("\n")}
        mode="rendered"
        path="README.md"
      />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "变量" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "AI 提供商" })).toBeInTheDocument();
    expect(screen.queryByText("| ---- | ---- | ---- |")).not.toBeInTheDocument();
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
