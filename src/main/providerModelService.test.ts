import { describe, expect, it } from "vitest";
import type { ForgeProvider } from "../shared/modelTypes";
import { fetchModelsForProvider } from "./providerModelService";

const provider: ForgeProvider = {
  id: "openai",
  label: "OpenAI",
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  requiresBaseUrl: false
};

describe("providerModelService", () => {
  it("uses the saved provider key to fetch models in the main process", async () => {
    const models = await fetchModelsForProvider({
      provider,
      keyVault: {
        readProviderKey: async () => "sk-test"
      },
      fetcher: async (url, init) => {
        expect(url).toBe("https://api.openai.com/v1/models");
        expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test" });

        return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), { status: 200 });
      }
    });

    expect(models[0]).toMatchObject({
      id: "openai:gpt-5.5",
      providerId: "openai",
      modelName: "gpt-5.5"
    });
  });

  it("stops with a readable error when the provider key is missing", async () => {
    await expect(
      fetchModelsForProvider({
        provider,
        keyVault: {
          readProviderKey: async () => null
        },
        fetcher: async () => new Response(null, { status: 200 })
      })
    ).rejects.toThrow("OpenAI API Key is not configured");
  });

  it("fetches models for providers that do not require an API key", async () => {
    const ollamaProvider: ForgeProvider = {
      id: "ollama",
      label: "Ollama",
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      modelListUrl: "http://localhost:11434/api/tags",
      requiresBaseUrl: false,
      requiresApiKey: false
    };

    const models = await fetchModelsForProvider({
      provider: ollamaProvider,
      keyVault: {
        readProviderKey: async () => null
      },
      fetcher: async (url, init) => {
        expect(url).toBe("http://localhost:11434/api/tags");
        expect(init.headers).toMatchObject({});

        return new Response(JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }] }), {
          status: 200
        });
      }
    });

    expect(models[0]).toMatchObject({
      id: "ollama:qwen2.5-coder:7b",
      providerId: "ollama",
      modelName: "qwen2.5-coder:7b"
    });
  });

  it("includes upstream error details when model fetching fails", async () => {
    await expect(
      fetchModelsForProvider({
        provider,
        keyVault: {
          readProviderKey: async () => "sk-test"
        },
        fetcher: async () => new Response("bad key", { status: 401, statusText: "Unauthorized" })
      })
    ).rejects.toThrow("OpenAI model fetch failed: 401 Unauthorized - bad key");
  });
});
