// 本文件说明: 记录模型调用用量并按模型和供应商汇总成本
import type { TokenUsage, UsageEvent, UsageEventKind } from "@shared/usageTypes";
import type { ForgeModel } from "@shared/modelTypes";

const usageEventsStorageKey = "forge.usageEvents";
const usageRatesStorageKey = "forge.usageRates";

export type UsageRate = {
  inputPerMillion: number;
  outputPerMillion: number;
};

// 费率可以按提供商 ID 或精确模型 ID 配置, 模型级费率优先
export type UsageRateMap = Record<string, UsageRate>;

export type UsageSummary = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
};

// 创建一次模型调用用量事件, 缺少价格时仍保留 token 和耗时
export function createUsageEvent({
  providerId,
  modelId,
  kind,
  usage,
  createdAt
}: {
  providerId: string;
  modelId: string;
  kind: UsageEventKind;
  usage: TokenUsage;
  createdAt: string;
}): UsageEvent {
  return {
    id: `${kind}-${providerId}-${modelId}-${createdAt}`,
    providerId,
    modelId,
    kind,
    createdAt,
    ...usage
  };
}

// 把最新用量事件放到最前面, 同时限制历史长度
export function appendUsageEvent(events: UsageEvent[], event: UsageEvent): UsageEvent[] {
  return [event, ...events].slice(0, 500);
}

// 汇总全部用量事件, 设置页顶部指标使用这个结果
export function summarizeUsage(events: UsageEvent[], rates: UsageRateMap): UsageSummary {
  return events.reduce<UsageSummary>(
    (summary, event) => {
      const rate = getUsageRateForEvent(event, rates);

      return {
        requests: summary.requests + 1,
        inputTokens: summary.inputTokens + event.inputTokens,
        outputTokens: summary.outputTokens + event.outputTokens,
        totalTokens: summary.totalTokens + event.totalTokens,
        reasoningTokens: summary.reasoningTokens + (event.reasoningTokens ?? 0),
        cacheReadTokens: summary.cacheReadTokens + (event.cacheReadTokens ?? 0),
        cacheWriteTokens: summary.cacheWriteTokens + (event.cacheWriteTokens ?? 0),
        estimatedCost:
          summary.estimatedCost +
          (rate
            ? (event.inputTokens / 1_000_000) * rate.inputPerMillion +
              (event.outputTokens / 1_000_000) * rate.outputPerMillion
            : 0)
      };
    },
    {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0
    }
  );
}

// 按模型聚合 token, 成本和平均耗时
export function summarizeUsageByModel(
  events: UsageEvent[],
  rates: UsageRateMap
): Record<string, UsageSummary> {
  const eventsByModel = events.reduce<Record<string, UsageEvent[]>>((groups, event) => {
    groups[event.modelId] = [...(groups[event.modelId] ?? []), event];
    return groups;
  }, {});

  return Object.fromEntries(
    Object.entries(eventsByModel).map(([modelId, modelEvents]) => [
      modelId,
      summarizeUsage(modelEvents, rates)
    ])
  );
}

// 按供应商聚合请求次数和费用
export function summarizeUsageByProvider(
  events: UsageEvent[],
  rates: UsageRateMap
): Record<string, UsageSummary> {
  const eventsByProvider = events.reduce<Record<string, UsageEvent[]>>((groups, event) => {
    groups[event.providerId] = [...(groups[event.providerId] ?? []), event];
    return groups;
  }, {});

  return Object.fromEntries(
    Object.entries(eventsByProvider).map(([providerId, providerEvents]) => [
      providerId,
      summarizeUsage(providerEvents, rates)
    ])
  );
}

// 合并模型价格表, 远端价格和用户手动价格都走这里
export function mergeModelPricingRates(
  rates: UsageRateMap,
  models: Array<Partial<ForgeModel> & Pick<ForgeModel, "id">>
): UsageRateMap {
  let nextRates = rates;

  for (const model of models) {
    if (!model.pricing || rates[model.id]) {
      continue;
    }

    if (nextRates === rates) {
      nextRates = { ...rates };
    }

    nextRates[model.id] = model.pricing;
  }

  return nextRates;
}

// 从 localStorage 读取用量事件, 无效条目自动过滤
export function loadUsageEvents(storage: Storage): UsageEvent[] {
  return parseJsonArray(storage.getItem(usageEventsStorageKey), isUsageEvent);
}

// 保存用量事件列表, 只保留最近一段历史
export function saveUsageEvents(storage: Storage, events: UsageEvent[]): void {
  storage.setItem(usageEventsStorageKey, JSON.stringify(events));
}

// 读取用户保存的模型价格表
export function loadUsageRates(storage: Storage): UsageRateMap {
  const rawValue = storage.getItem(usageRatesStorageKey);

  if (!rawValue) {
    return {};
  }

  try {
    const value = JSON.parse(rawValue) as unknown;

    if (!isRecord(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).flatMap(([providerId, rate]) =>
        isUsageRate(rate) ? [[providerId, rate] as const] : []
      )
    );
  } catch {
    return {};
  }
}

// 保存模型价格表, 空对象也会覆盖旧配置
export function saveUsageRates(storage: Storage, rates: UsageRateMap): void {
  storage.setItem(usageRatesStorageKey, JSON.stringify(rates));
}

// 按模型 id 找价格, 事件内价格优先于全局价格表
function getUsageRateForEvent(event: UsageEvent, rates: UsageRateMap): UsageRate | undefined {
  return rates[event.modelId] ?? rates[event.providerId];
}

// 安全解析 JSON 数组, 非数组直接回退空数组
function parseJsonArray<T>(rawValue: string | null, guard: (value: unknown) => value is T): T[] {
  if (!rawValue) {
    return [];
  }

  try {
    const value = JSON.parse(rawValue) as unknown;
    return Array.isArray(value) ? value.filter(guard) : [];
  } catch {
    return [];
  }
}

// 校验用量事件结构, token 和费用字段可以缺省
function isUsageEvent(value: unknown): value is UsageEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.providerId === "string" &&
    typeof value.modelId === "string" &&
    typeof value.kind === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.inputTokens === "number" &&
    typeof value.outputTokens === "number" &&
    typeof value.totalTokens === "number"
  );
}

// 校验价格配置, 输入和输出价格至少保持数字类型
function isUsageRate(value: unknown): value is UsageRate {
  return (
    isRecord(value) &&
    typeof value.inputPerMillion === "number" &&
    typeof value.outputPerMillion === "number"
  );
}

// 将 unknown 缩窄成普通对象, 供持久化校验复用
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
