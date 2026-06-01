import { describe, expect, it } from "vitest";
import type { AgentImageAttachment } from "./agentTypes.js";
import type { ForgeModel, ForgeProvider, ProviderKind } from "./modelTypes.js";
import { buildTextGenerationRequest } from "./textGeneration.js";

const imageAttachment: AgentImageAttachment = {
  id: "image-1",
  mediaType: "image/png",
  dataUrl: "data:image/png;base64,aGVsbG8=",
  name: "pasted.png",
  size: 5
};

describe("buildTextGenerationRequest image attachments", () => {
  it("formats OpenAI Responses image input blocks", () => {
    const body = buildBody("openai");

    expect(body.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Describe this image" },
          { type: "input_image", image_url: imageAttachment.dataUrl }
        ]
      }
    ]);
  });

  it("formats Anthropic image content blocks with base64 sources", () => {
    const body = buildBody("anthropic");

    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "aGVsbG8="
            }
          }
        ]
      }
    ]);
  });

  it("formats Gemini inlineData parts", () => {
    const body = buildBody("gemini");

    expect(body.contents).toEqual([
      {
        role: "user",
        parts: [
          { text: "Describe this image" },
          {
            inlineData: {
              mimeType: "image/png",
              data: "aGVsbG8="
            }
          }
        ]
      }
    ]);
  });

  it("formats OpenAI-compatible image_url content blocks", () => {
    const body = buildBody("openai-compatible");

    expect(body.messages).toEqual([
      { role: "system", content: "Be helpful" },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          { type: "image_url", image_url: { url: imageAttachment.dataUrl } }
        ]
      }
    ]);
  });

  it("drops attachments for non-vision models", () => {
    const body = buildBody("openai-compatible", { vision: false });

    expect(body.messages).toEqual([
      { role: "system", content: "Be helpful" },
      { role: "user", content: "Describe this image" }
    ]);
  });
});

function buildBody(
  kind: ProviderKind,
  options: { vision?: ForgeModel["capabilities"]["vision"] } = {}
): Record<string, unknown> {
  const request = buildTextGenerationRequest({
    provider: createProvider(kind),
    model: createModel(kind, options.vision ?? true),
    apiKey: "test-key",
    instructions: "Be helpful",
    input: "Describe this image",
    attachments: [imageAttachment],
    intelligence: "medium",
    speed: "balanced"
  });

  return JSON.parse(request.init.body) as Record<string, unknown>;
}

function createProvider(kind: ProviderKind): ForgeProvider {
  return {
    id: `provider-${kind}`,
    label: `Provider ${kind}`,
    kind,
    baseUrl: "https://provider.test",
    requiresBaseUrl: false,
    requiresApiKey: false
  };
}

function createModel(kind: ProviderKind, vision: ForgeModel["capabilities"]["vision"]): ForgeModel {
  return {
    id: `model-${kind}`,
    providerId: `provider-${kind}`,
    label: `Model ${kind}`,
    modelName: "test-model",
    enabled: true,
    capabilities: {
      reasoning: { type: "none" },
      toolCalling: "unknown",
      streaming: "unknown",
      vision
    },
    capabilitySource: "manual"
  };
}
