// 本文件说明: 管理模型供应商, 可用模型和用户选择的持久化状态
import { catalogModels, providerCatalog } from "@shared/providerCatalog";
import { isUsableCodingModel, toForgeModel } from "@shared/providerModels";
import type {
  ForgeProvider,
  ForgeModel,
  IntelligenceLevel,
  Language,
  ModelPricing,
  ModelSettings,
  ReasoningControl,
  SpeedMode
} from "@shared/modelTypes";

const modelSettingsStorageKey = "forge.modelSettings";

type PersistedModelSettings = {
  language?: Language;
  intelligence?: IntelligenceLevel;
  speed?: SpeedMode | string;
  currentModelId?: string | null;
  providerBaseUrls?: Record<string, string>;
  customProviders?: PersistedCustomProvider[];
  detectedModels?: PersistedDetectedModel[];
  manualModels?: PersistedManualModel[];
};

type PersistedCustomProvider = {
  id: string;
  label: string;
  baseUrl?: string;
};

type PersistedManualModel = {
  providerId: string;
  modelName: string;
  label: string;
};

type PersistedDetectedModel = {
  providerId: string;
  modelName: string;
  label: string;
  enabled?: boolean;
  capabilities?: PersistedModelCapabilities;
  capabilitySource?: "provider-api" | "probe";
  contextWindow?: number;
  pricing?: ModelPricing;
  selectionCount?: number;
  lastSelectedAt?: string;
};

type PersistedModelCapabilities = Partial<{
  reasoning: ReasoningControl;
  toolCalling: boolean | "unknown";
  streaming: boolean | "unknown";
  vision: boolean | "unknown";
  contextWindow: number;
  speedModes: SpeedMode[];
}>;

// 创建模型设置默认值, 首次启动不默认启用任何远端模型
export function createDefaultModelSettings(): ModelSettings {
  return {
    language: "zh-CN",
    intelligence: "high",
    speed: "balanced",
    currentModelId: null,
    providers: providerCatalog.map((provider) => ({ ...provider })),
    models: []
  };
}

// 返回已启用模型并按当前选择优先排序
export function getEnabledModels(settings: ModelSettings): ForgeModel[] {
  return sortModelsForSelection(
    settings.models.filter((model) => model.enabled),
    settings.currentModelId
  );
}

// 返回设置页展示用模型列表, 包含未启用模型
export function getModelsForDisplay(settings: ModelSettings): ForgeModel[] {
  return sortModelsForSelection(settings.models, settings.currentModelId);
}

// 切换模型启用状态, 关闭当前模型时自动选择下一个可用模型
export function updateModelEnabled(
  settings: ModelSettings,
  modelId: string,
  enabled: boolean
): ModelSettings {
  const targetModelExists = settings.models.some((model) => model.id === modelId);

  if (!targetModelExists) {
    return settings;
  }

  const models = settings.models.map((model) =>
    model.id === modelId ? { ...model, enabled } : model
  );

  const enabledModels = sortModelsForSelection(
    models.filter((model) => model.enabled),
    settings.currentModelId
  );
  const currentModelStillEnabled = enabledModels.some((model) => model.id === settings.currentModelId);
  const currentModelId = currentModelStillEnabled
    ? settings.currentModelId
    : enabled
      ? modelId
      : (enabledModels[0]?.id ?? null);
  const currentModel = models.find((model) => model.id === currentModelId) ?? null;

  return {
    ...settings,
    models,
    currentModelId,
    speed: normalizeSpeedForModel(settings.speed, currentModel)
  };
}

// 记录当前模型并提升选择权重, 下次排序会优先显示
export function setCurrentModel(settings: ModelSettings, modelId: string): ModelSettings {
  const model = settings.models.find((candidate) => candidate.id === modelId);

  if (!model?.enabled) {
    return settings;
  }
  const selectedAt = new Date().toISOString();
  const models = settings.models.map((candidate) =>
    candidate.id === model.id
      ? {
          ...candidate,
          selectionCount: (candidate.selectionCount ?? 0) + 1,
          lastSelectedAt: selectedAt
        }
      : candidate
  );
  const selectedModel = models.find((candidate) => candidate.id === model.id) ?? model;

  return {
    ...settings,
    models,
    currentModelId: model.id,
    speed: normalizeSpeedForModel(settings.speed, selectedModel)
  };
}

