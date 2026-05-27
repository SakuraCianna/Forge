import type { ReactElement } from "react";
import type { ModelSettings } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";

type SettingsPanelProps = {
  settings: ModelSettings;
  onToggleModel: (modelId: string, enabled: boolean) => void;
};

export function SettingsPanel({ settings, onToggleModel }: SettingsPanelProps): ReactElement {
  const { t } = useI18n(settings.language);

  return (
    <section className="border-t border-white/10 bg-[#15161a] px-6 py-5">
      <div className="mb-4">
        <h2 className="text-base font-medium">{t("settings.title")}</h2>
        <p className="mt-1 text-sm text-[#a8a29a]">{t("settings.subtitle")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {settings.models.map((model) => (
          <label
            key={model.id}
            className="flex items-center justify-between rounded-md border border-white/10 bg-[#1d1f24] px-3 py-3 text-sm"
          >
            <span>
              <span className="block text-[#f5f4ef]">{model.label}</span>
              <span className="block text-xs text-[#a8a29a]">{model.providerId}</span>
            </span>
            <input
              type="checkbox"
              checked={model.enabled}
              onChange={(event) => onToggleModel(model.id, event.currentTarget.checked)}
              aria-label={`${t("settings.enabled")} ${model.label}`}
              className="h-4 w-4"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
