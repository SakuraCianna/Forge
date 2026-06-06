import test from "node:test";
import assert from "node:assert/strict";
import { registerAgentHandlers } from "../src/main/agentIpc.js";
import { agentChannels } from "../src/shared/ipcChannels.js";
import type { GenerateAgentPlanRequest } from "../src/shared/agentTypes.js";

test("cancelled plan streams resolve without surfacing an Electron handler error", async () => {
  const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const sentChunks: unknown[] = [];

  registerAgentHandlers(
    async () => planResult("sync"),
    async () => ({
      providerId: "test",
      modelId: "model",
      relativePath: "index.ts",
      nextContent: "",
      createdAt: "2026-06-06T04:00:00.000Z"
    }),
    async () => ({
      providerId: "test",
      modelId: "model",
      text: "",
      createdAt: "2026-06-06T04:00:00.000Z"
    }),
    (channel, handler) => handlers.set(channel, handler),
    undefined,
    async (_request, _onDelta, signal) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
        setTimeout(() => resolve(planResult("late")), 10_000);
      })
  );

  const event = {
    sender: {
      send: (_channel: string, chunk: unknown) => sentChunks.push(chunk)
    }
  };
  const request = planRequest();
  const streamPromise = handlers.get(agentChannels.generatePlanStream)?.(event, "plan-1", request);

  await handlers.get(agentChannels.cancelPlanStream)?.(null, "plan-1");
  await assert.doesNotReject(async () => {
    await streamPromise;
  });
  assert.equal(
    sentChunks.some((chunk) =>
      typeof chunk === "object" &&
      chunk !== null &&
      "type" in chunk &&
      (chunk as { type?: unknown }).type === "error"
    ),
    false
  );
});

function planResult(text: string) {
  return {
    providerId: "test",
    modelId: "model",
    text,
    steps: [],
    createdAt: "2026-06-06T04:00:00.000Z"
  };
}

function planRequest(): GenerateAgentPlanRequest {
  return {
    provider: {
      id: "test",
      label: "Test",
      kind: "openai-compatible",
      requiresBaseUrl: false
    },
    model: {
      id: "test:model",
      providerId: "test",
      label: "Test Model",
      modelName: "model",
      enabled: true,
      capabilities: {
        reasoning: { type: "none" },
        streaming: true,
        toolCalling: true,
        vision: false
      },
      capabilitySource: "manual"
    },
    intelligence: "high",
    speed: "balanced",
    taskPrompt: "task",
    projectScan: {
      rootPath: "E:\\CodeHome\\Demo",
      files: [],
      truncated: false
    }
  };
}
