import { describe, expect, it } from "vitest";
import type { ForgeProvider } from "@shared/modelTypes";
import { fetchProviderModels } from "./fetchProviderModels";

const provider: ForgeProvider = {
  id: "openai",
  label: "OpenAI",
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  requiresBaseUrl: false
};

describe("fetchProviderModels", () => {
  it("fetches and converts models through a provider adapter", async () => {
    const models = await fetchProviderModels({
      provider,
      apiKey: "sk-test",
      fetcher: async (url, init) => {
        expect(url).toBe("https://api.openai.com/v1/models");
        expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test" });

        return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), { status: 200 });
      }
    });

    expect(models).toEqual([
      expect.objectContaining({
        id: "openai:gpt-5.5",
        providerId: "openai",
        label: "gpt-5.5"
      })
    ]);
  });

  it("throws a readable error when the provider rejects the request", async () => {
    await expect(
      fetchProviderModels({
        provider,
        apiKey: "bad-key",
        fetcher: async () => new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })
      })
    ).rejects.toThrow("OpenAI model fetch failed: 401 Unauthorized - Unauthorized");
  });
});