// 更新智能档位, 发送请求时会映射到供应商推理参数
export function setIntelligence(
  settings: ModelSettings,
  intelligence: IntelligenceLevel
): ModelSettings {
  return { ...settings, intelligence };
}

// 更新速度档位, 后续请求会按模型能力选择服务档位
export function setSpeed(settings: ModelSettings, speed: SpeedMode): ModelSettings {
  const currentModel = settings.models.find((model) => model.id === settings.currentModelId) ?? null;

  return { ...settings, speed: normalizeSpeedForModel(speed, currentModel) };
}

// 更新界面语言, 模型设置和 UI 文案共用这个字段
export function setLanguage(settings: ModelSettings, language: Language): ModelSettings {
  return { ...settings, language };
}

// 合并远端拉取模型, 已存在模型保留用户启用状态和选择次数
export function mergeFetchedModels(settings: ModelSettings, fetchedModels: ForgeModel[]): ModelSettings {
  const existingModelsById = new Map(settings.models.map((model) => [model.id, model]));
  const nextModels = [...settings.models];

  for (const fetchedModel of fetchedModels) {
    const provider = settings.providers.find((candidate) => candidate.id === fetchedModel.providerId);

    if (provider && !isUsableCodingModel(provider, fetchedModel.modelName)) {
      continue;
    }

    const catalogModel = catalogModels.find(
      (model) =>
        model.providerId === fetchedModel.providerId &&
        model.modelName.toLowerCase() === fetchedModel.modelName.toLowerCase()
    );
    const modelWithKnownCapabilities = catalogModel
      ? {
          ...fetchedModel,
          capabilities: {
            ...fetchedModel.capabilities,
            ...catalogModel.capabilities,
            contextWindow:
              fetchedModel.capabilities.contextWindow ?? catalogModel.capabilities.contextWindow
          },
          pricing: fetchedModel.pricing ?? catalogModel.pricing
        }
      : fetchedModel;
    const existingModel = existingModelsById.get(fetchedModel.id);

    if (existingModel) {
      const nextModel = {
        ...modelWithKnownCapabilities,
        enabled: existingModel.enabled,
        selectionCount: existingModel.selectionCount,
        lastSelectedAt: existingModel.lastSelectedAt
      };
      const index = nextModels.findIndex((model) => model.id === fetchedModel.id);
      nextModels[index] = nextModel;
    } else {
      nextModels.push({ ...modelWithKnownCapabilities, enabled: false });
    }
  }

  const enabledModels = sortModelsForSelection(
    nextModels.filter((model) => model.enabled),
    settings.currentModelId
  );
  const currentModelId =
    settings.currentModelId && enabledModels.some((model) => model.id === settings.currentModelId)
      ? settings.currentModelId
      : (enabledModels[0]?.id ?? null);
  const currentModel = nextModels.find((model) => model.id === currentModelId) ?? null;

  return {
    ...settings,
    models: nextModels,
    currentModelId,
    speed: normalizeSpeedForModel(settings.speed, currentModel)
  };
}

// OpenRouter 启动缓存是参考资料: 先合入 OpenRouter 模型, 再给其他供应商的同名模型补价格和缓存价格
export function mergeOpenRouterReferenceModels(
  settings: ModelSettings,
  openRouterModels: ForgeModel[]
): ModelSettings {
  const withOpenRouterModels = mergeFetchedModels(settings, openRouterModels);
  const lookup = createOpenRouterReferenceLookup(openRouterModels);
  const models = withOpenRouterModels.models.map((model) => {
    if (model.providerId === "openrouter") {
      return model;
    }

    const reference = lookup.get(normalizeReferenceModelName(model.modelName));

    if (!reference) {
      return model;
    }

    return {
      ...model,
      pricing: mergeReferencePricing(model.pricing, reference.pricing),
      capabilities: {
        ...model.capabilities,
        contextWindow: model.capabilities.contextWindow ?? reference.capabilities.contextWindow,
        toolCalling:
          model.capabilities.toolCalling === "unknown"
            ? reference.capabilities.toolCalling
            : model.capabilities.toolCalling,
        streaming:
          model.capabilities.streaming === "unknown"
            ? reference.capabilities.streaming
            : model.capabilities.streaming,
        vision:
          model.capabilities.vision === "unknown"
            ? reference.capabilities.vision
            : model.capabilities.vision
      }
    };
  });
  const currentModel = models.find((model) => model.id === withOpenRouterModels.currentModelId) ?? null;

  return {
    ...withOpenRouterModels,
    models,
    speed: normalizeSpeedForModel(withOpenRouterModels.speed, currentModel)
  };
}

