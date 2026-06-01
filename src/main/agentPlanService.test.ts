import { describe, expect, it } from "vitest";
import type { GenerateAgentPlanRequest } from "../shared/agentTypes";
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes";
import { generateAgentPlan } from "./agentPlanService";

const testProvider: ForgeProvider = {
  id: "test-openai-compatible",
  label: "Test provider",
  kind: "openai-compatible",
  baseUrl: "https://example.test/v1",
  requiresBaseUrl: false,
  requiresApiKey: false
};

const testModel: ForgeModel = {
  id: "test-openai-compatible:test-model",
  providerId: testProvider.id,
  label: "Test model",
  modelName: "test-model",
  enabled: true,
  capabilities: {
    reasoning: { type: "none" },
    toolCalling: "unknown",
    streaming: "unknown",
    vision: "unknown"
  },
  capabilitySource: "manual"
};

const baseRequest: GenerateAgentPlanRequest = {
  provider: testProvider,
  model: testModel,
  intelligence: "medium",
  speed: "balanced",
  taskPrompt: "Update the app shell",
  projectScan: {
    rootPath: "E:\\CodeHome\\Forge",
    files: [{ relativePath: "src/renderer/src/App.tsx", size: 1000 }],
    truncated: false
  },
  agentProfile: {
    id: "build",
    name: "Coding agent",
    description: "Code changes",
    instructions: "Edit carefully and verify.",
    permissionMode: "auto",
    enabledTools: ["read", "edit", "command", "git"],
    contextBudget: 12000,
    planStepLimit: 2,
    verificationPolicy: "require",
    failureRecoveryPolicy: "auto"
  }
};

describe("generateAgentPlan", () => {
  it("enforces required verification within the configured step limit", async () => {
    const result = await generateAgentPlan({
      request: baseRequest,
      keyVault: { readProviderKey: async () => null },
      fetcher: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    steps: [
                      { kind: "inspect", description: "Inspect the app shell", target: "src" },
                      {
                        kind: "edit",
                        description: "Edit the app shell",
                        target: "src/renderer/src/App.tsx"
                      }
                    ]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps.map((step) => step.kind)).toEqual(["edit", "verify"]);
    expect(result.steps[1].target).toBe("git status");
  });
});
