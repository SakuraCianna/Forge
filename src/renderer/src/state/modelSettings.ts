import { catalogModels, providerCatalog } from "@shared/providerCatalog";
import type {
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
  enabledModelIds?: string[];
};

export function createDefaultModelSettings(): ModelSettings {
  return {
    language: "zh-CN",
    intelligence: "high",
    speed: "balanced",
    currentModelId: null,
    providers: providerCatalog,
    models: catalogModels
  };
}

export function getEnabledModels(settings: ModelSettings): ForgeModel[] {
  return settings.models.filter((model) => model.enabled);
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
  const model = settings.models.find((candidate) => candidate.id === modelId && candidate.enabled);

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
        enabled: existingModel.enabled
      };
      const index = nextModels.findIndex((model) => model.id === fetchedModel.id);
      nextModels[index] = nextModel;
    } else {
      nextModels.push({ ...fetchedModel, enabled: false });
    }
  }

  return {
    ...settings,
    models: nextModels
  };
}

export function saveModelSettings(storage: Storage, settings: ModelSettings): void {
  const persisted: PersistedModelSettings = {
    language: settings.language,
    intelligence: settings.intelligence,
    speed: settings.speed,
    currentModelId: settings.currentModelId,
    enabledModelIds: getEnabledModels(settings).map((model) => model.id)
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
  const enabledModelIds = new Set(persisted.enabledModelIds ?? []);
  const models = defaults.models.map((model) => ({
    ...model,
    enabled: enabledModelIds.has(model.id)
  }));
  const currentModelId =
    persisted.currentModelId && enabledModelIds.has(persisted.currentModelId)
      ? persisted.currentModelId
      : (models.find((model) => model.enabled)?.id ?? null);

  return {
    ...defaults,
    language: persisted.language ?? defaults.language,
    intelligence: persisted.intelligence ?? defaults.intelligence,
    speed: persisted.speed ?? defaults.speed,
    currentModelId,
    models
  };
}
