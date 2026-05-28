export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type UsageEventKind = "plan" | "file-change";

export type UsageEvent = TokenUsage & {
  id: string;
  providerId: string;
  modelId: string;
  kind: UsageEventKind;
  createdAt: string;
};
