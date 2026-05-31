// 本文件说明: 主进程 Agent 执行计划服务测试
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
    const body = JSON.parse(String(init.body));
    expect(body.instructions).toContain('"files"');
    expect(body.instructions).toContain('"list_directory"');
    expect(body.instructions).toContain("Do not use shell commands for directory listing");
    expect(body.input).toContain("src/renderer/src/App.tsx");
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

  it("parses structured JSON plan steps before falling back to numbered text", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: [
              "Here is the actionable plan:",
              "```json",
              JSON.stringify({
                steps: [
                  {
                    kind: "read",
                    title: "Inspect shell",
                    description: "Inspect the shell component",
                    file: "src/renderer/src/components/AppShell.tsx"
                  },
                  {
                    type: "create",
                    description: "Create project usage notes",
                    path: "docs/usage.md"
                  },
                  {
                    kind: "run-command",
                    description: "Run tests",
                    command: "npm test -- --reporter=dot"
                  }
                ]
              }),
              "```",
              "1. This fallback line should not be used."
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
        title: "Inspect shell",
        description: "Inspect the shell component",
        kind: "inspect",
        status: "pending",
        target: "src/renderer/src/components/AppShell.tsx"
      },
      {
        id: "step-2",
        title: "Create project usage notes",
        description: "Create project usage notes",
        kind: "edit",
        status: "pending",
        target: "docs/usage.md"
      },
      {
        id: "step-3",
        title: "Run tests",
        description: "Run tests",
        kind: "verify",
        status: "pending",
        target: "npm test -- --reporter=dot"
      }
    ]);
  });

  it("expands structured multi-file edit steps into executable file targets", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              steps: [
                {
                  title: "Update workspace UI files",
                  type: "edit",
                  files: ["src/renderer/src/App.tsx", "src/renderer/src/components/AppShell.tsx"]
                },
                {
                  title: "Run tests",
                  type: "verify",
                  command: "npm test -- --reporter=dot"
                }
              ]
            })
          })
        )
    );

    const result = await generateAgentPlan({
      request,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    expect(result.steps).toEqual([
      expect.objectContaining({
        title: "Update workspace UI files",
        kind: "edit",
        target: "src/renderer/src/App.tsx"
      }),
      expect.objectContaining({
        title: "Update workspace UI files",
        kind: "edit",
        target: "src/renderer/src/components/AppShell.tsx"
      }),
      expect.objectContaining({
        title: "Run tests",
        kind: "verify",
        target: "npm test -- --reporter=dot"
      })
    ]);
  });

  it("parses nested and aliased structured plan step arrays", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              metadata: {
                files: ["src/renderer/src/App.tsx"]
              },
              plan: {
                steps: [
                  {
                    kind: "read",
                    description: "Inspect composer state",
                    path: "src/renderer/src/App.tsx"
                  }
                ]
              }
            })
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              notes: ["run the narrowest useful check"],
              actions: [
                {
                  type: "run-command",
                  description: "Run focused tests",
                  command: "npm test -- src/main/agentPlanService.test.ts"
                }
              ]
            })
          })
        )
      );

    const nestedResult = await generateAgentPlan({
      request,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });
    const aliasedResult = await generateAgentPlan({
      request,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    expect(nestedResult.steps).toEqual([
      expect.objectContaining({
        kind: "inspect",
        description: "Inspect composer state",
        target: "src/renderer/src/App.tsx"
      })
    ]);
    expect(aliasedResult.steps).toEqual([
      expect.objectContaining({
        kind: "verify",
        description: "Run focused tests",
        target: "npm test -- src/main/agentPlanService.test.ts"
      })
    ]);
  });

  it("parses tool-aware structured plan steps into controlled targets", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              steps: [
                {
                  tool: "LS",
                  description: "List renderer source directory",
                  path: "src/renderer/src"
                },
                {
                  tool: "Glob",
                  description: "Find React files",
                  pattern: "src/**/*.tsx"
                },
                {
                  tool: "Grep",
                  description: "Search for submit handler",
                  query: "handleSubmit"
                },
                {
                  tool: "git_status",
                  description: "Check working tree"
                },
                {
                  tool: "Bash",
                  description: "Run tests",
                  command: "npm test -- --reporter=dot"
                }
              ]
            })
          })
        )
    );

    const result = await generateAgentPlan({
      request,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    expect(result.steps).toEqual([
      expect.objectContaining({
        kind: "inspect",
        target: "src/renderer/src"
      }),
      expect.objectContaining({
        kind: "inspect",
        target: "src/**/*.tsx"
      }),
      expect.objectContaining({
        kind: "inspect",
        target: "handleSubmit"
      }),
      expect.objectContaining({
        kind: "verify",
        target: "git status --short"
      }),
      expect.objectContaining({
        kind: "verify",
        target: "npm test -- --reporter=dot"
      })
    ]);
  });

  it("extracts unquoted local commands from verification plan steps", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: [
              "1. Run npm test -- --reporter=dot to verify the change.",
              "2. Verify: npm run typecheck",
              "3. 运行 npm run build 验证生产构建。"
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
      expect.objectContaining({
        kind: "verify",
        target: "npm test -- --reporter=dot"
      }),
      expect.objectContaining({
        kind: "verify",
        target: "npm run typecheck"
      }),
      expect.objectContaining({
        kind: "verify",
        target: "npm run build"
      })
    ]);
  });

  it("treats create or write file plan steps as editable file targets", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: [
              "1. Create `说明书.md` with project usage instructions.",
              "2. Write `docs/usage.md` with setup notes."
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
      expect.objectContaining({
        kind: "edit",
        target: "说明书.md"
      }),
      expect.objectContaining({
        kind: "edit",
        target: "docs/usage.md"
      })
    ]);
  });

  it("extracts bare Chinese markdown filenames from create file plan steps", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "1. 创建 项目说明书.md, 介绍这个项目怎么使用。"
          })
        )
    );

    const result = await generateAgentPlan({
      request,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    expect(result.steps[0]).toEqual(
      expect.objectContaining({
        kind: "edit",
        target: "项目说明书.md"
      })
    );
  });


  it("throws a readable error when the provider key is missing", async () => {
    await expect(
      generateAgentPlan({
        request,
        keyVault: { readProviderKey: async () => null },
        fetcher: vi.fn()
      })
    ).rejects.toThrow("OpenAI API Key 未配置");
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

  it("includes project instruction files in file change prompts", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "export const label = 'new';"
          })
        )
    );

    await generateAgentFileChange({
      request: {
        ...fileChangeRequest,
        projectScan: {
          rootPath: "E:\\CodeHome\\Forge",
          files: [],
          truncated: false,
          instructionFiles: [
            {
              relativePath: "AGENTS.md",
              content: "Never use unsafe shell commands",
              truncated: false
            }
          ]
        }
      },
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    const [_url, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body.input).toContain("Project instructions");
    expect(body.input).toContain("AGENTS.md");
    expect(body.input).toContain("Never use unsafe shell commands");
  });

  it("includes the active agent profile in model prompts", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "Use the active profile."
          })
        )
    );

    await generateAgentAsk({
      request: {
        ...askRequest,
        agentProfile: {
          id: "review",
          name: "Review agent",
          description: "Review code before edits",
          instructions: "Focus on concrete bugs and regressions",
          permissionMode: "auto",
          enabledTools: ["read", "git"],
          contextBudget: 16000
        }
      },
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    const [_url, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body.input).toContain("Agent profile");
    expect(body.input).toContain("Review agent");
    expect(body.input).toContain("Focus on concrete bugs and regressions");
    expect(body.input).toContain("Tools: read, git");
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

  it("includes relevant agent memories in direct answer prompts", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "I will keep that in mind."
          })
        )
    );

    await generateAgentAsk({
      request: {
        ...askRequest,
        memories: [
          {
            id: "memory-1",
            scope: "project",
            content: "This workspace prefers PowerShell-safe commands",
            projectPath: "E:\\CodeHome\\Forge"
          }
        ]
      },
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    const [_url, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body.input).toContain("Relevant memories");
    expect(body.input).toContain("This workspace prefers PowerShell-safe commands");
  });

  it("includes project instruction files in plan and direct answer prompts", async () => {
    const projectScanWithInstructions = {
      ...request.projectScan,
      instructionFiles: [
        {
          relativePath: "AGENTS.md",
          content: "Use PowerShell-safe commands and keep Chinese comments with English punctuation",
          truncated: false
        }
      ]
    };
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "Use the project rules."
          })
        )
    );

    await generateAgentPlan({
      request: {
        ...request,
        projectScan: projectScanWithInstructions
      },
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });
    await generateAgentAsk({
      request: {
        ...askRequest,
        projectScan: projectScanWithInstructions
      },
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    const planBody = JSON.parse(String(fetcher.mock.calls[0][1].body));
    const askBody = JSON.parse(String(fetcher.mock.calls[1][1].body));

    expect(planBody.input).toContain("Project instructions");
    expect(planBody.input).toContain("AGENTS.md");
    expect(planBody.input).toContain("Use PowerShell-safe commands");
    expect(askBody.input).toContain("Project instructions");
    expect(askBody.input).toContain("Use PowerShell-safe commands");
  });

  it("includes recent conversation turns in direct answers", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: "Continuing the same thread."
          })
        )
    );

    await generateAgentAsk({
      request: {
        ...askRequest,
        conversation: [
          { role: "user", content: "你好" },
          { role: "assistant", content: "你好, 我在" }
        ],
        prompt: "继续刚才的话题"
      },
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher
    });

    const [_url, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body.input).toContain("Previous conversation");
    expect(body.input).toContain("User: 你好");
    expect(body.input).toContain("Assistant: 你好, 我在");
    expect(body.input).toContain("User message:\n继续刚才的话题");
  });

  it("throws a readable error when an ask endpoint returns HTML instead of JSON", async () => {
    const fetcher = vi.fn(async () => new Response("<!doctype html><html></html>"));

    await expect(
      generateAgentAsk({
        request: askRequest,
        keyVault: { readProviderKey: async () => "sk-test" },
        fetcher
      })
    ).rejects.toThrow("OpenAI 返回了 HTML 而不是 JSON");
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

  it("passes the abort signal to streaming model fetches", async () => {
    const controller = new AbortController();
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
          ['data: {"choices":[{"delta":{"content":"ok"}}]}', "", "data: [DONE]", ""].join("\n"),
          { headers: { "content-type": "text/event-stream" } }
        )
    );

    await generateAgentAskStream({
      request: compatibleRequest,
      keyVault: { readProviderKey: async () => "sk-test" },
      fetcher,
      signal: controller.signal,
      onDelta: vi.fn()
    });

    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("continues an OpenAI-compatible stream when the provider stops at the token limit", async () => {
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
    const fetcher = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"OpenAI /"}}]}',
            "",
            'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
            "",
            "data: [DONE]",
            ""
          ].join("\n"),
          { headers: { "content-type": "text/event-stream" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":" DeepSeek compatible providers."}}]}',
            "",
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
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

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body)).max_tokens).toBe(8192);
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body)).messages.at(-1).content).toContain(
      "Continue exactly where the previous answer stopped"
    );
    expect(deltas).toEqual(["OpenAI /", " DeepSeek compatible providers."]);
    expect(result.text).toBe("OpenAI / DeepSeek compatible providers.");
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
