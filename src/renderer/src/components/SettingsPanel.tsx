import type { ReactElement } from "react";
import { useState } from "react";
import type { Language, ModelSettings } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";

type SettingsPanelProps = {
  settings: ModelSettings;
  keyStatuses: Record<string, { hasKey: boolean; last4: string | null }>;
  onDeleteProviderKey: (providerId: string) => void;
  onFetchModels: (providerId: string) => void;
  onAddManualModel: (providerId: string, modelName: string) => void;
  onSaveProviderKey: (providerId: string, apiKey: string) => void;
  onSetLanguage: (language: Language) => void;
  onToggleModel: (modelId: string, enabled: boolean) => void;
  onUpdateProviderBaseUrl: (providerId: string, baseUrl: string) => void;
};

export function SettingsPanel({
  settings,
  keyStatuses,
  onDeleteProviderKey,
  onFetchModels,
  onAddManualModel,
  onSaveProviderKey,
  onSetLanguage,
  onToggleModel,
  onUpdateProviderBaseUrl
}: SettingsPanelProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [draftBaseUrls, setDraftBaseUrls] = useState<Record<string, string>>({});
  const [manualModelDrafts, setManualModelDrafts] = useState<Record<string, string>>({});

  return (
    <section className="border-t border-white/10 bg-[#15161a] px-6 py-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">{t("settings.title")}</h2>
          <p className="mt-1 text-sm text-[#a8a29a]">{t("settings.subtitle")}</p>
        </div>
        <label className="grid gap-1 text-xs text-[#a8a29a]">
          {t("settings.language")}
          <select
            value={settings.language}
            onChange={(event) => onSetLanguage(event.currentTarget.value as Language)}
            className="h-9 rounded-md border border-white/10 bg-[#1d1f24] px-2 text-sm text-[#f5f4ef]"
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
      </div>

      <div className="mb-5">
        <h3 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("settings.providers")}</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {settings.providers.map((provider) => {
            const keyStatus = keyStatuses[provider.id] ?? { hasKey: false, last4: null };
            const draftKey = draftKeys[provider.id] ?? "";
            const draftBaseUrl = draftBaseUrls[provider.id] ?? provider.baseUrl ?? "";
            const manualModelDraft = manualModelDrafts[provider.id] ?? "";

            return (
              <div
                key={provider.id}
                className="rounded-md border border-white/10 bg-[#1d1f24] px-3 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-[#f5f4ef]">{provider.label}</div>
                    <div className="mt-1 text-xs text-[#a8a29a]">
                      {keyStatus.hasKey
                        ? `${t("settings.keySaved")} ****${keyStatus.last4}`
                        : t("settings.keyMissing")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-[#d7d3ca] hover:bg-white/8"
                    onClick={() => onFetchModels(provider.id)}
                  >
                    {t("settings.fetchModels")}
                  </button>
                </div>
                <label className="mt-3 grid gap-1 text-xs text-[#a8a29a]">
                  {provider.label} {t("settings.baseUrl")}
                  <input
                    value={draftBaseUrl}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setDraftBaseUrls((current) => ({
                        ...current,
                        [provider.id]: nextValue
                      }));
                      onUpdateProviderBaseUrl(provider.id, nextValue);
                    }}
                    className="h-9 rounded-md border border-white/10 bg-[#15161a] px-2 text-sm text-[#f5f4ef] outline-none"
                  />
                </label>
                <label className="mt-3 grid gap-1 text-xs text-[#a8a29a]">
                  {provider.label} API Key
                  <input
                    type="password"
                    value={draftKey}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setDraftKeys((current) => ({
                        ...current,
                        [provider.id]: nextValue
                      }));
                    }}
                    className="h-9 rounded-md border border-white/10 bg-[#15161a] px-2 text-sm text-[#f5f4ef] outline-none"
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-[#f5f4ef] px-3 py-1.5 text-xs font-medium text-[#222] hover:bg-white"
                    onClick={() => onSaveProviderKey(provider.id, draftKey)}
                  >
                    {t("settings.saveKey")} {provider.label} API Key
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#d7d3ca] hover:bg-white/8"
                    onClick={() => onDeleteProviderKey(provider.id)}
                  >
                    {t("settings.deleteKey")}
                  </button>
                </div>
                <label className="mt-3 grid gap-1 text-xs text-[#a8a29a]">
                  {provider.label} {t("settings.manualModel")}
                  <input
                    value={manualModelDraft}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setManualModelDrafts((current) => ({
                        ...current,
                        [provider.id]: nextValue
                      }));
                    }}
                    className="h-9 rounded-md border border-white/10 bg-[#15161a] px-2 text-sm text-[#f5f4ef] outline-none"
                  />
                </label>
                <button
                  type="button"
                  className="mt-2 rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#d7d3ca] hover:bg-white/8"
                  onClick={() => {
                    onAddManualModel(provider.id, manualModelDraft);
                    setManualModelDrafts((current) => ({ ...current, [provider.id]: "" }));
                  }}
                >
                  {t("settings.addModel")} {provider.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <h3 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("settings.models")}</h3>
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
