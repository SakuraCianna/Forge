import type { ComponentType, CSSProperties, ReactElement } from "react";
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Archive,
  Check,
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
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import type { ForgeModel, ForgeProvider, Language, ModelSettings } from "@shared/modelTypes";
import type { UsageEvent } from "@shared/usageTypes";
import { useI18n } from "@/i18n/useI18n";
import type { PersonalizationSettings } from "@/state/personalization";
import type { TaskThread } from "@/state/taskThreads";
import {
  summarizeUsage,
  summarizeUsageByProvider,
  type UsageRate,
  type UsageRateMap
} from "@/state/usage";

export type ProviderFetchState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
};

type SettingsPanelProps = {
  settings: ModelSettings;
  keyStatuses: Record<string, { hasKey: boolean; last4: string | null }>;
  archivedThreads: TaskThread[];
  onDeleteProviderKey: (providerId: string) => void;
  onFetchModels: (providerId: string) => void;
  onAddProvider: (label: string, baseUrl: string) => void;
  onClearUsage: () => void;
  onDeleteProvider: (providerId: string) => void;
  onSaveProviderKey: (providerId: string, apiKey: string) => void;
  onSetLanguage: (language: Language) => void;
  onUpdatePersonalization: (settings: PersonalizationSettings) => void;
  onUpdateProviderBaseUrl: (providerId: string, baseUrl: string) => void;
  onUpdateProviderLabel: (providerId: string, label: string) => void;
  onUpdateUsageRate: (providerId: string, rate: UsageRate) => void;
  onRestoreArchivedThread: (threadId: string) => void;
  onSelectModel: (modelId: string) => void;
  personalization: PersonalizationSettings;
  providerFetchStates: Record<string, ProviderFetchState>;
  usageEvents: UsageEvent[];
  usageRates: UsageRateMap;
};

type SettingsSection = "general" | "models" | "providers" | "usage" | "personalization" | "archived";