// 更新供应商 Base URL, 空值会恢复目录默认配置
export function updateProviderBaseUrl(
  settings: ModelSettings,
  providerId: string,
  baseUrl: string
): ModelSettings {
  return {
    ...settings,
    providers: settings.providers.map((provider) =>
      provider.id === providerId ? { ...provider, baseUrl } : provider
    )
  };
}

// 更新自定义供应商展示名, 内置供应商不允许改名
export function updateProviderLabel(
  settings: ModelSettings,
  providerId: string,
  label: string
): ModelSettings {
  const provider = settings.providers.find((candidate) => candidate.id === providerId);

  if (!provider?.custom) {
    return settings;
  }

  const existingLabels = settings.providers
    .filter((candidate) => candidate.id !== providerId)
    .map((candidate) => candidate.label);
  const uniqueLabel = createUniqueLabel(label.trim() || "Custom Provider", existingLabels);

  return {
    ...settings,
    providers: settings.providers.map((candidate) =>
      candidate.id === providerId ? { ...candidate, label: uniqueLabel } : candidate
    )
  };
}

// 创建 OpenAI compatible 自定义供应商, id 和名称都要去重
export function addCustomProvider(
  settings: ModelSettings,
  label: string,
  baseUrl: string
): ModelSettings {
  const normalizedLabel = createUniqueLabel(
    label.trim() || "Custom Provider",
    settings.providers.map((provider) => provider.label)
  );
  const normalizedBaseUrl = baseUrl.trim();
  const existingIds = new Set(settings.providers.map((provider) => provider.id));
  const provider: ForgeProvider = {
    id: createCustomProviderId(normalizedLabel, existingIds),
    label: normalizedLabel,
    kind: "openai-compatible",
    baseUrl: normalizedBaseUrl || undefined,
    requiresBaseUrl: true,
    custom: true
  };

  return {
    ...settings,
    providers: [...settings.providers, provider]
  };
}

// 删除自定义供应商并清理它的模型和当前选择
export function deleteCustomProvider(settings: ModelSettings, providerId: string): ModelSettings {
  const provider = settings.providers.find((candidate) => candidate.id === providerId);

  if (!provider?.custom) {
    return settings;
  }

  const providers = settings.providers.filter((candidate) => candidate.id !== providerId);
  const models = settings.models.filter((model) => model.providerId !== providerId);
  const enabledModels = sortModelsForSelection(
    models.filter((model) => model.enabled),
    settings.currentModelId
  );
  const currentModelId = enabledModels.some((model) => model.id === settings.currentModelId)
    ? settings.currentModelId
    : (enabledModels[0]?.id ?? null);
  const currentModel = models.find((model) => model.id === currentModelId) ?? null;

  return {
    ...settings,
    providers,
    models,
    currentModelId,
    speed: normalizeSpeedForModel(settings.speed, currentModel)
  };
}

// 清空某个供应商的检测模型, 保留用户手动添加的配置入口
export function removeProviderModels(settings: ModelSettings, providerId: string): ModelSettings {
  const models = settings.models.filter((model) => model.providerId !== providerId);
  const enabledModels = sortModelsForSelection(
    models.filter((model) => model.enabled),
    settings.currentModelId
  );
  const currentModelId = enabledModels.some((model) => model.id === settings.currentModelId)
    ? settings.currentModelId
    : (enabledModels[0]?.id ?? null);
  const currentModel = models.find((model) => model.id === currentModelId) ?? null;

  return {
    ...settings,
    models,
    currentModelId,
    speed: normalizeSpeedForModel(settings.speed, currentModel)
  };
}

