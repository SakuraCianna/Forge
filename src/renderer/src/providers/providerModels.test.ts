import { describe, expect, it } from "vitest";
import type { ForgeProvider } from "@shared/modelTypes";
import {
  buildModelListRequest,
  parseProviderModelList,
  toForgeModel
} from "@shared/providerModels";

const openaiProvider: ForgeProvider = {
  id: "openai",
  label: "OpenAI",
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  requiresBaseUrl: false
};

const anthropicProvider: ForgeProvider = {
  id: "anthropic",
  label: "Anthropic",
  kind: "anthropic",
  baseUrl: "https://api.anthropic.com",
  requiresBaseUrl: false
};

const geminiProvider: ForgeProvider = {
  id: "gemini",
  label: "Gemini",
  kind: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  requiresBaseUrl: false
};

describe("provider model adapters", () => {
  it("builds an OpenAI compatible model list request", () => {
    const request = buildModelListRequest(openaiProvider, "sk-test");

    expect(request.url).toBe("https://api.openai.com/v1/models");
    expect(request.headers.Authorization).toBe("Bearer sk-test");
  });

  it("builds an Anthropic model list request with Anthropic headers", () => {
    const request = buildModelListRequest(anthropicProvider, "sk-ant-test");

    expect(request.url).toBe("https://api.anthropic.com/v1/models");
    expect(request.headers["x-api-key"]).toBe("sk-ant-test");
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("builds a Gemini model list request with key query parameter", () => {
    const request = buildModelListRequest(geminiProvider, "gemini-key");

    expect(request.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key");
    expect(request.headers.Authorization).toBeUndefined();
  });

  it("parses OpenAI compatible model list responses", () => {
    const models = parseProviderModelList(openaiProvider, {
      data: [{ id: "gpt-5.5" }, { id: "gpt-5.5-mini" }]
    });

    expect(models).toEqual([
      { id: "gpt-5.5", label: "gpt-5.5" },
      { id: "gpt-5.5-mini", label: "gpt-5.5-mini" }
    ]);
  });

  it("parses Anthropic model list responses", () => {
    const models = parseProviderModelList(anthropicProvider, {
      data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }]
    });

    expect(models).toEqual([{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }]);
  });

  it("parses Gemini model list responses", () => {
    const models = parseProviderModelList(geminiProvider, {
      models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro" }]
    });

    expect(models).toEqual([{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }]);
  });

  it("converts fetched metadata into a disabled Forge model", () => {
    const model = toForgeModel(openaiProvider, { id: "gpt-5.5", label: "GPT-5.5" });

    expect(model).toMatchObject({
      id: "openai:gpt-5.5",
      providerId: "openai",
      label: "GPT-5.5",
      modelName: "gpt-5.5",
      enabled: false,
      capabilitySource: "provider-api"
    });
  });
});
