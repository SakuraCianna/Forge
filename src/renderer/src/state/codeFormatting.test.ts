// 本文件说明: 验证文件预览格式化模式和 Prettier 失败回退
import { describe, expect, it } from "vitest";
import {
  formatCodePreview,
  getAvailableCodeFormatterModes,
  getDefaultCodeFormatterMode,
  getPrettierParserForPath
} from "./codeFormatting";

describe("codeFormatting", () => {
  it("maps common code file extensions to Prettier parsers", () => {
    expect(getPrettierParserForPath("src/App.tsx")).toBe("typescript");
    expect(getPrettierParserForPath("package.json")).toBe("json");
    expect(getPrettierParserForPath("README.md")).toBe("markdown");
  });

  it("defaults supported project files to Prettier and removes raw from choices", () => {
    expect(getDefaultCodeFormatterMode("src/App.tsx")).toBe("prettier");
    expect(getAvailableCodeFormatterModes("src/App.tsx")).toEqual(["prettier"]);
    expect(getAvailableCodeFormatterModes("README.md")).toEqual(["prettier", "rendered"]);
    expect(getAvailableCodeFormatterModes("public/logo.png")).toEqual([]);
  });

  it("returns raw content when formatting is disabled", async () => {
    const result = await formatCodePreview("package.json", "{\"name\":\"forge\"}", "raw");

    expect(result).toEqual({
      status: "raw",
      content: "{\"name\":\"forge\"}"
    });
  });

  it("keeps markdown content untouched for rendered previews", async () => {
    const result = await formatCodePreview("README.md", "# Forge", "rendered");

    expect(result).toEqual({
      status: "raw",
      content: "# Forge"
    });
  });

  it("formats supported previews with Prettier", async () => {
    const result = await formatCodePreview("package.json", "{\"name\":\"forge\"}", "prettier");

    expect(result.status).toBe("formatted");
    expect(result.content).toContain('"name": "forge"');
  });
});
