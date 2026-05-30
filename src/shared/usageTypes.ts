// 本文件说明: 共享模块 用量共享类型
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type UsageEventKind = "plan" | "file-change" | "ask";

export type UsageEvent = TokenUsage & {
  id: string;
  providerId: string;
  modelId: string;
  kind: UsageEventKind;
  createdAt: string;
};
