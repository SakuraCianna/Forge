import { describe, expect, it, vi } from "vitest";
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import type {
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import { generateAgentAsk, generateAgentFileChange, generateAgentPlan } from "./agentPlanService.js";

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
  enabled: true,
  capabilities: {
    reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
    toolCalling: true,
    streaming: true,
    vision: true
  },
  capabilitySource: "built-in"
};

const request: GenerateAgentPlanRequest = {
  provider,
  model,
  intelligence: "high",
  speed: "balanced",
  taskPrompt: "Add a settings page",
  projectScan: {
    rootPath: "E:\\CodeHome\\Forge",
    files: [
      { relativePath: "package.json", size: 1200 },
      { relativePath: "src/renderer/src/App.tsx", size: 4200 }
    ],
    truncated: false
  }
};

const fileChangeRequest: GenerateAgentFileChangeRequest = {
  provider,
  model,
  intelligence: "high",
  speed: "balanced",
  taskPrompt: "Update the component copy",
  relativePath: "src/renderer/src/App.tsx",
  currentContent: "export const label = 'old';"
};

const askRequest: GenerateAgentAskRequest = {
  provider,
  model,
  intelligence: "high",
  personalization: "Be concise.",
  speed: "balanced",
  prompt: "Explain what Forge is"
};

describe("agentPlanService", () => {
  it("calls the selected provider and returns generated plan text", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "1. Read App.tsx",
            usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
          })
        )
    );

    const result = await generateAgentPlan({
      request,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    const [_url, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init.body)).input).toContain("src/renderer/src/App.tsx");
    expect(result).toMatchObject({
      providerId: "openai",
      modelId: "openai:gpt-5.5",
      text: "1. Read App.tsx",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    });
  });

  it("throws a readable error when the provider key is missing", async () => {
    await expect(
      generateAgentPlan({
        request,
        keyVault: { readProviderKey: async () => null },
        fetcher: vi.fn()
      })
    ).rejects.toThrow("OpenAI API Key is not configured");
  });

  it("generates full replacement content for a selected file", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "```ts\nexport const label = 'new';\n```"
          })
        )
    );

    const result = await generateAgentFileChange({
      request: fileChangeRequest,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    expect(result).toMatchObject({
      providerId: "openai",
      modelId: "openai:gpt-5.5",
      relativePath: "src/renderer/src/App.tsx",
      nextContent: "export const label = 'new';"
    });
  });

  it("generates a direct ASK-mode answer without project context", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "Forge is a local coding agent.",
            usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 }
          })
        )
    );

    const result = await generateAgentAsk({
      request: askRequest,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    const [_url, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init.body)).input).toContain("Explain what Forge is");
    expect(result).toMatchObject({
      providerId: "openai",
      modelId: "openai:gpt-5.5",
      text: "Forge is a local coding agent.",
      usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 }
    });
  });
});
