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
  Palette,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import type { Language, ModelSettings } from "@shared/modelTypes";
import type { UsageEvent } from "@shared/usageTypes";
import { useI18n } from "@/i18n/useI18n";
import type { PersonalizationSettings } from "@/state/personalization";
import {
  summarizeUsage,
  summarizeUsageByProvider,
  type UsageRate,
  type UsageRateMap
} from "@/state/usage";

type SettingsPanelProps = {
  settings: ModelSettings;
  keyStatuses: Record<string, { hasKey: boolean; last4: string | null }>;
  onDeleteProviderKey: (providerId: string) => void;
  onFetchModels: (providerId: string) => void;
  onAddManualModel: (providerId: string, modelName: string) => void;
  onClearUsage: () => void;
  onSaveProviderKey: (providerId: string, apiKey: string) => void;
  onSetLanguage: (language: Language) => void;
  onUpdatePersonalization: (settings: PersonalizationSettings) => void;
  onUpdateProviderBaseUrl: (providerId: string, baseUrl: string) => void;
  onUpdateUsageRate: (providerId: string, rate: UsageRate) => void;
  personalization: PersonalizationSettings;
  usageEvents: UsageEvent[];
  usageRates: UsageRateMap;
};

type SettingsSection = "general" | "models" | "providers" | "usage" | "personalization";

