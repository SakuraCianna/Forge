import { describe, expect, it } from "vitest";
import { formatCodePreview, getPrettierParserForPath } from "./codeFormatting";

describe("codeFormatting", () => {
  it("maps common code file extensions to Prettier parsers", () => {
    expect(getPrettierParserForPath("src/App.tsx")).toBe("typescript");
    expect(getPrettierParserForPath("package.json")).toBe("json");
    expect(getPrettierParserForPath("README.md")).toBe("markdown");
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
