// 本文件说明: 定义模型用量, 价格和统计事件类型
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