type SectionItem = {
  id: SettingsSection;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

export function SettingsPanel({
  settings,
  keyStatuses,
  onDeleteProviderKey,
  onFetchModels,
  onAddManualModel,
  onClearUsage,
  onSaveProviderKey,
  onSetLanguage,
  onUpdatePersonalization,
  onUpdateProviderBaseUrl,
  onUpdateUsageRate,
  personalization,
  usageEvents,
  usageRates
}: SettingsPanelProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [activeSection, setActiveSection] = useState<SettingsSection>("models");
  const [expandedProviderId, setExpandedProviderId] = useState(settings.providers[0]?.id ?? "");
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [draftBaseUrls, setDraftBaseUrls] = useState<Record<string, string>>({});
  const [manualModelDrafts, setManualModelDrafts] = useState<Record<string, string>>({});
  const availableModels = settings.models;
  const currentModel = settings.models.find((model) => model.id === settings.currentModelId) ?? null;
  const currentProvider = currentModel
    ? (settings.providers.find((provider) => provider.id === currentModel.providerId) ?? null)
    : null;
  const configuredProviders = settings.providers.filter(
    (provider) => keyStatuses[provider.id]?.hasKey
  ).length;
  const totalUsage = summarizeUsage(usageEvents, usageRates);
  const providerUsage = summarizeUsageByProvider(usageEvents, usageRates);
  const sectionItems: SectionItem[] = [
    {
      id: "general",
      label: settings.language === "zh-CN" ? "常规" : "General",
      description: t("settings.language"),
      icon: SlidersHorizontal
    },
    {
      id: "models",
      label: t("settings.models"),
      description: `${availableModels.length}`,
      icon: Cpu
    },
    {
      id: "providers",
      label: t("settings.providers"),
      description: `${configuredProviders}/${settings.providers.length}`,
      icon: KeyRound
    },
    {
      id: "usage",
      label: t("settings.usage"),
      description: `${totalUsage.totalTokens.toLocaleString()} tokens`,
      icon: ReceiptText
    },
    {
      id: "personalization",
      label: t("settings.personalization"),
      description: getToneLabel(personalization.replyTone),
      icon: Palette
    }
  ];
  const activeItem = sectionItems.find((item) => item.id === activeSection) ?? sectionItems[0];

  return (
    <section className="h-full min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1180px] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-[#ececf1] px-1 pb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal text-[#202123]">{activeItem.label}</h1>
            <p className="mt-1 text-sm leading-6 text-[#6e6e80]">
              {getSectionDescription(activeSection)}
            </p>
          </div>
          <div className="hidden gap-2 md:flex">
            <StatusPill label={t("settings.currentModel")} value={currentModel?.label ?? t("settings.noModel")} />
            <StatusPill label={t("settings.apiKeys")} value={`${configuredProviders}/${settings.providers.length}`} />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 border-r border-[#ececf1] py-4 pr-4">
            <nav aria-label={t("settings.title")} className="space-y-1">
              {sectionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition active:scale-[0.99] ${
                    activeSection === item.id
                      ? "bg-[#ececf1] text-[#202123]"
                      : "text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#8e8ea0]">{item.description}</span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="mt-5 rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#202123]">
                <ShieldCheck className="h-4 w-4 text-[#565869]" />
                {t("app.keysLocal")}
              </div>
              <p className="mt-2 text-xs leading-5 text-[#6e6e80]">
                {settings.language === "zh-CN"
                  ? "密钥通过本机安全存储保存, 不写入项目文件"
                  : "Keys are stored locally and never written into project files"}
              </p>
            </div>
          </aside>

          <main className="min-h-0 overflow-auto px-6 py-5">
            {activeSection === "general" ? renderGeneralSection() : null}
            {activeSection === "models" ? renderModelsSection() : null}
            {activeSection === "providers" ? renderProvidersSection() : null}
            {activeSection === "usage" ? renderUsageSection() : null}
            {activeSection === "personalization" ? renderPersonalizationSection() : null}
          </main>
        </div>
      </div>
    </section>
  );

  function renderGeneralSection(): ReactElement {
    return (
      <SectionFrame
        title={settings.language === "zh-CN" ? "常规" : "General"}
        description={settings.language === "zh-CN" ? "调整界面语言和基础偏好" : "Adjust language and basic preferences"}
      >
        <label className="flex items-center justify-between gap-4 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
          <span>
            <span className="block font-medium text-[#202123]">{t("settings.language")}</span>
            <span className="mt-1 block text-xs text-[#6e6e80]">
              {settings.language === "zh-CN" ? "应用界面显示语言" : "Application interface language"}
            </span>
          </span>
          <select
            aria-label={t("settings.language")}
            value={settings.language}
            onChange={(event) => onSetLanguage(event.currentTarget.value as Language)}
            className="h-9 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
      </SectionFrame>
    );
  }

  function renderModelsSection(): ReactElement {
    return (
      <SectionFrame title={t("settings.models")} description={t("settings.modelsAutoDescription")}>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <StatusTile
            icon={Cpu}
            label={t("settings.currentModel")}
            value={currentModel?.label ?? t("settings.noModel")}
          />
          <StatusTile
            icon={Database}
            label={t("settings.availableModels")}
            value={`${availableModels.length}`}
          />
          <StatusTile
            icon={Globe2}
            label={t("settings.currentProvider")}
            value={currentProvider?.label ?? t("settings.noModel")}
          />
        </div>

        <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
          {settings.models.map((model, index) => (
            <div
              key={model.id}
              className={`flex items-center justify-between gap-4 bg-white px-4 py-3 text-sm transition hover:bg-[#f7f7f8] ${
                index === 0 ? "" : "border-t border-[#ececf1]"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-[#202123]">{model.label}</span>
                <span className="mt-1 block truncate text-xs text-[#6e6e80]">
                  {model.providerId} / {model.capabilitySource}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-[#c3eadc] bg-[#effaf6] px-2 py-1 text-xs font-medium text-[#087443]">
                {t("settings.available")}
              </span>
            </div>
          ))}
        </div>
      </SectionFrame>
    );
  }

  function renderProvidersSection(): ReactElement {
    return (
      <SectionFrame title={t("settings.providers")} description={t("settings.expandHint")}>
        <div className="grid gap-3">
          {settings.providers.map((provider) => {
            const keyStatus = keyStatuses[provider.id] ?? { hasKey: false, last4: null };
            const draftKey = draftKeys[provider.id] ?? "";
            const draftBaseUrl = draftBaseUrls[provider.id] ?? provider.baseUrl ?? "";
            const manualModelDraft = manualModelDrafts[provider.id] ?? "";
            const isExpanded = expandedProviderId === provider.id;

            return (
              <article
                key={provider.id}
                className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white"
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${t("settings.configure")} ${provider.label}`}
                  onClick={() => setExpandedProviderId(isExpanded ? "" : provider.id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#f7f7f8]"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[#202123]">{provider.label}</span>
                      {provider.kind === "openai-compatible" ? (
                        <span className="rounded-full border border-[#ececf1] bg-[#f7f7f8] px-2 py-0.5 text-[11px] text-[#565869]">
                          {t("settings.compatibleProvider")}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`mt-1 flex items-center gap-1.5 text-xs ${
                        keyStatus.hasKey ? "text-[#087443]" : "text-[#b45309]"
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
                    className={`h-4 w-4 shrink-0 text-[#6e6e80] transition ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isExpanded ? (
                  <div className="grid gap-3 border-t border-[#ececf1] bg-[#fafafa] px-4 py-4">
                    <label className="grid gap-1.5 text-xs text-[#6e6e80]">
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
                        className="h-10 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
                      />
                    </label>

                    <label className="grid gap-1.5 text-xs text-[#6e6e80]">
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
                        className="h-10 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-label={`${t("settings.saveKey")} ${provider.label} API Key`}
                        className="inline-flex h-9 items-center justify-center rounded-[12px] bg-[#202123] px-3 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                        onClick={() => onSaveProviderKey(provider.id, draftKey)}
                      >
                        {t("settings.saveKey")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-xs text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                        onClick={() => onDeleteProviderKey(provider.id)}
                      >
                        {t("settings.deleteKey")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-xs font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                        onClick={() => onFetchModels(provider.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t("settings.fetchModels")}
                      </button>
                    </div>

                    <label className="grid gap-1.5 text-xs text-[#6e6e80]">
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
                          className="h-10 min-w-0 flex-1 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
                        />
                        <button
                          type="button"
                          aria-label={`${t("settings.addModel")} ${provider.label}`}
                          className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-[#202123] px-3 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.99]"
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
      </SectionFrame>
    );
  }

  function renderUsageSection(): ReactElement {
    return (
      <SectionFrame
        title={t("settings.usage")}
        description={t("settings.usageDescription")}
      >
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <MetricTile label={t("settings.usageRequests")} value={String(totalUsage.requests)} />
          <MetricTile label={t("settings.inputTokens")} value={formatInteger(totalUsage.inputTokens)} />
          <MetricTile label={t("settings.outputTokens")} value={formatInteger(totalUsage.outputTokens)} />
          <MetricTile label={t("settings.estimatedCost")} value={`$${totalUsage.estimatedCost.toFixed(4)}`} />
        </div>

        <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
          {settings.providers.map((provider, index) => {
            const usage = providerUsage[provider.id] ?? summarizeUsage([], usageRates);
            const rate = usageRates[provider.id] ?? { inputPerMillion: 0, outputPerMillion: 0 };

            return (
              <div
                key={provider.id}
                className={`grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px_120px] md:items-center ${
                  index === 0 ? "" : "border-t border-[#ececf1]"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#202123]">{provider.label}</div>
                  <div className="mt-1 text-xs text-[#6e6e80]">
                    {formatInteger(usage.totalTokens)} tokens / {usage.requests} requests
                  </div>
                </div>
                <PriceInput
                  label={t("settings.inputPrice")}
                  value={rate.inputPerMillion}
                  onChange={(value) => onUpdateUsageRate(provider.id, { ...rate, inputPerMillion: value })}
                />
                <PriceInput
                  label={t("settings.outputPrice")}
                  value={rate.outputPerMillion}
                  onChange={(value) => onUpdateUsageRate(provider.id, { ...rate, outputPerMillion: value })}
                />
                <div className="text-sm font-semibold text-[#202123] md:text-right">
                  ${usage.estimatedCost.toFixed(4)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] px-4 py-3">
          <p className="text-sm text-[#6e6e80]">{t("settings.usageLocalOnly")}</p>
          <button
            type="button"
            onClick={onClearUsage}
            className="h-9 shrink-0 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] transition hover:bg-[#ececf1]"
          >
            {t("settings.clearUsage")}
          </button>
        </div>
      </SectionFrame>
    );
  }

  function renderPersonalizationSection(): ReactElement {
    return (
      <SectionFrame
        title={t("settings.personalization")}
        description={t("settings.personalizationDescription")}
      >
        <div className="grid gap-4">
          <label className="flex items-center justify-between gap-4 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
            <span>
              <span className="block font-medium text-[#202123]">{t("settings.replyTone")}</span>
              <span className="mt-1 block text-xs text-[#6e6e80]">{t("settings.replyToneDescription")}</span>
            </span>
            <select
              aria-label={t("settings.replyTone")}
              value={personalization.replyTone}
              onChange={(event) =>
                onUpdatePersonalization({
                  ...personalization,
                  replyTone: event.currentTarget.value as PersonalizationSettings["replyTone"]
                })
              }
              className="h-9 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
            >
              <option value="friendly">{t("settings.tone.friendly")}</option>
              <option value="concise">{t("settings.tone.concise")}</option>
              <option value="technical">{t("settings.tone.technical")}</option>
            </select>
          </label>

          <label className="grid gap-2 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
            <span>
              <span className="block font-medium text-[#202123]">{t("settings.customInstructions")}</span>
              <span className="mt-1 block text-xs text-[#6e6e80]">
                {t("settings.customInstructionsDescription")}
              </span>
            </span>
            <textarea
              value={personalization.customInstructions}
              onChange={(event) =>
                onUpdatePersonalization({
                  ...personalization,
                  customInstructions: event.currentTarget.value
                })
              }
              className="min-h-36 resize-y rounded-[14px] border border-[#d9d9e3] bg-white p-3 text-sm leading-6 text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
              placeholder={t("settings.customInstructionsPlaceholder")}
            />
          </label>
        </div>
      </SectionFrame>
    );
  }

  function getToneLabel(tone: PersonalizationSettings["replyTone"]): string {
    if (tone === "concise") {
      return t("settings.tone.concise");
    }

    if (tone === "technical") {
      return t("settings.tone.technical");
    }

    return t("settings.tone.friendly");
  }

  function getSectionDescription(section: SettingsSection): string {
    if (section === "general") {
      return settings.language === "zh-CN"
        ? "调整界面语言和基础偏好"
        : "Adjust language and basic preferences";
    }

    if (section === "models") {
      return t("settings.modelsAutoDescription");
    }

    if (section === "providers") {
      return t("settings.expandHint");
    }

    if (section === "usage") {
      return t("settings.usageDescription");
    }

    return t("settings.personalizationDescription");
  }
}

function SectionFrame({
  children
}: {
  title?: string;
  description?: string;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return <section>{children}</section>;
}

function StatusPill({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-[12px] border border-[#ececf1] bg-[#f7f7f8] px-3 py-2">
      <div className="text-[11px] text-[#6e6e80]">{label}</div>
      <div className="mt-0.5 max-w-40 truncate text-xs font-semibold text-[#202123]">{value}</div>
    </div>
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
    <div className="rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-3">
      <Icon className="mb-2 h-4 w-4 text-[#565869]" />
      <div className="text-xs text-[#6e6e80]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#202123]">{value}</div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-3">
      <div className="text-xs text-[#6e6e80]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#202123]">{value}</div>
    </div>
  );
}

function PriceInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <label className="grid gap-1 text-xs text-[#6e6e80]">
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value) || 0)}
        className="h-9 rounded-[12px] border border-[#d9d9e3] bg-white px-2 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
      />
    </label>
  );
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString();
}
