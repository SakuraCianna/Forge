// 本文件说明: 验证运行时错误会按界面语言清洗成本地化提示
import { describe, expect, it } from "vitest";
import { formatRemoteModelError, formatRuntimeError } from "./runtimeErrors";

describe("runtime error i18n", () => {
  it("localizes IPC-wrapped provider key errors", () => {
    expect(
      formatRuntimeError(
        "zh-CN",
        new Error("Error invoking remote method 'provider:fetch': OpenAI API Key is not configured")
      )
    ).toBe("OpenAI API Key 未配置，请先在 API 配置中保存密钥。");
  });

  it("localizes model fetch network guidance without leaking a long English paragraph", () => {
    expect(
      formatRemoteModelError(
        "zh-CN",
        new Error(
          "OpenAI model fetch failed: network request failed (fetch failed) Check Base URL, Electron proxy/network access, and whether this provider exposes https://api.openai.com/v1/models."
        )
      )
    ).toBe(
      "无法拉取 OpenAI 模型列表：网络请求失败 (fetch failed) 请检查 Base URL、Electron 代理/网络访问权限，以及该提供商是否开放 https://api.openai.com/v1/models。"
    );
  });

  it("keeps English messages for the English interface", () => {
    expect(formatRuntimeError("en-US", new Error("File is too large to preview"))).toBe(
      "File is too large to preview"
    );
  });

  it("replaces HTML or invalid JSON provider details with a concise model hint", () => {
    expect(formatRemoteModelError("zh-CN", new Error("OpenAI returned HTML instead of JSON"))).toBe(
      "API 返回了 HTML 而不是 JSON，请检查 Base URL 是否指向兼容的 /v1 接口，以及模型 ID 是否正确。"
    );
  });
});
