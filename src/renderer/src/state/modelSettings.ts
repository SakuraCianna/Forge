import { catalogModels, providerCatalog } from "@shared/providerCatalog";
import type { ForgeModel, IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";

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
