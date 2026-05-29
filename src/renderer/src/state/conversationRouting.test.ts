import { describe, expect, it } from "vitest";
import { isPlainChatPrompt } from "./conversationRouting";

describe("conversationRouting", () => {
  it("routes short greetings as direct chat instead of project planning", () => {
    expect(isPlainChatPrompt("你好")).toBe(true);
    expect(isPlainChatPrompt("hello")).toBe(true);
    expect(isPlainChatPrompt("在吗?")).toBe(true);
  });

  it("keeps real coding requests in the project workflow", () => {
    expect(isPlainChatPrompt("修复登录页面的样式问题")).toBe(false);
    expect(isPlainChatPrompt("帮我解释 src/App.tsx 的状态流")).toBe(false);
  });
});
