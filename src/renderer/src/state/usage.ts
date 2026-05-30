// 本文件说明: 渲染状态 用量统计状态
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

export function appendUsageEvent(events: UsageEvent[], event: UsageEvent): UsageEvent[] {
  return [event, ...events].slice(0, 500);
}

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

export function loadUsageEvents(storage: Storage): UsageEvent[] {
  return parseJsonArray(storage.getItem(usageEventsStorageKey), isUsageEvent);
}

export function saveUsageEvents(storage: Storage, events: UsageEvent[]): void {
  storage.setItem(usageEventsStorageKey, JSON.stringify(events));
}

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

export function saveUsageRates(storage: Storage, rates: UsageRateMap): void {
  storage.setItem(usageRatesStorageKey, JSON.stringify(rates));
}

function getUsageRateForEvent(event: UsageEvent, rates: UsageRateMap): UsageRate | undefined {
  return rates[event.modelId] ?? rates[event.providerId];
}

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

function isUsageRate(value: unknown): value is UsageRate {
  return (
    isRecord(value) &&
    typeof value.inputPerMillion === "number" &&
    typeof value.outputPerMillion === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
