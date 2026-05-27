import { describe, expect, it } from "vitest";
import { getMessage, messages } from "./messages";

describe("messages", () => {
  it("uses Chinese as the default product language", () => {
    expect(getMessage("zh-CN", "app.tagline")).toBe("本地 AI 开发锻造台");
  });

  it("contains English text for language switching", () => {
    expect(getMessage("en-US", "app.tagline")).toBe("Local AI development forge");
  });

  it("keeps message keys aligned between languages", () => {
    expect(Object.keys(messages["zh-CN"]).sort()).toEqual(Object.keys(messages["en-US"]).sort());
  });
});
