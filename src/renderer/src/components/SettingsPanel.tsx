import type { ComponentType, ReactElement } from "react";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Cpu,
  Database,
  Globe2,
  KeyRound,
  Layers3,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
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
  const [expandedProviderId, setExpandedProviderId] = useState(settings.providers[0]?.id ?? "");
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [draftBaseUrls, setDraftBaseUrls] = useState<Record<string, string>>({});
  const [manualModelDrafts, setManualModelDrafts] = useState<Record<string, string>>({});
  const enabledModels = settings.models.filter((model) => model.enabled);
  const currentModel = settings.models.find((model) => model.id === settings.currentModelId) ?? null;
  const currentProvider = currentModel
    ? (settings.providers.find((provider) => provider.id === currentModel.providerId) ?? null)
    : null;
  const configuredProviders = settings.providers.filter(
    (provider) => keyStatuses[provider.id]?.hasKey
  ).length;
  const speedLabel =
    settings.speed === "fast"
      ? t("selector.fast")
      : settings.speed === "balanced"
        ? t("selector.balanced")
        : t("selector.careful");

  return (
    <section className="h-full min-h-0 overflow-auto rounded-[20px] border border-[rgba(148,163,184,0.16)] bg-[rgba(10,18,31,0.94)] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <SlidersHorizontal className="h-4 w-4 text-[#82a1ff]" />
            {t("settings.title")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#8ea0b8]">{t("settings.subtitle")}</p>
        </div>
        <label className="grid shrink-0 gap-1 text-xs text-[#8ea0b8]">
          {t("settings.language")}
          <select
            value={settings.language}
            onChange={(event) => onSetLanguage(event.currentTarget.value as Language)}
            className="h-9 rounded-[12px] border border-[rgba(148,163,184,0.18)] bg-[#08111f] px-2 text-sm text-[#dbe7f5] outline-none transition focus:border-[#4f7cff]"
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <StatusTile
          icon={Cpu}
          label={t("settings.currentModel")}
          value={currentModel?.label ?? t("settings.noModel")}
        />
        <StatusTile
          icon={ShieldCheck}
          label={t("settings.apiKeys")}
          value={`${configuredProviders}/${settings.providers.length}`}
        />
        <StatusTile
          icon={Database}
          label={t("settings.enabledModels")}
          value={`${enabledModels.length}/${settings.models.length}`}
        />
        <StatusTile
          icon={Globe2}
          label={t("settings.projectRuntime")}
          value={currentProvider?.label ?? t("settings.localWorkspace")}
        />
      </div>

      <section className="mb-4 rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-3">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#718198]">
          <Layers3 className="h-4 w-4 text-[#82a1ff]" />
          {t("settings.contextTitle")}
        </h3>
        <div className="grid gap-2 text-sm">
          <ContextRow label={t("settings.localWorkspace")} value="read / write" />
          <ContextRow label={t("settings.projectRuntime")} value="PowerShell" />
          <ContextRow label={t("selector.speed")} value={speedLabel} />
        </div>
      </section>

      <section className="mb-4 rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#718198]">
            <KeyRound className="h-4 w-4 text-[#82a1ff]" />
            {t("settings.providers")}
          </h3>
          <span className="text-xs text-[#718198]">{t("settings.expandHint")}</span>
        </div>

        <div className="grid gap-2">
          {settings.providers.map((provider) => {
            const keyStatus = keyStatuses[provider.id] ?? { hasKey: false, last4: null };
            const draftKey = draftKeys[provider.id] ?? "";
            const draftBaseUrl = draftBaseUrls[provider.id] ?? provider.baseUrl ?? "";
            const manualModelDraft = manualModelDrafts[provider.id] ?? "";
            const isExpanded = expandedProviderId === provider.id;

            return (
              <article
                key={provider.id}
                className="rounded-[16px] border border-[rgba(148,163,184,0.14)] bg-[#08111f]/62 p-3"
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${t("settings.configure")} ${provider.label}`}
                  onClick={() => setExpandedProviderId(isExpanded ? "" : provider.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{provider.label}</span>
                      {provider.kind === "openai-compatible" ? (
                        <span className="rounded-full border border-[#4f7cff]/24 bg-[#4f7cff]/10 px-2 py-0.5 text-[11px] text-[#9bb2ff]">
                          {t("settings.compatibleProvider")}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`mt-1 flex items-center gap-1.5 text-xs ${
                        keyStatus.hasKey ? "text-[#9df2bd]" : "text-[#ffb49c]"
                      }`}
                    >
                      {keyStatus.hasKey ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <CircleAlert className="h-3.5 w-3.5" />
                      )}
                      {keyStatus.hasKey
                        ? `${t("settings.connected")} ****${keyStatus.last4}`
                        : t("settings.notConfigured")}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#8ea0b8] transition ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isExpanded ? (
                  <div className="mt-3 grid gap-3 border-t border-[rgba(148,163,184,0.14)] pt-3">
                    <label className="grid gap-1.5 text-xs text-[#8ea0b8]">
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
                        className="h-9 rounded-[12px] border border-[rgba(148,163,184,0.18)] bg-[#0c1727] px-2.5 text-sm text-[#dbe7f5] outline-none transition placeholder:text-[#718198] focus:border-[#4f7cff]"
                      />
                    </label>

                    <label className="grid gap-1.5 text-xs text-[#8ea0b8]">
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
                        className="h-9 rounded-[12px] border border-[rgba(148,163,184,0.18)] bg-[#0c1727] px-2.5 text-sm text-[#dbe7f5] outline-none transition placeholder:text-[#718198] focus:border-[#4f7cff]"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-label={`${t("settings.saveKey")} ${provider.label} API Key`}
                        className="inline-flex h-9 items-center justify-center rounded-[12px] bg-[#4f7cff] px-3 text-xs font-semibold text-white transition hover:bg-[#6b91ff] active:scale-[0.99]"
                        onClick={() => onSaveProviderKey(provider.id, draftKey)}
                      >
                        {t("settings.saveKey")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-[12px] border border-[rgba(148,163,184,0.18)] bg-[#0c1727] px-3 text-xs text-[#dbe7f5] transition hover:bg-[#142238] active:scale-[0.99]"
                        onClick={() => onDeleteProviderKey(provider.id)}
                      >
                        {t("settings.deleteKey")}
                      </button>
                    </div>

                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-[#37d67a]/20 bg-[#37d67a]/10 px-3 text-xs font-semibold text-[#9df2bd] transition hover:bg-[#37d67a]/16 active:scale-[0.99]"
                      onClick={() => onFetchModels(provider.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t("settings.fetchModels")}
                    </button>

                    <label className="grid gap-1.5 text-xs text-[#8ea0b8]">
                      {provider.label} {t("settings.manualModel")}
                      <div className="flex gap-2">
                        <input
                          value={manualModelDraft}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setManualModelDrafts((current) => ({
                              ...current,
                              [provider.id]: nextValue
                            }));
                          }}
                          className="h-9 min-w-0 flex-1 rounded-[12px] border border-[rgba(148,163,184,0.18)] bg-[#0c1727] px-2.5 text-sm text-[#dbe7f5] outline-none transition placeholder:text-[#718198] focus:border-[#4f7cff]"
                        />
                        <button
                          type="button"
                          aria-label={`${t("settings.addModel")} ${provider.label}`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-[12px] bg-[#ff6b3d] px-3 text-xs font-semibold text-[#08111f] transition hover:bg-[#ff815a] active:scale-[0.99]"
                          onClick={() => {
                            onAddManualModel(provider.id, manualModelDraft);
                            setManualModelDrafts((current) => ({ ...current, [provider.id]: "" }));
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t("settings.addModel")}
                        </button>
                      </div>
                    </label>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-3">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#718198]">
          {t("settings.models")}
        </h3>
        <div className="grid gap-2">
          {settings.models.map((model) => (
            <label
              key={model.id}
              className="flex items-center justify-between gap-3 rounded-[14px] border border-[rgba(148,163,184,0.14)] bg-[#08111f]/62 px-3 py-2.5 text-sm transition hover:border-[rgba(148,163,184,0.28)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-[#dbe7f5]">{model.label}</span>
                <span className="block truncate text-xs text-[#718198]">
                  {model.providerId} · {model.capabilitySource}
                </span>
              </span>
              <input
                type="checkbox"
                checked={model.enabled}
                onChange={(event) => onToggleModel(model.id, event.currentTarget.checked)}
                aria-label={`${t("settings.enabled")} ${model.label}`}
                className="h-4 w-4 shrink-0 accent-[#ff6b3d]"
              />
            </label>
          ))}
        </div>
      </section>
    </section>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="rounded-[16px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-3">
      <Icon className="mb-2 h-4 w-4 text-[#82a1ff]" />
      <div className="text-[11px] uppercase tracking-[0.08em] text-[#718198]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[#08111f]/62 px-3 py-2">
      <span className="truncate text-[#8ea0b8]">{label}</span>
      <span className="shrink-0 text-[#dbe7f5]">{value}</span>
    </div>
  );
}
