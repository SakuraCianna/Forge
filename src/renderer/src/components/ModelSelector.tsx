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
          className="inline-flex h-9 items-center gap-2 rounded-[13px] border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a] px-2.5 text-sm font-medium text-[#dbe7f5] transition hover:border-[rgba(148,163,184,0.32)] hover:bg-[#16243a] active:scale-[0.99]"
          aria-label={triggerLabel}
        >
          <Zap className="h-4 w-4 text-[#ff8d6d]" />
          <span>{triggerLabel}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 w-72 rounded-[18px] border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a]/96 p-2 text-[#e5edf7] shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8ea0b8]">
            {t("selector.intelligence")}
          </DropdownMenu.Label>
          {supportsReasoning ? (
            intelligenceLevels.map((level) => (
              <DropdownMenu.Item
                key={level}
                onSelect={() => onSelectIntelligence(level)}
                className="flex h-10 cursor-default items-center justify-between rounded-[12px] px-2 text-base outline-none data-[highlighted]:bg-[#17243a]"
              >
                {t(intelligenceLabels[level])}
                {settings.intelligence === level ? <Check className="h-4 w-4 text-[#ff8d6d]" /> : null}
              </DropdownMenu.Item>
            ))
          ) : (
            <DropdownMenu.Item className="flex h-10 cursor-default items-center rounded-[12px] px-2 text-base text-[#8ea0b8] outline-none">
              {t("selector.noReasoning")}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-2 h-px bg-[rgba(148,163,184,0.16)]" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex h-10 cursor-default items-center justify-between rounded-[12px] px-2 text-base outline-none data-[highlighted]:bg-[#17243a]">
              <span className="inline-flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#ff8d6d]" />
                {currentModel?.label ?? t("selector.configureModel")}
              </span>
              <ChevronRight className="h-4 w-4 text-[#8ea0b8]" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={10}
                className="z-50 w-72 rounded-[18px] border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a]/96 p-2 text-[#e5edf7] shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8ea0b8]">
                  {t("selector.model")}
                </DropdownMenu.Label>
                {enabledModels.map((model) => (
                  <DropdownMenu.Item
                    key={model.id}
                    onSelect={() => onSelectModel(model.id)}
                    className="flex h-10 cursor-default items-center justify-between rounded-[12px] px-2 text-base outline-none data-[highlighted]:bg-[#17243a]"
                  >
                    <span className="inline-flex items-center gap-2">
                      {model.capabilities.reasoning.type !== "none" ? (
                        <Zap className="h-4 w-4 text-[#ff8d6d]" />
                      ) : null}
                      {model.label}
                    </span>
                    {currentModel?.id === model.id ? <Check className="h-4 w-4 text-[#ff8d6d]" /> : null}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="flex h-10 cursor-default items-center justify-between rounded-[12px] px-2 text-base outline-none data-[highlighted]:bg-[#17243a]">
              <span>{t("selector.speed")}</span>
              <ChevronRight className="h-4 w-4 text-[#8ea0b8]" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={10}
                className="z-50 w-56 rounded-[18px] border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a]/96 p-2 text-[#e5edf7] shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-sm text-[#8ea0b8]">
                  {t("selector.speed")}
                </DropdownMenu.Label>
                {speedModes.map((speed) => (
                  <DropdownMenu.Item
                    key={speed}
                    onSelect={() => onSelectSpeed(speed)}
                    className="flex h-10 cursor-default items-center justify-between rounded-[12px] px-2 text-base outline-none data-[highlighted]:bg-[#17243a]"
                  >
                    {t(speedLabels[speed])}
                    {settings.speed === speed ? <Check className="h-4 w-4 text-[#ff8d6d]" /> : null}
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
