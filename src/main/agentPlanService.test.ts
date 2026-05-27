import { describe, expect, it, vi } from "vitest";
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import type { GenerateAgentPlanRequest } from "../shared/agentTypes.js";
import { generateAgentPlan } from "./agentPlanService.js";

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

describe("agentPlanService", () => {
  it("calls the selected provider and returns generated plan text", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ output_text: "1. Read App.tsx" })));

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
      text: "1. Read App.tsx"
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
});