// 添加用户手动填写的模型 id, 保存后立即作为可选模型使用
export function addManualModel(settings: ModelSettings, providerId: string, modelName: string): ModelSettings {
  const normalizedModelName = modelName.trim();

  if (!normalizedModelName || !settings.providers.some((provider) => provider.id === providerId)) {
    return settings;
  }

  const modelId = `${providerId}:${normalizedModelName}`;

  if (settings.models.some((model) => model.id === modelId)) {
    return updateModelEnabled(settings, modelId, true);
  }

  const model = createManualModel(providerId, normalizedModelName, normalizedModelName, true);

  return {
    ...settings,
    models: [...settings.models, model],
    currentModelId: settings.currentModelId ?? model.id
  };
}

// 只持久化用户可变字段, 内置目录每次启动重新合并
export function saveModelSettings(storage: Storage, settings: ModelSettings): void {
  const persisted: PersistedModelSettings = {
    language: settings.language,
    intelligence: settings.intelligence,
    speed: settings.speed,
    currentModelId: settings.currentModelId,
    providerBaseUrls: Object.fromEntries(
      settings.providers.flatMap((provider) =>
        provider.baseUrl ? [[provider.id, provider.baseUrl] as const] : []
      )
    ),
    customProviders: settings.providers
      .filter((provider) => provider.custom)
      .map((provider) => ({
        id: provider.id,
        label: provider.label,
        baseUrl: provider.baseUrl
      })),
    detectedModels: settings.models
      .filter((model) => model.capabilitySource === "provider-api" || model.capabilitySource === "probe")
      .map((model) => ({
        providerId: model.providerId,
        modelName: model.modelName,
        label: model.label,
        enabled: model.enabled,
        capabilities: serializeModelCapabilities(model.capabilities),
        capabilitySource: model.capabilitySource === "probe" ? "probe" : "provider-api",
        contextWindow: model.capabilities.contextWindow,
        pricing: model.pricing,
        selectionCount: model.selectionCount,
        lastSelectedAt: model.lastSelectedAt
      })),
    manualModels: settings.models
      .filter((model) => model.capabilitySource === "manual")
      .map((model) => ({
        providerId: model.providerId,
        modelName: model.modelName,
        label: model.label
      }))
  };

  storage.setItem(modelSettingsStorageKey, JSON.stringify(persisted));
}

// 从 localStorage 读取模型设置, 失败时回退默认并重新合并目录
export function loadModelSettings(storage: Storage): ModelSettings {
  const rawValue = storage.getItem(modelSettingsStorageKey);

  if (!rawValue) {
    return createDefaultModelSettings();
  }

  try {
    return mergePersistedSettings(JSON.parse(rawValue) as PersistedModelSettings);
  } catch {
    return createDefaultModelSettings();
  }
}

// 把持久化字段合并到最新目录, 兼容供应商和模型目录变更
function mergePersistedSettings(persisted: PersistedModelSettings): ModelSettings {
  const defaults = createDefaultModelSettings();
  const customProviders = (persisted.customProviders ?? [])
    .filter((provider) => provider.id)
    .map(
      (provider): ForgeProvider => ({
        id: provider.id,
        label: provider.label || "Custom Provider",
        kind: "openai-compatible",
        baseUrl: persisted.providerBaseUrls?.[provider.id] ?? provider.baseUrl,
        requiresBaseUrl: true,
        custom: true
      })
    );
  const providers = [
    ...defaults.providers.map((provider) => ({
      ...provider,
      baseUrl: persisted.providerBaseUrls?.[provider.id] ?? provider.baseUrl
    })),
    ...customProviders
  ];
  const detectedModels = (persisted.detectedModels ?? [])
    .filter((model) => model.providerId && model.modelName)
    .map((model) => {
      const detectedModel = createDetectedModel(
        providers,
        model.providerId,
        model.modelName,
        model.label || model.modelName
      );
      const persistedContextWindow = readPersistedContextWindow(model.contextWindow);
      const persistedCapabilities = readPersistedModelCapabilities(
        model.capabilities,
        model.contextWindow
      );

      return {
        ...detectedModel,
        enabled: model.enabled === true,
        capabilitySource:
          readPersistedDetectedCapabilitySource(model.capabilitySource) ??
          detectedModel.capabilitySource,
        capabilities: {
          ...detectedModel.capabilities,
          ...persistedCapabilities,
          contextWindow:
            persistedCapabilities.contextWindow ??
            persistedContextWindow ??
            detectedModel.capabilities.contextWindow
        },
        pricing: isModelPricing(model.pricing) ? model.pricing : detectedModel.pricing,
        selectionCount:
          typeof model.selectionCount === "number" && Number.isFinite(model.selectionCount)
            ? Math.max(0, model.selectionCount)
            : undefined,
        lastSelectedAt: typeof model.lastSelectedAt === "string" ? model.lastSelectedAt : undefined
      };
    });
  const manualModels = (persisted.manualModels ?? [])
    .filter((model) => model.providerId && model.modelName)
    .map((model) =>
      createManualModel(model.providerId, model.modelName, model.label || model.modelName, true)
    );
  const models = dedupeModelsById([...detectedModels, ...manualModels])
    .filter((model) => {
      const provider = providers.find((candidate) => candidate.id === model.providerId);

      return provider ? isUsableCodingModel(provider, model.modelName) : true;
    });
  const enabledModels = sortModelsForSelection(
    models.filter((model) => model.enabled),
    persisted.currentModelId ?? null
  );
  const currentModelId =
    persisted.currentModelId && enabledModels.some((model) => model.id === persisted.currentModelId)
      ? persisted.currentModelId
      : (enabledModels[0]?.id ?? null);

  return {
    ...defaults,
    language: persisted.language ?? defaults.language,
    intelligence: persisted.intelligence ?? defaults.intelligence,
    speed: normalizeSpeedForModel(
      normalizeSpeed(persisted.speed, defaults.speed),
      models.find((model) => model.id === currentModelId) ?? null
    ),
    currentModelId,
    providers,
    models
  };
}

