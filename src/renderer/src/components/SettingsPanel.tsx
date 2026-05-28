import type { ReactElement } from "react";
import { useState } from "react";
import { KeyRound, SlidersHorizontal } from "lucide-react";
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
    <section className="min-h-0 overflow-auto border-l border-[#e0e5ec] bg-[#f8fafc] px-4 py-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#202124]">
            <SlidersHorizontal className="h-4 w-4 text-[#596171]" />
            {t("settings.title")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#6b7280]">{t("settings.subtitle")}</p>
        </div>
        <label className="grid gap-1 text-xs text-[#6b7280]">
          {t("settings.language")}
          <select
            value={settings.language}
            onChange={(event) => onSetLanguage(event.currentTarget.value as Language)}
            className="h-9 rounded-md border border-[#d9e0e8] bg-white px-2 text-sm text-[#202124] outline-none focus:border-[#1f2328]"
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
      </div>

      <div className="mb-5 rounded-md border border-[#e0e5ec] bg-white p-3 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-[#6b7280]">
          <KeyRound className="h-4 w-4 text-[#596171]" />
          {t("settings.providers")}
        </h3>
        <div className="grid gap-2">
          {settings.providers.map((provider) => {
            const keyStatus = keyStatuses[provider.id] ?? { hasKey: false, last4: null };
            const draftKey = draftKeys[provider.id] ?? "";
            const draftBaseUrl = draftBaseUrls[provider.id] ?? provider.baseUrl ?? "";
            const manualModelDraft = manualModelDrafts[provider.id] ?? "";

            return (
              <div
                key={provider.id}
                className="rounded-md border border-[#e3e8ef] bg-[#fbfcfe] px-3 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#202124]">{provider.label}</div>
                    <div className="mt-1 text-xs text-[#6b7280]">
                      {keyStatus.hasKey
                        ? `${t("settings.keySaved")} ****${keyStatus.last4}`
                        : t("settings.keyMissing")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-[#d9e0e8] bg-white px-2 py-1 text-xs text-[#3f4752] hover:bg-[#f3f6f9]"
                    onClick={() => onFetchModels(provider.id)}
                  >
                    {t("settings.fetchModels")}
                  </button>
                </div>
                <label className="mt-3 grid gap-1 text-xs text-[#6b7280]">
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
                    className="h-9 rounded-md border border-[#d9e0e8] bg-white px-2 text-sm text-[#202124] outline-none transition focus:border-[#1f2328]"
                  />
                </label>
                <label className="mt-3 grid gap-1 text-xs text-[#6b7280]">
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
                    className="h-9 rounded-md border border-[#d9e0e8] bg-white px-2 text-sm text-[#202124] outline-none transition focus:border-[#1f2328]"
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-[#1f2328] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#343941]"
                    onClick={() => onSaveProviderKey(provider.id, draftKey)}
                  >
                    {t("settings.saveKey")} {provider.label} API Key
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[#d9e0e8] bg-white px-3 py-1.5 text-xs text-[#3f4752] hover:bg-[#f3f6f9]"
                    onClick={() => onDeleteProviderKey(provider.id)}
                  >
                    {t("settings.deleteKey")}
                  </button>
                </div>
                <label className="mt-3 grid gap-1 text-xs text-[#6b7280]">
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
                    className="h-9 rounded-md border border-[#d9e0e8] bg-white px-2 text-sm text-[#202124] outline-none transition focus:border-[#1f2328]"
                  />
                </label>
                <button
                  type="button"
                  className="mt-2 rounded-md border border-[#d9e0e8] bg-white px-3 py-1.5 text-xs text-[#3f4752] hover:bg-[#f3f6f9]"
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

      <h3 className="mb-3 text-xs font-semibold uppercase text-[#6b7280]">{t("settings.models")}</h3>
      <div className="grid gap-2">
        {settings.models.map((model) => (
          <label
            key={model.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[#e3e8ef] bg-white px-3 py-2.5 text-sm shadow-sm"
          >
            <span className="min-w-0">
              <span className="block truncate text-[#202124]">{model.label}</span>
              <span className="block truncate text-xs text-[#6b7280]">{model.providerId}</span>
            </span>
            <input
              type="checkbox"
              checked={model.enabled}
              onChange={(event) => onToggleModel(model.id, event.currentTarget.checked)}
              aria-label={`${t("settings.enabled")} ${model.label}`}
              className="h-4 w-4 shrink-0 accent-[#1f2328]"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
