// 本文件说明: 渲染输入框内的紧凑模型选择器
import type { ReactElement } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Zap } from "lucide-react";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import type { MessageKey } from "@/i18n/messages";
import { useI18n } from "@/i18n/useI18n";
import { getEnabledModels } from "@/state/modelSettings";
import { ProviderMark } from "./ProviderMark";
import { Tooltip } from "./Tooltip";

type ModelSelectorProps = {
  settings: ModelSettings;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
  onOpenSettings?: () => void;
};

const intelligenceLevels: IntelligenceLevel[] = ["low", "medium", "high", "xhigh"];

const intelligenceLabels: Record<IntelligenceLevel, MessageKey> = {
  low: "selector.low",
  medium: "selector.medium",
  high: "selector.high",
  xhigh: "selector.xhigh"
};

const speedLabels: Record<SpeedMode, MessageKey> = {
  fast: "selector.fast",
  balanced: "selector.balanced"
};

// 渲染紧凑模型选择器, 输入框内和设置页都使用同一套选项数据
export function ModelSelector({
  settings,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed,
  onOpenSettings
}: ModelSelectorProps): ReactElement {
  const { t } = useI18n(settings.language);
  const enabledModels = getEnabledModels(settings);
  const currentModel =
    enabledModels.find((model) => model.id === settings.currentModelId) ?? enabledModels[0] ?? null;
  const providerById = new Map(settings.providers.map((provider) => [provider.id, provider]));
  const providerLabelById = new Map(
    settings.providers.map((provider) => [provider.id, provider.label.trim() || provider.id])
  );
  const currentProvider = currentModel ? (providerById.get(currentModel.providerId) ?? null) : null;
  const currentProviderLabel = currentModel
    ? (providerLabelById.get(currentModel.providerId) ?? currentModel.providerId)
    : "";
  const supportsReasoning = currentModel?.capabilities.reasoning.type !== "none";
  const currentSpeedModes = currentModel?.capabilities.speedModes ?? [];
  const supportsSpeed = currentSpeedModes.length > 1;
  const isFast = supportsSpeed && settings.speed === "fast";
  const intelligenceLabel = supportsReasoning
    ? t(intelligenceLabels[settings.intelligence])
    : t("selector.noReasoning");
  const triggerLabel = currentModel
    ? `${currentModel.label}  ${intelligenceLabel}`
    : t("selector.configureModel");

  if (!currentModel && onOpenSettings) {
    return (
      <Tooltip label={triggerLabel}>
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-2 text-[12px] font-medium text-[#202123] outline-none transition hover:bg-[#f7f7f8] active:scale-[0.99] focus:outline-none focus-visible:outline-none"
          aria-label={triggerLabel}
        >
          <span className="truncate">{triggerLabel}</span>
        </button>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu.Root>
      <Tooltip label={triggerLabel}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-2 text-[12px] font-medium text-[#202123] outline-none transition hover:bg-[#f7f7f8] active:scale-[0.99] focus:outline-none focus-visible:outline-none"
            aria-label={triggerLabel}
          >
            {isFast ? <Zap className="h-3 w-3 text-[#202123]" /> : null}
            {currentProvider ? (
              <ProviderMark
                provider={currentProvider}
                fallbackLabel={currentProviderLabel}
                size="xs"
              />
            ) : null}
            <span className="truncate">{triggerLabel}</span>
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="forge-dropdown-content forge-dropdown-fast z-50 w-60 rounded-[14px] border border-[#d9d9e3] bg-white p-1.5 text-[#202123] shadow-[0_18px_52px_rgba(0,0,0,0.14)]"
        >
          <DropdownMenu.Label className="px-2 py-1 text-[11px] text-[#6e6e80]">
            {t("selector.intelligence")}
          </DropdownMenu.Label>
          {supportsReasoning ? (
            intelligenceLevels.map((level) => (
              <DropdownMenu.Item
                key={level}
                onSelect={() => onSelectIntelligence(level)}
                className="flex h-8 cursor-default items-center justify-between rounded-[10px] px-2 text-[12px] outline-none data-[highlighted]:bg-[#f7f7f8]"
              >
                {t(intelligenceLabels[level])}
                {settings.intelligence === level ? <Check className="h-4 w-4 text-[#202123]" /> : null}
              </DropdownMenu.Item>
            ))
          ) : (
            <DropdownMenu.Item className="flex h-8 cursor-default items-center rounded-[10px] px-2 text-[12px] text-[#6e6e80] outline-none">
              {t("selector.noReasoning")}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-2 h-px bg-[#ececf1]" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex h-8 cursor-default items-center justify-between rounded-[10px] px-2 text-[12px] outline-none data-[highlighted]:bg-[#f7f7f8]">
              <span className="inline-flex items-center gap-2">
                {isFast ? <Zap className="h-3 w-3 text-[#202123]" /> : null}
                {currentProvider ? (
                  <ProviderMark
                    provider={currentProvider}
                    fallbackLabel={currentProviderLabel}
                    size="xs"
                  />
                ) : null}
                {currentModel?.label ?? t("selector.configureModel")}
              </span>
              <ChevronRight className="h-4 w-4 text-[#6e6e80]" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={10}
                className="forge-dropdown-content forge-dropdown-fast forge-model-menu-content forge-scrollbar-none z-50 max-h-[min(300px,calc(100vh-120px))] w-60 overflow-y-auto rounded-[14px] border border-[#d9d9e3] bg-white p-1.5 text-[#202123] shadow-[0_18px_52px_rgba(0,0,0,0.14)]"
              >
                <DropdownMenu.Label className="px-2 py-1 text-[11px] text-[#6e6e80]">
                  {t("selector.model")}
                </DropdownMenu.Label>
                {enabledModels.map((model) => (
                  <DropdownMenu.Item
                    key={model.id}
                    onSelect={() => onSelectModel(model.id)}
                    className="flex min-h-9 cursor-default items-center justify-between gap-2 rounded-[10px] px-2 py-1 outline-none data-[highlighted]:bg-[#f7f7f8]"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <ProviderMark
                        provider={providerById.get(model.providerId) ?? null}
                        fallbackLabel={providerLabelById.get(model.providerId) ?? model.providerId}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-[#202123]">{model.label}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-[#565869]">
                          {t("selector.modelSource")} {providerLabelById.get(model.providerId) ?? model.providerId}
                        </span>
                      </span>
                    </span>
                    {currentModel?.id === model.id ? <Check className="h-4 w-4 text-[#202123]" /> : null}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          {supportsSpeed ? (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="flex h-8 cursor-default items-center justify-between rounded-[10px] px-2 text-[12px] outline-none data-[highlighted]:bg-[#f7f7f8]">
                <span>{t("selector.speed")}</span>
                <ChevronRight className="h-4 w-4 text-[#6e6e80]" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  sideOffset={10}
                  className="forge-dropdown-content forge-dropdown-fast z-50 w-48 rounded-[14px] border border-[#d9d9e3] bg-white p-1.5 text-[#202123] shadow-[0_18px_52px_rgba(0,0,0,0.14)]"
                >
                  <DropdownMenu.Label className="px-2 py-1 text-[11px] text-[#6e6e80]">
                    {t("selector.speed")}
                  </DropdownMenu.Label>
                  {currentSpeedModes.map((speed) => (
                    <DropdownMenu.Item
                      key={speed}
                      onSelect={() => onSelectSpeed(speed)}
                      className="flex h-8 cursor-default items-center justify-between rounded-[10px] px-2 text-[12px] outline-none data-[highlighted]:bg-[#f7f7f8]"
                    >
                      {t(speedLabels[speed])}
                      {settings.speed === speed ? <Check className="h-4 w-4 text-[#202123]" /> : null}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
