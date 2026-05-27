import { describe, expect, it, vi } from "vitest";
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import type { AgentPlanResult, GenerateAgentPlanRequest } from "../shared/agentTypes.js";
import { agentChannels, registerAgentHandlers } from "./agentIpc.js";

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
    reasoning: { type: "none" },
    toolCalling: "unknown",
    streaming: "unknown",
    vision: "unknown"
  },
  capabilitySource: "built-in"
};

const request: GenerateAgentPlanRequest = {
  provider,
  model,
  intelligence: "high",
  speed: "fast",
  taskPrompt: "Add tests",
  projectScan: {
    rootPath: "E:\\CodeHome\\Forge",
    files: [{ relativePath: "package.json", size: 1200 }],
    truncated: false
  }
};

describe("agentIpc", () => {
  it("registers the agent plan generation handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const result: AgentPlanResult = {
      providerId: "openai",
      modelId: "openai:gpt-5.5",
      text: "Plan",
      createdAt: "2026-05-27T13:00:00.000Z"
    };
    const generatePlan = vi.fn(async () => result);

    registerAgentHandlers(generatePlan, (channel, handler) => handlers.set(channel, handler));

    await expect(handlers.get(agentChannels.generatePlan)?.(null, request)).resolves.toEqual(result);
    expect(generatePlan).toHaveBeenCalledWith(request);
  });
});
