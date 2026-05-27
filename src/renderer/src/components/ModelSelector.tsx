import type { ReactElement } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Zap } from "lucide-react";
import type { IntelligenceLevel, ModelSettings, SpeedMode } from "@shared/modelTypes";
import type { MessageKey } from "@/i18n/messages";
import { useI18n } from "@/i18n/useI18n";
import { getEnabledModels } from "@/state/modelSettings";

type ModelSelectorProps = {
  settings: ModelSettings;
  onSelectModel: (modelId: string) => void;
  onSelectIntelligence: (level: IntelligenceLevel) => void;
  onSelectSpeed: (speed: SpeedMode) => void;
};

const intelligenceLevels: IntelligenceLevel[] = ["low", "medium", "high", "xhigh"];
const speedModes: SpeedMode[] = ["fast", "balanced", "careful"];

const intelligenceLabels: Record<IntelligenceLevel, MessageKey> = {
  low: "selector.low",
  medium: "selector.medium",
  high: "selector.high",
  xhigh: "selector.xhigh"
};

const speedLabels: Record<SpeedMode, MessageKey> = {
  fast: "selector.fast",
  balanced: "selector.balanced",
  careful: "selector.careful"
};

export function ModelSelector({
  settings,
  onSelectModel,
  onSelectIntelligence,
  onSelectSpeed
}: ModelSelectorProps): ReactElement {
  const { t } = useI18n(settings.language);
  const enabledModels = getEnabledModels(settings);
  const currentModel =
    enabledModels.find((model) => model.id === settings.currentModelId) ?? enabledModels[0] ?? null;
  const supportsReasoning = currentModel?.capabilities.reasoning.type !== "none";
  const intelligenceLabel = supportsReasoning
    ? t(intelligenceLabels[settings.intelligence])
    : t("selector.noReasoning");
  const triggerLabel = currentModel
    ? `${currentModel.label}  ${intelligenceLabel}`
    : t("selector.configureModel");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[#3f3a34] hover:bg-black/6"
          aria-label={triggerLabel}
        >
          <Zap className="h-4 w-4" />
          <span>{triggerLabel}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 w-72 rounded-lg border border-black/10 bg-[#f7f5f0] p-2 text-[#222] shadow-xl"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8a8178]">
            {t("selector.intelligence")}
          </DropdownMenu.Label>
          {supportsReasoning ? (
            intelligenceLevels.map((level) => (
              <DropdownMenu.Item
                key={level}
                onSelect={() => onSelectIntelligence(level)}
                className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6"
              >
                {t(intelligenceLabels[level])}
                {settings.intelligence === level ? <Check className="h-4 w-4" /> : null}
              </DropdownMenu.Item>
            ))
          ) : (
            <DropdownMenu.Item className="flex h-10 cursor-default items-center rounded-md px-2 text-base outline-none">
              {t("selector.noReasoning")}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-2 h-px bg-black/10" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6">
              <span className="inline-flex items-center gap-2">
                <Zap className="h-4 w-4" />
                {currentModel?.label ?? t("selector.configureModel")}
              </span>
              <ChevronRight className="h-4 w-4" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={10}
                className="z-50 w-72 rounded-lg border border-black/10 bg-[#f7f5f0] p-2 text-[#222] shadow-xl"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8a8178]">
                  {t("selector.model")}
                </DropdownMenu.Label>
                {enabledModels.map((model) => (
                  <DropdownMenu.Item
                    key={model.id}
                    onSelect={() => onSelectModel(model.id)}
                    className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6"
                  >
                    <span className="inline-flex items-center gap-2">
                      {model.capabilities.reasoning.type !== "none" ? <Zap className="h-4 w-4" /> : null}
                      {model.label}
                    </span>
                    {currentModel?.id === model.id ? <Check className="h-4 w-4" /> : null}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6">
              <span>{t("selector.speed")}</span>
              <ChevronRight className="h-4 w-4" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={10}
                className="z-50 w-56 rounded-lg border border-black/10 bg-[#f7f5f0] p-2 text-[#222] shadow-xl"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8a8178]">
                  {t("selector.speed")}
                </DropdownMenu.Label>
                {speedModes.map((speed) => (
                  <DropdownMenu.Item
                    key={speed}
                    onSelect={() => onSelectSpeed(speed)}
                    className="flex h-10 cursor-default items-center justify-between rounded-md px-2 text-base outline-none data-[highlighted]:bg-black/6"
                  >
                    {t(speedLabels[speed])}
                    {settings.speed === speed ? <Check className="h-4 w-4" /> : null}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