// 按模型 id 去重, 后出现的同 id 模型覆盖旧条目
function dedupeModelsById(models: ForgeModel[]): ForgeModel[] {
  const modelsById = new Map<string, ForgeModel>();

  for (const model of models) {
    modelsById.set(model.id, { ...modelsById.get(model.id), ...model });
  }

  return Array.from(modelsById.values());
}

function createOpenRouterReferenceLookup(models: ForgeModel[]): Map<string, ForgeModel> {
  const lookup = new Map<string, ForgeModel>();

  for (const model of models) {
    const aliases = new Set([
      normalizeReferenceModelName(model.modelName),
      normalizeReferenceModelName(model.modelName.split("/").at(-1) ?? model.modelName)
    ]);

    for (const alias of aliases) {
      if (alias && !lookup.has(alias)) {
        lookup.set(alias, model);
      }
    }
  }

  return lookup;
}

function mergeReferencePricing(
  currentPricing: ModelPricing | undefined,
  referencePricing: ModelPricing | undefined
): ModelPricing | undefined {
  if (!referencePricing) {
    return currentPricing;
  }

  if (!currentPricing) {
    return {
      ...referencePricing,
      source: "openrouter-reference"
    };
  }

  if (currentPricing.source === "openrouter-reference") {
    return {
      ...referencePricing,
      source: "openrouter-reference"
    };
  }

  return {
    inputPerMillion: currentPricing.inputPerMillion,
    outputPerMillion: currentPricing.outputPerMillion,
    cacheReadPerMillion:
      currentPricing.cacheReadPerMillion ?? referencePricing.cacheReadPerMillion,
    cacheWritePerMillion:
      currentPricing.cacheWritePerMillion ?? referencePricing.cacheWritePerMillion,
    source: currentPricing.source ?? "provider-api"
  };
}

function normalizeReferenceModelName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^models\//u, "")
    .replace(/[:_\s]+/gu, "-");
}

// 从持久化远端模型恢复 ForgeModel, 无效编码模型会被过滤
function createDetectedModel(
  providers: ForgeProvider[],
  providerId: string,
  modelName: string,
  label: string
): ForgeModel {
  const catalogModel = catalogModels.find(
    (model) =>
      model.providerId === providerId &&
      model.modelName.toLowerCase() === modelName.toLowerCase()
  );

  const provider = providers.find((candidate) => candidate.id === providerId);
  const fetchedModel = provider ? toForgeModel(provider, { id: modelName, label }) : null;

  return {
    ...(fetchedModel ?? {
      id: `${providerId}:${modelName}`,
      providerId,
      label,
      modelName,
      enabled: true,
      capabilities: {
        reasoning: { type: "none" },
        toolCalling: "unknown",
        streaming: "unknown",
        vision: "unknown"
      },
      capabilitySource: "provider-api" as const
    }),
    enabled: true,
    capabilities: catalogModel?.capabilities ?? fetchedModel?.capabilities ?? {
      reasoning: { type: "none" },
      toolCalling: "unknown",
      streaming: "unknown",
      vision: "unknown"
    }
  };
}

