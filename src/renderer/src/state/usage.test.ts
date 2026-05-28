import { describe, expect, it } from "vitest";
import type { UsageEvent } from "@shared/usageTypes";
import { summarizeUsage, summarizeUsageByModel, summarizeUsageByProvider } from "./usage";

const baseEvent = {
  id: "event-1",
  kind: "ask",
  createdAt: "2026-05-29T00:00:00.000Z",
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  totalTokens: 1_500_000
} satisfies Pick<
  UsageEvent,
  "id" | "kind" | "createdAt" | "inputTokens" | "outputTokens" | "totalTokens"
>;

describe("usage", () => {
  it("uses model-specific rates before provider fallback rates", () => {
    const events: UsageEvent[] = [
      {
        ...baseEvent,
        providerId: "openai",
        modelId: "openai:gpt-4.1"
      }
    ];

    const summary = summarizeUsage(events, {
      openai: { inputPerMillion: 1, outputPerMillion: 2 },
      "openai:gpt-4.1": { inputPerMillion: 10, outputPerMillion: 20 }
    });

    expect(summary.estimatedCost).toBe(20);
  });

  it("groups usage by exact model while preserving provider summaries", () => {
    const events: UsageEvent[] = [
      {
        ...baseEvent,
        id: "event-1",
        providerId: "openai",
        modelId: "openai:gpt-4.1"
      },
      {
        ...baseEvent,
        id: "event-2",
        providerId: "openai",
        modelId: "openai:gpt-4.1-mini",
        inputTokens: 200,
        outputTokens: 300,
        totalTokens: 500
      }
    ];

    const modelUsage = summarizeUsageByModel(events, {});
    const providerUsage = summarizeUsageByProvider(events, {});

    expect(Object.keys(modelUsage)).toEqual(["openai:gpt-4.1", "openai:gpt-4.1-mini"]);
    expect(providerUsage.openai.requests).toBe(2);
  });
});
