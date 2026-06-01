import { describe, expect, it } from "vitest";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { ModelSettings } from "@shared/modelTypes";
import { createThreadFromSettings } from "./taskThreads";

const modelSettings: ModelSettings = {
  language: "en-US",
  intelligence: "high",
  speed: "balanced",
  currentModelId: "model-1",
  providers: [
    {
      id: "provider-1",
      label: "Provider",
      kind: "openai-compatible",
      requiresBaseUrl: true
    }
  ],
  models: [
    {
      id: "model-1",
      providerId: "provider-1",
      label: "Model",
      modelName: "model-1",
      enabled: true,
      capabilities: {
        reasoning: { type: "none" },
        toolCalling: "unknown",
        streaming: "unknown",
        vision: "unknown"
      },
      capabilitySource: "manual"
    }
  ]
};

const agentProfile: AgentProfileContext = {
  id: "build",
  name: "Coding agent",
  description: "Code changes",
  instructions: "Work carefully",
  permissionMode: "auto",
  enabledTools: ["read", "edit", "command", "git"],
  contextBudget: 12000,
  planStepLimit: 6,
  verificationPolicy: "require",
  failureRecoveryPolicy: "auto"
};

describe("task threads", () => {
  it("stores an immutable agent profile snapshot when creating a thread", () => {
    const result = createThreadFromSettings(modelSettings, "Implement a feature", {
      agentProfile,
      createId: () => "thread-1",
      now: () => "2026-06-01T00:00:00.000Z"
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    agentProfile.enabledTools.length = 0;
    agentProfile.failureRecoveryPolicy = "manual";

    expect(result.thread.agentProfile?.enabledTools).toEqual([
      "read",
      "edit",
      "command",
      "git"
    ]);
    expect(result.thread.agentProfile?.failureRecoveryPolicy).toBe("auto");
  });
});