// 校验速度字段, 旧数据里的未知值统一回到 balanced
function normalizeSpeed(value: unknown, fallback: SpeedMode): SpeedMode {
  return value === "fast" || value === "balanced" ? value : fallback;
}

// 保存供应商能力探测结果, 让重启后模型选择和 Agent 请求仍能读取真实能力
function serializeModelCapabilities(
  capabilities: ForgeModel["capabilities"]
): PersistedModelCapabilities {
  return {
    reasoning: capabilities.reasoning,
    toolCalling: capabilities.toolCalling,
    streaming: capabilities.streaming,
    vision: capabilities.vision,
    contextWindow: capabilities.contextWindow,
    speedModes: capabilities.speedModes
  };
}

// 从持久化数据中安全恢复能力字段, 坏数据只丢弃对应字段而不重置整个设置
function readPersistedModelCapabilities(
  value: unknown,
  legacyContextWindow?: unknown
): PersistedModelCapabilities {
  const capabilities: PersistedModelCapabilities = {};

  if (isRecord(value)) {
    const reasoning = readPersistedReasoningControl(value.reasoning);
    const toolCalling = readTriStateCapability(value.toolCalling);
    const streaming = readTriStateCapability(value.streaming);
    const vision = readTriStateCapability(value.vision);
    const speedModes = readPersistedSpeedModes(value.speedModes);
    const contextWindow = readPersistedContextWindow(value.contextWindow);

    if (reasoning) {
      capabilities.reasoning = reasoning;
    }

    if (toolCalling !== undefined) {
      capabilities.toolCalling = toolCalling;
    }

    if (streaming !== undefined) {
      capabilities.streaming = streaming;
    }

    if (vision !== undefined) {
      capabilities.vision = vision;
    }

    if (speedModes) {
      capabilities.speedModes = speedModes;
    }

    if (contextWindow) {
      capabilities.contextWindow = contextWindow;
    }
  }

  capabilities.contextWindow ??= readPersistedContextWindow(legacyContextWindow);

  return capabilities;
}

// 恢复 provider-api/probe 来源标签, 避免坏数据伪装成内置或手动模型
function readPersistedDetectedCapabilitySource(
  value: unknown
): PersistedDetectedModel["capabilitySource"] | undefined {
  return value === "provider-api" || value === "probe" ? value : undefined;
}

// 恢复推理控制方式, 同时限制 effort 档位和 budget 数字范围
function readPersistedReasoningControl(value: unknown): ReasoningControl | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === "none") {
    return { type: "none" };
  }

  if (value.type === "effort") {
    const values = readPersistedIntelligenceLevels(value.values);

    return values.length > 0 ? { type: "effort", values } : undefined;
  }

  if (value.type === "budget") {
    const min = readFiniteNumber(value.min);
    const max = readFiniteNumber(value.max);

    if (min === undefined || max === undefined || min < 0 || max < min) {
      return undefined;
    }

    return { type: "budget", min: Math.round(min), max: Math.round(max) };
  }

  return undefined;
}

// 恢复布尔或 unknown 能力, 其他值视为损坏字段
function readTriStateCapability(value: unknown): boolean | "unknown" | undefined {
  return value === true || value === false || value === "unknown" ? value : undefined;
}

// 恢复速度模式并去重, 防止持久化数组夹带未知值
function readPersistedSpeedModes(value: unknown): SpeedMode[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const speedModes = value
    .filter(isSpeedMode)
    .filter((mode, index, modes) => modes.indexOf(mode) === index);

  return speedModes.length > 0 ? speedModes : undefined;
}

// 恢复 intelligence 档位并去重, 供应商返回的顺序保持不变
function readPersistedIntelligenceLevels(value: unknown): IntelligenceLevel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isIntelligenceLevel)
    .filter((level, index, levels) => levels.indexOf(level) === index);
}

