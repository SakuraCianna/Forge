import { describe, expect, it } from "vitest";
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes";
import { providerModelChannels, registerProviderModelHandlers } from "./providerModelsIpc";

const provider: ForgeProvider = {
  id: "openai",
  label: "OpenAI",
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  requiresBaseUrl: false
};

const model: ForgeModel = {
  id: "openai:gpt-5.5",
  providerId: "openai",
  label: "GPT-5.5",
  modelName: "gpt-5.5",
  enabled: false,
  capabilities: {
    reasoning: { type: "none" },
    toolCalling: "unknown",
    streaming: "unknown",
    vision: "unknown"
  },
  capabilitySource: "provider-api"
};

describe("providerModelsIpc", () => {
  it("registers a provider model fetch handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();

    registerProviderModelHandlers(
      async (receivedProvider) => {
        expect(receivedProvider).toEqual(provider);
        return [model];
      },
      (channel, handler) => handlers.set(channel, handler)
    );

    const result = await handlers.get(providerModelChannels.fetch)?.(null, provider);

    expect(result).toEqual([model]);
  });
});
