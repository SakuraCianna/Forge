import { catalogModels, providerCatalog } from "@shared/providerCatalog";
import type {
  ForgeProvider,
  ForgeModel,
  IntelligenceLevel,
  Language,
  ModelSettings,
  SpeedMode
} from "@shared/modelTypes";

const modelSettingsStorageKey = "forge.modelSettings";

type PersistedModelSettings = {
  language?: Language;
  intelligence?: IntelligenceLevel;
  speed?: SpeedMode;
  currentModelId?: string | null;
  providerBaseUrls?: Record<string, string>;
  customProviders?: PersistedCustomProvider[];
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

export function createDefaultModelSettings(): ModelSettings {
  return {
    language: "zh-CN",
    intelligence: "high",
    speed: "balanced",
    currentModelId: catalogModels[0]?.id ?? null,
    providers: providerCatalog.map((provider) => ({ ...provider })),
    models: catalogModels.map((model) => ({ ...model, enabled: true }))
  };
}

export function getEnabledModels(settings: ModelSettings): ForgeModel[] {
  return settings.models;
}

export function updateModelEnabled(
  settings: ModelSettings,
  modelId: string,
  enabled: boolean
): ModelSettings {
  const models = settings.models.map((model) =>
    model.id === modelId ? { ...model, enabled } : model
  );

  const enabledModels = models.filter((model) => model.enabled);
  const currentModelStillEnabled = enabledModels.some((model) => model.id === settings.currentModelId);

  return {
    ...settings,
    models,
    currentModelId: currentModelStillEnabled ? settings.currentModelId : (enabledModels[0]?.id ?? null)
  };
}

export function setCurrentModel(settings: ModelSettings, modelId: string): ModelSettings {
  const model = settings.models.find((candidate) => candidate.id === modelId);

  if (!model) {
    return settings;
  }

  return {
    ...settings,
    currentModelId: model.id
  };
}

export function setIntelligence(
  settings: ModelSettings,
  intelligence: IntelligenceLevel
): ModelSettings {
  return { ...settings, intelligence };
}

export function setSpeed(settings: ModelSettings, speed: SpeedMode): ModelSettings {
  return { ...settings, speed };
}

export function setLanguage(settings: ModelSettings, language: Language): ModelSettings {
  return { ...settings, language };
}

export function mergeFetchedModels(settings: ModelSettings, fetchedModels: ForgeModel[]): ModelSettings {
  const existingModelsById = new Map(settings.models.map((model) => [model.id, model]));
  const nextModels = [...settings.models];

  for (const fetchedModel of fetchedModels) {
    const existingModel = existingModelsById.get(fetchedModel.id);

    if (existingModel) {
      const nextModel = {
        ...fetchedModel,
        enabled: true
      };
      const index = nextModels.findIndex((model) => model.id === fetchedModel.id);
      nextModels[index] = nextModel;
    } else {
      nextModels.push({ ...fetchedModel, enabled: true });
    }
  }

  return {
    ...settings,
    models: nextModels,
    currentModelId: settings.currentModelId ?? nextModels[0]?.id ?? null
  };
}

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

export function updateProviderLabel(
  settings: ModelSettings,
  providerId: string,
  label: string
): ModelSettings {
  const provider = settings.providers.find((candidate) => candidate.id === providerId);

  if (!provider?.custom) {
    return settings;
  }

  return {
    ...settings,
    providers: settings.providers.map((candidate) =>
      candidate.id === providerId ? { ...candidate, label } : candidate
    )
  };
}

export function addCustomProvider(
  settings: ModelSettings,
  label: string,
  baseUrl: string
): ModelSettings {
  const normalizedLabel = label.trim() || "Custom Provider";
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

export function deleteCustomProvider(settings: ModelSettings, providerId: string): ModelSettings {
  const provider = settings.providers.find((candidate) => candidate.id === providerId);

  if (!provider?.custom) {
    return settings;
  }

  const providers = settings.providers.filter((candidate) => candidate.id !== providerId);
  const models = settings.models.filter((model) => model.providerId !== providerId);
  const currentModelId = models.some((model) => model.id === settings.currentModelId)
    ? settings.currentModelId
    : (models[0]?.id ?? null);

  return {
    ...settings,
    providers,
    models,
    currentModelId
  };
}

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
  const manualModels = (persisted.manualModels ?? [])
    .filter((model) => model.providerId && model.modelName)
    .map((model) =>
      createManualModel(
        model.providerId,
        model.modelName,
        model.label || model.modelName,
        true
      )
    );
  const models = [...defaults.models, ...manualModels].map((model) => ({
    ...model,
    enabled: true
  }));
  const currentModelId =
    persisted.currentModelId && models.some((model) => model.id === persisted.currentModelId)
      ? persisted.currentModelId
      : (models[0]?.id ?? null);

  return {
    ...defaults,
    language: persisted.language ?? defaults.language,
    intelligence: persisted.intelligence ?? defaults.intelligence,
    speed: persisted.speed ?? defaults.speed,
    currentModelId,
    providers,
    models
  };
}

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
