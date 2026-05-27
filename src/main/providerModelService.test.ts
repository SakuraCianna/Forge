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
});
