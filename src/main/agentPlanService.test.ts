import { describe, expect, it, vi } from "vitest";
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import type {
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import {
  generateAgentAsk,
  generateAgentAskStream,
  generateAgentFileChange,
  generateAgentPlan
} from "./agentPlanService.js";

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
      steps: [
        {
          id: "step-1",
          title: "Read App.tsx",
          description: "Read App.tsx",
          kind: "inspect",
          status: "pending"
        }
      ],
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    });
  });

  it("extracts structured execution steps from generated plan text", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: [
              "1. Inspect `src/renderer/src/App.tsx` to find the workspace flow.",
              "2. Modify `src/renderer/src/App.tsx` to wire the new behavior.",
              "3. Run `npm test` to verify the change."
            ].join("\n")
          })
        )
    );

    const result = await generateAgentPlan({
      request,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    expect(result.steps).toEqual([
      {
        id: "step-1",
        title: "Inspect `src/renderer/src/App.tsx` to find the workspace flow",
        description: "Inspect `src/renderer/src/App.tsx` to find the workspace flow.",
        kind: "inspect",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "step-2",
        title: "Modify `src/renderer/src/App.tsx` to wire the new behavior",
        description: "Modify `src/renderer/src/App.tsx` to wire the new behavior.",
        kind: "edit",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "step-3",
        title: "Run `npm test` to verify the change",
        description: "Run `npm test` to verify the change.",
        kind: "verify",
        status: "pending",
        target: "npm test"
      }
    ]);
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

  it("hydrates no-key local providers before agent requests", async () => {
    const ollamaProvider: ForgeProvider = {
      id: "ollama",
      label: "Ollama",
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      requiresBaseUrl: false
    };
    const ollamaModel: ForgeModel = {
      id: "ollama:qwen2.5-coder:7b",
      providerId: "ollama",
      label: "qwen2.5-coder:7b",
      modelName: "qwen2.5-coder:7b",
      enabled: true,
      capabilities: {
        reasoning: { type: "none" },
        toolCalling: "unknown",
        streaming: "unknown",
        vision: "unknown"
      },
      capabilitySource: "provider-api"
    };
    const fetcher = vi.fn(async (_url, init) => {
      expect(init.headers).not.toHaveProperty("Authorization");

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Local plan" } }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }
        })
      );
    });

    const result = await generateAgentPlan({
      request: {
        ...request,
        provider: ollamaProvider,
        model: ollamaModel
      },
      keyVault: { readProviderKey: async () => null },
      fetcher
    });

    const [url] = fetcher.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(result).toMatchObject({
      providerId: "ollama",
      modelId: "ollama:qwen2.5-coder:7b",
      text: "Local plan",
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 }
    });
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

  it("generates a direct answer without project context", async () => {
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

  it("throws a readable error when an ask endpoint returns HTML instead of JSON", async () => {
    const fetcher = vi.fn(async () => new Response("<!doctype html><html></html>"));

    await expect(
      generateAgentAsk({
        request: askRequest,
        keyVault: { readProviderKey: async () => "sk-test" },
        fetcher
      })
    ).rejects.toThrow("OpenAI returned HTML instead of JSON");
  });

  it("streams OpenAI-compatible ask deltas as they arrive", async () => {
    const compatibleProvider: ForgeProvider = {
      ...provider,
      id: "deepseek",
      kind: "openai-compatible",
      baseUrl: "https://api.deepseek.com",
      label: "DeepSeek"
    };
    const compatibleRequest: GenerateAgentAskRequest = {
      ...askRequest,
      provider: compatibleProvider,
      model: {
        ...model,
        providerId: "deepseek",
        id: "deepseek:deepseek-v4-flash",
        modelName: "deepseek-v4-flash"
      }
    };
    const fetcher = vi.fn(
      async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"**项目"}}]}',
            "",
            'data: {"choices":[{"delta":{"content":"概览**"}}]}',
            "",
            "data: [DONE]",
            ""
          ].join("\n"),
          { headers: { "content-type": "text/event-stream" } }
        )
    );
    const deltas: string[] = [];

    const result = await generateAgentAskStream({
      request: compatibleRequest,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher,
      onDelta: (delta) => deltas.push(delta)
    });

    const [_url, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init.body)).stream).toBe(true);
    expect(deltas).toEqual(["**项目", "概览**"]);
    expect(result.text).toBe("**项目概览**");
  });

  it("falls back to a single delta for providers without SSE ask streaming", async () => {
    const geminiProvider: ForgeProvider = {
      ...provider,
      id: "gemini",
      kind: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      label: "Gemini"
    };
    const geminiRequest: GenerateAgentAskRequest = {
      ...askRequest,
      provider: geminiProvider,
      model: {
        ...model,
        providerId: "gemini",
        id: "gemini:gemini-2.5-pro",
        modelName: "gemini-2.5-pro"
      }
    };
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "项目回答" }] } }]
          })
        )
    );
    const deltas: string[] = [];

    const result = await generateAgentAskStream({
      request: geminiRequest,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher,
      onDelta: (delta) => deltas.push(delta)
    });

    const [_url, init] = fetcher.mock.calls[0];
    expect(JSON.parse(String(init.body)).stream).toBeUndefined();
    expect(deltas).toEqual(["项目回答"]);
    expect(result.text).toBe("项目回答");
  });
});