// 读取持久化上下文窗口, 非正数直接忽略
function readPersistedContextWindow(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

// 收窄普通对象类型, 供持久化字段校验复用
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 判断是否是 Forge 支持的速度档位
function isSpeedMode(value: unknown): value is SpeedMode {
  return value === "fast" || value === "balanced";
}

// 判断是否是 Forge 支持的智能档位
function isIntelligenceLevel(value: unknown): value is IntelligenceLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

// 读取有限数字, 其他类型不进入能力配置
function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// 校验模型价格对象, 输入和输出价格可以单独存在
function isModelPricing(value: unknown): value is ModelPricing {
  return (
    typeof value === "object" &&
    value !== null &&
    "inputPerMillion" in value &&
    "outputPerMillion" in value &&
    typeof value.inputPerMillion === "number" &&
    typeof value.outputPerMillion === "number" &&
    Number.isFinite(value.inputPerMillion) &&
    Number.isFinite(value.outputPerMillion) &&
    value.inputPerMillion >= 0 &&
    value.outputPerMillion >= 0 &&
    (!("cacheReadPerMillion" in value) ||
      value.cacheReadPerMillion === undefined ||
      (typeof value.cacheReadPerMillion === "number" &&
        Number.isFinite(value.cacheReadPerMillion) &&
        value.cacheReadPerMillion >= 0)) &&
    (!("cacheWritePerMillion" in value) ||
      value.cacheWritePerMillion === undefined ||
      (typeof value.cacheWritePerMillion === "number" &&
        Number.isFinite(value.cacheWritePerMillion) &&
        value.cacheWritePerMillion >= 0))
  );
}

// 模型不支持当前速度时回退到该模型的第一个可用速度
function normalizeSpeedForModel(speed: SpeedMode, model: ForgeModel | null): SpeedMode {
  return model?.capabilities.speedModes?.includes(speed) ? speed : "balanced";
}

// 当前模型排最前, 其余模型按选择次数和最近使用时间排序
function sortModelsForSelection(models: ForgeModel[], currentModelId: string | null): ForgeModel[] {
  return [...models].sort((first, second) => {
    if (first.id === currentModelId && second.id !== currentModelId) {
      return -1;
    }

    if (second.id === currentModelId && first.id !== currentModelId) {
      return 1;
    }

    const selectionDelta = (second.selectionCount ?? 0) - (first.selectionCount ?? 0);

    if (selectionDelta !== 0) {
      return selectionDelta;
    }

    const recencyDelta =
      Date.parse(second.lastSelectedAt ?? "") - Date.parse(first.lastSelectedAt ?? "");

    if (Number.isFinite(recencyDelta) && recencyDelta !== 0) {
      return recencyDelta;
    }

    if (first.enabled !== second.enabled) {
      return first.enabled ? -1 : 1;
    }

    return first.label.localeCompare(second.label);
  });
}

// 根据供应商名称生成稳定 id, 冲突时自动追加序号
function createCustomProviderId(label: string, existingIds: Set<string>): string {
  const normalizedLabel =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider";
  let id = `custom-${normalizedLabel}`;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `custom-${normalizedLabel}-${suffix}`;
    suffix += 1;
  }

  return id;
}

// 为重复名称生成带序号的展示名
function createUniqueLabel(label: string, existingLabels: string[]): string {
  const normalizedLabel = label.trim() || "Custom Provider";
  const existing = new Set(existingLabels.map((candidate) => candidate.trim().toLowerCase()));

  if (!existing.has(normalizedLabel.toLowerCase())) {
    return normalizedLabel;
  }

  let suffix = 2;
  let candidate = `${normalizedLabel} ${suffix}`;

  while (existing.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${normalizedLabel} ${suffix}`;
  }

  return candidate;
}

// 构造手动模型并默认启用, 供用户绕过远端模型列表失败
function createManualModel(
  providerId: string,
  modelName: string,
  label: string,
  enabled: boolean
): ForgeModel {
  return {
    id: `${providerId}:${modelName}`,
    providerId,
    label,
    modelName,
    enabled,
    capabilities: {
      reasoning: { type: "none" },
      toolCalling: "unknown",
      streaming: "unknown",
      vision: "unknown"
    },
    capabilitySource: "manual"
  };
}
