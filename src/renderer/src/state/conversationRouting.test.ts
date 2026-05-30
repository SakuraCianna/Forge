// 本文件说明: 验证普通问答不会被误判成项目执行任务
import { describe, expect, it } from "vitest";
import { isDirectAnswerPrompt, isPlainChatPrompt } from "./conversationRouting";

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
  it("routes project questions to direct model answers instead of task planning", () => {
    expect(isDirectAnswerPrompt("我这个项目里面做了什么")).toBe(true);
    expect(isDirectAnswerPrompt("这个项目能做什么")).toBe(true);
    expect(isDirectAnswerPrompt("这个项目做了什么")).toBe(true);
    expect(isDirectAnswerPrompt("解释 src/App.tsx 的状态流")).toBe(true);
    expect(isDirectAnswerPrompt("修复登录页面的样式问题")).toBe(false);
    expect(isDirectAnswerPrompt("帮我添加设置页面并运行测试")).toBe(false);
  });
  it("routes explicit memory requests to direct answers", () => {
    expect(isDirectAnswerPrompt("remember that this project uses PowerShell")).toBe(true);
    expect(isDirectAnswerPrompt("请记住: 这个项目使用 Electron")).toBe(true);
  });
});