type SectionItem = {
  id: SettingsSection;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

export function SettingsPanel({
  settings,
  keyStatuses,
  archivedThreads,
  onDeleteProviderKey,
  onFetchModels,
  onAddProvider,
  onClearUsage,
  onDeleteProvider,
  onSaveProviderKey,
  onSetLanguage,
  onUpdatePersonalization,
  onUpdateProviderBaseUrl,
  onUpdateProviderLabel,
  onUpdateUsageRate,
  onRestoreArchivedThread,
  onSelectModel,
  personalization,
  providerFetchStates,
  usageEvents,
  usageRates
}: SettingsPanelProps): ReactElement {
  const { t } = useI18n(settings.language);
  const [activeSection, setActiveSection] = useState<SettingsSection>("models");
  const [expandedProviderId, setExpandedProviderId] = useState(settings.providers[0]?.id ?? "");
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [draftBaseUrls, setDraftBaseUrls] = useState<Record<string, string>>({});
  const [newProviderLabel, setNewProviderLabel] = useState("");
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState("");
  const availableModels = settings.models;
  const currentModel = settings.models.find((model) => model.id === settings.currentModelId) ?? null;
  const currentProvider = currentModel
    ? (settings.providers.find((provider) => provider.id === currentModel.providerId) ?? null)
    : null;
  const totalUsage = summarizeUsage(usageEvents, usageRates);
  const providerUsage = summarizeUsageByProvider(usageEvents, usageRates);
  const sectionItems: SectionItem[] = [
    {
      id: "general",
      label: t("settings.general"),
      description: t("settings.language"),
      icon: SlidersHorizontal
    },
    {
      id: "models",
      label: t("settings.models"),
      description: t("settings.modelsMenuDescription"),
      icon: Cpu
    },
    {
      id: "providers",
      label: t("settings.providerProfiles"),
      description: t("settings.providerProfilesDescription"),
      icon: KeyRound
    },
    {
      id: "usage",
      label: t("settings.usage"),
      description: t("settings.usageMenuDescription"),
      icon: ReceiptText
    },
    {
      id: "personalization",
      label: t("settings.personalization"),
      description: getToneLabel(personalization.replyTone),
      icon: Palette
    },
    {
      id: "archived",
      label: settings.language === "zh-CN" ? "已归档对话" : "Archived chats",
      description:
        archivedThreads.length > 0
          ? `${archivedThreads.length}`
          : settings.language === "zh-CN"
            ? "暂无"
            : "None",
      icon: Archive
    }
  ];
  const activeItem = sectionItems.find((item) => item.id === activeSection) ?? sectionItems[0];

  return (
    <section className="h-full min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1180px] flex-col">
        <header className="border-b border-[#ececf1] px-1 pb-4">
          <h1 className="text-xl font-semibold tracking-normal text-[#202123]">{activeItem.label}</h1>
          <p className="mt-1 text-sm leading-6 text-[#6e6e80]">
            {getSectionDescription(activeSection)}
          </p>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 border-r border-[#ececf1] py-4 pr-4">
            <nav aria-label={t("settings.title")} className="space-y-1">
              {sectionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
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
          </aside>

          <main className="min-h-0 overflow-auto px-6 py-5">
            {activeSection === "general" ? renderGeneralSection() : null}
            {activeSection === "models" ? renderModelsSection() : null}
            {activeSection === "providers" ? renderProvidersSection() : null}
            {activeSection === "usage" ? renderUsageSection() : null}
            {activeSection === "personalization" ? renderPersonalizationSection() : null}
            {activeSection === "archived" ? renderArchivedSection() : null}
          </main>
        </div>
      </div>
    </section>
  );

  function renderGeneralSection(): ReactElement {
    return (
      <SectionFrame>
        <label className="flex items-center justify-between gap-4 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
          <span>
            <span className="block font-medium text-[#202123]">{t("settings.language")}</span>
            <span className="mt-1 block text-xs text-[#6e6e80]">
              {settings.language === "zh-CN" ? "应用界面显示语言" : "Application interface language"}
            </span>
          </span>
          <InlineDropdown
            ariaLabel={t("settings.language")}
            value={settings.language}
            options={[
              { value: "zh-CN", label: "中文" },
              { value: "en-US", label: "English" }
            ]}
            onChange={(value) => onSetLanguage(value as Language)}
          />
        </label>
      </SectionFrame>
    );
  }

  function renderModelsSection(): ReactElement {
    return (
      <SectionFrame>
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
          {settings.models.length > 0 ? (
            settings.models.map((model, index) => {
              const provider =
                settings.providers.find((candidate) => candidate.id === model.providerId) ?? null;
              const providerLabel = provider?.label ?? model.providerId;

              return (
                <button
                  type="button"
                  key={model.id}
                  onClick={() => onSelectModel(model.id)}
                  className={`flex w-full items-center justify-between gap-4 bg-white px-4 py-3 text-left text-sm transition hover:bg-[#f7f7f8] ${
                    index === 0 ? "" : "border-t border-[#ececf1]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ProviderMark provider={provider} fallbackLabel={providerLabel} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[#202123]">{model.label}</span>
                      <span className="mt-1 block truncate text-xs text-[#6e6e80]">
                        {t("selector.modelSource")} {providerLabel}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {settings.currentModelId === model.id ? (
                      <Check className="h-4 w-4 text-[#202123]" />
                    ) : null}
                    <span className="rounded-full border border-[#c3eadc] bg-[#effaf6] px-2 py-1 text-xs font-medium text-[#087443]">
                      {t("settings.available")}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-10 text-center text-sm leading-6 text-[#6e6e80]">
              {t("settings.noDetectedModels")}
            </div>
          )}
        </div>
      </SectionFrame>
    );
  }

  function renderProvidersSection(): ReactElement {
    return (
      <SectionFrame>
        <div className="mb-5 rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[#202123]">{t("settings.addProvider")}</h2>
            <p className="mt-1 text-xs leading-5 text-[#6e6e80]">
              {t("settings.noProviderLimitDescription")}
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(160px,220px)_minmax(260px,1fr)_auto] lg:items-end">
            <label className="grid min-w-0 gap-1.5 text-xs text-[#6e6e80]">
              {t("settings.providerName")}
              <input
                value={newProviderLabel}
                onChange={(event) => setNewProviderLabel(event.currentTarget.value)}
                placeholder={t("settings.providerNamePlaceholder")}
                className="h-10 w-full rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs text-[#6e6e80]">
              {t("settings.baseUrl")}
              <input
                value={newProviderBaseUrl}
                onChange={(event) => setNewProviderBaseUrl(event.currentTarget.value)}
                placeholder={t("settings.providerBaseUrlPlaceholder")}
                className="h-10 w-full rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
              />
            </label>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[#202123] px-4 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.99]"
              onClick={() => {
                onAddProvider(newProviderLabel, newProviderBaseUrl);
                setNewProviderLabel("");
                setNewProviderBaseUrl("");
              }}
            >
              <Plus className="h-4 w-4" />
              {t("settings.addProvider")}
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          {settings.providers.map((provider) => {
            const keyStatus = keyStatuses[provider.id] ?? { hasKey: false, last4: null };
            const draftKey = draftKeys[provider.id] ?? "";
            const draftBaseUrl = draftBaseUrls[provider.id] ?? provider.baseUrl ?? "";
            const isExpanded = expandedProviderId === provider.id;
            const providerLabel = provider.label.trim() || t("settings.customProvider");
            const fetchState = providerFetchStates[provider.id] ?? { status: "idle" as const };
            const requiresApiKey = provider.requiresApiKey !== false;
            const providerModels = settings.models.filter((model) => model.providerId === provider.id);

            return (
              <article
                key={provider.id}
                className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white"
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${t("settings.configure")} ${providerLabel}`}
                  onClick={() => setExpandedProviderId(isExpanded ? "" : provider.id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[#f7f7f8]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ProviderMark provider={provider} fallbackLabel={providerLabel} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[#202123]">{providerLabel}</span>
                        {provider.custom ? (
                          <span className="rounded-full border border-[#ececf1] bg-[#f7f7f8] px-2 py-0.5 text-[11px] text-[#565869]">
                            {t("settings.customProvider")}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`mt-1 flex items-center gap-1.5 text-xs ${
                          !requiresApiKey || keyStatus.hasKey ? "text-[#087443]" : "text-[#b45309]"
                        }`}
                      >
                        {!requiresApiKey || keyStatus.hasKey ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <CircleAlert className="h-3.5 w-3.5" />
                        )}
                        {!requiresApiKey
                          ? settings.language === "zh-CN"
                            ? "本地服务, 无需 API Key"
                            : "Local service, no API key"
                          : keyStatus.hasKey
                          ? `${t("settings.connected")} ****${keyStatus.last4}`
                          : t("settings.notConfigured")}
                      </span>
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
                    {provider.custom ? (
                      <label className="grid gap-1.5 text-xs text-[#6e6e80]">
                        {t("settings.providerName")}
                        <input
                          value={provider.label}
                          onChange={(event) =>
                            onUpdateProviderLabel(provider.id, event.currentTarget.value)
                          }
                          className="h-10 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
                        />
                      </label>
                    ) : null}

                    <label className="grid gap-1.5 text-xs text-[#6e6e80]">
                      {providerLabel} {t("settings.baseUrl")}
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

                    {requiresApiKey ? (
                      <label className="grid gap-1.5 text-xs text-[#6e6e80]">
                        {providerLabel} API Key
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
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {requiresApiKey ? (
                        <>
                          <button
                            type="button"
                            aria-label={`${t("settings.saveKey")} ${providerLabel} API Key`}
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
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={fetchState.status === "loading"}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-xs font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                        onClick={() => onFetchModels(provider.id)}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${fetchState.status === "loading" ? "animate-spin" : ""}`} />
                        {fetchState.status === "loading"
                          ? settings.language === "zh-CN"
                            ? "拉取中"
                            : "Fetching"
                          : t("settings.fetchModels")}
                      </button>
                      {provider.custom ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[12px] border border-[#f1c2c2] bg-white px-3 text-xs font-semibold text-[#b42318] transition hover:bg-[#fff5f5] active:scale-[0.99]"
                          onClick={() => onDeleteProvider(provider.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("settings.deleteProvider")}
                        </button>
                      ) : null}
                    </div>

                    <p className="text-xs leading-5 text-[#6e6e80]">
                      {requiresApiKey
                        ? t("settings.fetchModelsHint")
                        : settings.language === "zh-CN"
                          ? "本地服务无需 API Key, 确认服务运行后可直接拉取模型"
                          : "Local services do not need an API key. Start the service, then fetch models."}
                    </p>
                    {fetchState.message ? (
                      <p
                        className={`text-xs leading-5 ${
                          fetchState.status === "error" ? "text-[#b45309]" : "text-[#087443]"
                        }`}
                      >
                        {fetchState.message}
                      </p>
                    ) : null}
                    <div className="rounded-[14px] border border-[#ececf1] bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>
                          <span className="block text-sm font-medium text-[#202123]">
                            {t("settings.providerModels")}
                          </span>
                          <span className="mt-1 block text-xs text-[#6e6e80]">
                            {providerModels.length > 0
                              ? `${providerModels.length} ${t("settings.availableModels")}`
                              : t("settings.providerModelsEmpty")}
                          </span>
                        </span>
                        <ProviderModelDropdown
                          currentModelId={settings.currentModelId}
                          language={settings.language}
                          models={providerModels}
                          providerLabel={providerLabel}
                          onSelectModel={onSelectModel}
                        />
                      </div>
                    </div>
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
      <SectionFrame>
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
                className={`grid gap-4 px-4 py-4 lg:grid-cols-[minmax(180px,1fr)_minmax(170px,220px)_minmax(170px,220px)_100px] lg:items-end ${
                  index === 0 ? "" : "border-t border-[#ececf1]"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderMark provider={provider} fallbackLabel={provider.label} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#202123]">
                      {provider.label}
                    </span>
                    <span className="mt-1 block text-xs text-[#6e6e80]">
                      {formatInteger(usage.totalTokens)} tokens / {usage.requests} requests
                    </span>
                  </span>
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
                <div className="text-sm font-semibold text-[#202123] lg:text-right">
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
      <SectionFrame>
        <div className="grid gap-4">
          <label className="flex items-center justify-between gap-4 rounded-[14px] border border-[#ececf1] bg-white px-4 py-3 text-sm">
            <span>
              <span className="block font-medium text-[#202123]">{t("settings.replyTone")}</span>
              <span className="mt-1 block text-xs text-[#6e6e80]">{t("settings.replyToneDescription")}</span>
            </span>
            <InlineDropdown
              ariaLabel={t("settings.replyTone")}
              value={personalization.replyTone}
              options={[
                { value: "friendly", label: t("settings.tone.friendly") },
                { value: "concise", label: t("settings.tone.concise") },
                { value: "technical", label: t("settings.tone.technical") }
              ]}
              onChange={(value) =>
                onUpdatePersonalization({
                  ...personalization,
                  replyTone: value as PersonalizationSettings["replyTone"]
                })
              }
            />
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

  function renderArchivedSection(): ReactElement {
    return (
      <SectionFrame>
        <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
          {archivedThreads.length > 0 ? (
            archivedThreads.map((thread, index) => (
              <div
                key={thread.id}
                className={`flex items-center justify-between gap-4 px-4 py-3 text-sm ${
                  index === 0 ? "" : "border-t border-[#ececf1]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[#202123]">{thread.title}</span>
                  <span className="mt-1 block truncate text-xs text-[#6e6e80]">{thread.createdAt}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Restore ${thread.title}`}
                  onClick={() => onRestoreArchivedThread(thread.id)}
                  className="h-9 shrink-0 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] transition hover:bg-[#f7f7f8]"
                >
                  {settings.language === "zh-CN" ? "恢复" : "Restore"}
                </button>
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-[#6e6e80]">
              {settings.language === "zh-CN" ? "暂无已归档的聊天。" : "No archived chats yet."}
            </div>
          )}
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
      return t("settings.providerProfilesDescription");
    }

    if (section === "usage") {
      return t("settings.usageDescription");
    }

    if (section === "archived") {
      return settings.language === "zh-CN" ? "查看和恢复已归档的对话" : "Review and restore archived chats";
    }

    return t("settings.personalizationDescription");
  }
}

function SectionFrame({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
  return <section>{children}</section>;
}

function InlineDropdown<T extends string>({
  ariaLabel,
  onChange,
  options,
  value
}: {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  value: T;
}): ReactElement {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="inline-flex h-9 min-w-32 items-center justify-between gap-3 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition hover:bg-[#f7f7f8] focus:border-[#202123]"
        >
          <span>{selected.label}</span>
          <ChevronDown className="h-4 w-4 text-[#6e6e80]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-[16px] border border-[#ececf1] bg-white p-1.5 text-sm text-[#202123] shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
        >
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className="flex h-9 cursor-default select-none items-center justify-between gap-3 rounded-[10px] px-2.5 outline-none transition data-[highlighted]:bg-[#f7f7f8]"
            >
              <span>{option.label}</span>
              {option.value === value ? <Check className="h-4 w-4" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ProviderModelDropdown({
  currentModelId,
  language,
  models,
  providerLabel,
  onSelectModel
}: {
  currentModelId: string | null;
  language: Language;
  models: ForgeModel[];
  providerLabel: string;
  onSelectModel: (modelId: string) => void;
}): ReactElement {
  const currentProviderModel = models.find((model) => model.id === currentModelId) ?? null;
  const triggerLabel =
    models.length === 0
      ? language === "zh-CN"
        ? "暂无模型"
        : "No models"
      : currentProviderModel?.label ??
        (language === "zh-CN" ? `查看 ${models.length} 个模型` : `View ${models.length} models`);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={models.length === 0}
          aria-label={
            language === "zh-CN" ? `${providerLabel} 可用模型` : `${providerLabel} available models`
          }
          className="inline-flex h-9 min-w-36 items-center justify-between gap-3 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition hover:bg-[#f7f7f8] focus:border-[#202123] disabled:cursor-not-allowed disabled:text-[#8e8ea0]"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6e6e80]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-80 min-w-[260px] overflow-auto rounded-[16px] border border-[#ececf1] bg-white p-1.5 text-sm text-[#202123] shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
        >
          {models.map((model) => (
            <DropdownMenu.Item
              key={model.id}
              onSelect={() => onSelectModel(model.id)}
              className="grid min-h-10 cursor-default select-none grid-cols-[minmax(0,1fr)_18px] items-center gap-3 rounded-[10px] px-2.5 py-2 outline-none transition data-[highlighted]:bg-[#f7f7f8]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{model.label}</span>
                <span className="block truncate text-xs text-[#8e8ea0]">{model.modelName}</span>
              </span>
              {model.id === currentModelId ? <Check className="h-4 w-4" /> : <span />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ProviderMark({
  provider,
  fallbackLabel
}: {
  provider: ForgeProvider | null;
  fallbackLabel: string;
}): ReactElement {
  const accentColor = provider?.accentColor ?? "#6e6e80";
  const icon = provider?.icon ?? getProviderInitials(fallbackLabel);
  const style = {
    color: accentColor,
    borderColor: accentColor
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      style={style}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border bg-white text-[10px] font-bold tracking-normal"
    >
      {icon}
    </span>
  );
}

function getProviderInitials(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "API";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
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
    <label className="grid min-w-0 gap-1 text-xs text-[#6e6e80]">
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value) || 0)}
        className="h-9 w-full rounded-[12px] border border-[#d9d9e3] bg-white px-2 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
      />
    </label>
  );
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString();
}
