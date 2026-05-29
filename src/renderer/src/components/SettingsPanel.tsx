import type { ComponentType, ReactElement } from "react";
import { useRef, useState } from "react";
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
  Image,
  KeyRound,
  Palette,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Terminal,
  Trash2
} from "lucide-react";
import type { ForgeModel, Language, ModelSettings } from "@shared/modelTypes";
import type { UsageEvent } from "@shared/usageTypes";
import { useI18n } from "@/i18n/useI18n";
import type { PersonalizationSettings } from "@/state/personalization";
import type { TaskThread } from "@/state/taskThreads";
import type { GeneralPreferences } from "@/state/generalPreferences";
import { getModelsForDisplay } from "@/state/modelSettings";
import {
  summarizeUsage,
  summarizeUsageByModel,
  summarizeUsageByProvider,
  type UsageRate,
  type UsageRateMap
} from "@/state/usage";
import { ProviderMark } from "./ProviderMark";
import { InlineSelectMenu } from "./InlineSelectMenu";

export type ProviderFetchState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
};

type SettingsPanelProps = {
  settings: ModelSettings;
  keyStatuses: Record<string, { hasKey: boolean; last4: string | null }>;
  archivedThreads: TaskThread[];
  generalPreferences: GeneralPreferences;
  onDeleteProviderKey: (providerId: string) => void;
  onFetchModels: (providerId: string, apiKey?: string) => void;
  onAddProvider: (label: string, baseUrl: string) => void;
  onClearUsage: () => void;
  onDeleteProvider: (providerId: string) => void;
  onSaveProviderKey: (providerId: string, apiKey: string) => void;
  onSetLanguage: (language: Language) => void;
  onToggleModelEnabled: (modelId: string, enabled: boolean) => void;
  onUpdateGeneralPreferences: (preferences: GeneralPreferences) => void;
  onUpdatePersonalization: (settings: PersonalizationSettings) => void;
  onUpdateProviderBaseUrl: (providerId: string, baseUrl: string) => void;
  onUpdateProviderLabel: (providerId: string, label: string) => void;
  onUpdateUsageRate: (rateKey: string, rate: UsageRate) => void;
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
  generalPreferences,
  onDeleteProviderKey,
  onFetchModels,
  onAddProvider,
  onClearUsage,
  onDeleteProvider,
  onSaveProviderKey,
  onSetLanguage,
  onToggleModelEnabled,
  onUpdateGeneralPreferences,
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
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [expandedUsageProviders, setExpandedUsageProviders] = useState<Record<string, boolean>>({});
  const backgroundFileInputRef = useRef<HTMLInputElement | null>(null);
  const availableModels = getModelsForDisplay(settings);
  const filteredAvailableModels = availableModels.filter((model) =>
    modelMatchesSearch(model, settings.providers, modelSearchQuery)
  );
  const enabledModelCount = availableModels.filter((model) => model.enabled).length;
  const currentModel =
    settings.models.find((model) => model.id === settings.currentModelId && model.enabled) ?? null;
  const currentProvider = currentModel
    ? (settings.providers.find((provider) => provider.id === currentModel.providerId) ?? null)
    : null;
  const totalUsage = summarizeUsage(usageEvents, usageRates);
  const providerUsage = summarizeUsageByProvider(usageEvents, usageRates);
  const modelUsage = summarizeUsageByModel(usageEvents, usageRates);
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

  function handleBackgroundFile(file: File | null): void {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        return;
      }

      onUpdateGeneralPreferences({
        ...generalPreferences,
        backgroundImageDataUrl: reader.result,
        backgroundOpacity: generalPreferences.backgroundOpacity || 0.18
      });
    });
    reader.readAsDataURL(file);
  }

  function renderGeneralSection(): ReactElement {
    const copy = getGeneralSettingsCopy(settings.language);

    return (
      <SectionFrame>
        <div className="grid gap-5">
          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[#202123]">{copy.workModeTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-[#6e6e80]">{copy.workModeDescription}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ModeCard
                icon={Terminal}
                label={copy.codeMode}
                description={copy.codeModeDescription}
                selected={generalPreferences.workMode === "code"}
                onClick={() =>
                  onUpdateGeneralPreferences({ ...generalPreferences, workMode: "code" })
                }
              />
              <ModeCard
                icon={Globe2}
                label={copy.dailyMode}
                description={copy.dailyModeDescription}
                selected={generalPreferences.workMode === "daily"}
                onClick={() =>
                  onUpdateGeneralPreferences({ ...generalPreferences, workMode: "daily" })
                }
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
            <SettingRow label={t("settings.language")} description={copy.languageDescription}>
              <InlineSelectMenu
                ariaLabel={t("settings.language")}
                value={settings.language}
                options={[
                  { value: "zh-CN", label: "中文" },
                  { value: "en-US", label: "English" }
                ]}
                onChange={(value) => onSetLanguage(value as Language)}
              />
            </SettingRow>
            <SettingRow label={copy.defaultOpenTarget} description={copy.defaultOpenTargetDescription}>
              <InlineSelectMenu
                ariaLabel={copy.defaultOpenTarget}
                value={generalPreferences.defaultOpenTarget}
                options={[
                  { value: "recent-project", label: copy.recentProject },
                  { value: "blank", label: copy.blankWorkspace }
                ]}
                onChange={(value) =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    defaultOpenTarget: value as GeneralPreferences["defaultOpenTarget"]
                  })
                }
              />
            </SettingRow>
            <SettingRow label={copy.agentRuntime} description={copy.agentRuntimeDescription}>
              <InlineSelectMenu
                ariaLabel={copy.agentRuntime}
                value={generalPreferences.agentRuntime}
                options={[
                  { value: "windows-native", label: copy.windowsNative },
                  { value: "wsl", label: "WSL" }
                ]}
                onChange={(value) =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    agentRuntime: value as GeneralPreferences["agentRuntime"]
                  })
                }
              />
            </SettingRow>
            <SettingRow label={copy.terminalShell} description={copy.terminalShellDescription}>
              <InlineSelectMenu
                ariaLabel={copy.terminalShell}
                value={generalPreferences.terminalShell}
                options={[
                  { value: "powershell", label: "PowerShell" },
                  { value: "cmd", label: "Command Prompt" },
                  { value: "git-bash", label: "Git Bash" }
                ]}
                onChange={(value) =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    terminalShell: value as GeneralPreferences["terminalShell"]
                  })
                }
              />
            </SettingRow>
          </div>

          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[#202123]">{copy.appBackground}</h2>
              <p className="mt-1 text-xs leading-5 text-[#6e6e80]">
                {copy.appBackgroundDescription}
              </p>
            </div>
            <div
              data-testid="wallpaper-settings-panel"
              className="grid min-h-[156px] gap-4 rounded-[16px] border border-[#ececf1] bg-white p-4 lg:grid-cols-[minmax(0,1fr)_240px]"
            >
              <div className="flex min-w-0 flex-col justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#202123]">{copy.wallpaperImage}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#6e6e80]">
                    {copy.wallpaperImageDescription}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={backgroundFileInputRef}
                    type="file"
                    accept="image/*"
                    aria-label={copy.uploadBackground}
                    className="hidden"
                    onChange={(event) => {
                      handleBackgroundFile(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] transition hover:bg-[#f7f7f8]"
                    onClick={() => backgroundFileInputRef.current?.click()}
                  >
                    <Image className="h-4 w-4" />
                    {copy.uploadBackground}
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] transition hover:bg-[#f7f7f8]"
                    onClick={() =>
                      onUpdateGeneralPreferences({
                        ...generalPreferences,
                        backgroundImageDataUrl: null
                      })
                    }
                  >
                    {copy.clearBackground}
                  </button>
                </div>
                <label className="grid gap-2">
                  <span className="flex items-center justify-between gap-3 text-xs text-[#6e6e80]">
                    <span>{copy.backgroundOpacity}</span>
                    <span className="font-medium text-[#202123]">
                      {Math.round(generalPreferences.backgroundOpacity * 100)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min="8"
                    max="36"
                    step="1"
                    aria-label={copy.backgroundOpacity}
                    value={Math.round(generalPreferences.backgroundOpacity * 100)}
                    onChange={(event) =>
                      onUpdateGeneralPreferences({
                        ...generalPreferences,
                        backgroundOpacity: Number(event.currentTarget.value) / 100
                      })
                    }
                    className="w-full accent-[#202123]"
                  />
                </label>
              </div>
              <div
                data-testid="wallpaper-preview"
                className="relative min-h-28 overflow-hidden rounded-[14px] border border-[#ececf1] bg-[#f7f7f8]"
                style={{
                  backgroundImage: generalPreferences.backgroundImageDataUrl
                    ? `url(${generalPreferences.backgroundImageDataUrl})`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              >
                <div
                  className="absolute inset-0 bg-white"
                  style={{ opacity: 1 - generalPreferences.backgroundOpacity }}
                />
                <div className="absolute inset-x-4 bottom-4 h-7 rounded-[10px] border border-white/70 bg-white/80 shadow-sm" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[#202123]">{copy.permissionsTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-[#6e6e80]">{copy.permissionsDescription}</p>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
              <PreferenceToggle
                label={copy.defaultPermission}
                description={copy.defaultPermissionDescription}
                enabled={generalPreferences.defaultPermission}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    defaultPermission: !generalPreferences.defaultPermission
                  })
                }
              />
              <PreferenceToggle
                label={copy.autoReview}
                description={copy.autoReviewDescription}
                enabled={generalPreferences.autoReview}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    autoReview: !generalPreferences.autoReview
                  })
                }
              />
              <PreferenceToggle
                label={copy.fullAccess}
                description={copy.fullAccessDescription}
                enabled={generalPreferences.fullAccess}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    fullAccess: !generalPreferences.fullAccess
                  })
                }
              />
              <PreferenceToggle
                label={copy.telemetry}
                description={copy.telemetryDescription}
                enabled={generalPreferences.telemetry}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    telemetry: !generalPreferences.telemetry
                  })
                }
              />
            </div>
          </div>
        </div>
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
            value={`${enabledModelCount}/${availableModels.length}`}
          />
          <StatusTile
            icon={Globe2}
            label={t("settings.currentProvider")}
            value={currentProvider?.label ?? t("settings.noModel")}
          />
        </div>

        <label className="mb-3 flex h-10 items-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] transition focus-within:border-[#202123]">
          <Search className="h-4 w-4 shrink-0 text-[#6e6e80]" />
          <input
            type="search"
            role="searchbox"
            aria-label={t("settings.searchModels")}
            placeholder={t("settings.searchModelsPlaceholder")}
            value={modelSearchQuery}
            onChange={(event) => setModelSearchQuery(event.currentTarget.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8e8ea0]"
          />
        </label>

        <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
          {filteredAvailableModels.length > 0 ? (
            filteredAvailableModels.map((model, index) => {
              const provider =
                settings.providers.find((candidate) => candidate.id === model.providerId) ?? null;
              const providerLabel = provider?.label ?? model.providerId;
              const selected = model.enabled && settings.currentModelId === model.id;
              const modelDetails = formatModelDetails(settings.language, model, providerLabel);

              return (
                <div
                  key={model.id}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 bg-white px-4 py-3 text-sm ${
                    index === 0 ? "" : "border-t border-[#ececf1]"
                  }`}
                >
                  <button
                    type="button"
                    disabled={!model.enabled}
                    onClick={() => onSelectModel(model.id)}
                    className="flex min-w-0 items-center gap-3 text-left outline-none transition hover:opacity-80 disabled:cursor-not-allowed disabled:hover:opacity-100"
                  >
                    <ProviderMark provider={provider} fallbackLabel={providerLabel} size="md" />
                    <span className="min-w-0">
                      <span
                        className={`block truncate font-medium ${
                          model.enabled ? "text-[#202123]" : "text-[#6e6e80]"
                        }`}
                      >
                        {model.label}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#6e6e80]">
                        {modelDetails}
                      </span>
                    </span>
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    {selected ? (
                      <Check className="h-4 w-4 text-[#202123]" />
                    ) : null}
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${
                        model.enabled
                          ? "border-[#c3eadc] bg-[#effaf6] text-[#087443]"
                          : "border-[#f4c7ab] bg-[#fff7ed] text-[#b45309]"
                      }`}
                    >
                      {model.enabled ? t("settings.enabled") : t("settings.disabled")}
                    </span>
                    <button
                      type="button"
                      aria-label={getModelToggleLabel(settings.language, model.label, model.enabled)}
                      aria-pressed={model.enabled}
                      onClick={() => onToggleModelEnabled(model.id, !model.enabled)}
                      className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                        model.enabled ? "justify-end bg-[#202123]" : "justify-start bg-[#d9d9e3]"
                      }`}
                    >
                      <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]" />
                    </button>
                  </span>
                </div>
              );
            })
          ) : availableModels.length > 0 ? (
            <div className="px-4 py-10 text-center text-sm leading-6 text-[#6e6e80]">
              {t("settings.noModelSearchResults")}
            </div>
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
                  className="flex w-full items-center justify-between gap-4 px-4 py-1.5 text-left transition hover:bg-[#f7f7f8]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ProviderMark provider={provider} fallbackLabel={providerLabel} size="md" />
                    <span className="min-w-0">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[#202123]">{providerLabel}</span>
                        <span
                          className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs ${
                            !requiresApiKey || keyStatus.hasKey
                              ? "bg-[#effaf6] text-[#087443]"
                              : "bg-[#fff7ed] text-[#b45309]"
                          }`}
                        >
                          {!requiresApiKey || keyStatus.hasKey ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <CircleAlert className="h-3.5 w-3.5" />
                          )}
                          {!requiresApiKey
                            ? settings.language === "zh-CN"
                              ? "本地服务"
                              : "Local"
                            : keyStatus.hasKey
                            ? `${t("settings.connected")} ****${keyStatus.last4}`
                            : t("settings.notConfigured")}
                        </span>
                        {provider.custom ? (
                          <span className="rounded-full border border-[#ececf1] bg-[#f7f7f8] px-2 py-0.5 text-[11px] text-[#565869]">
                            {t("settings.customProvider")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[#6e6e80] transition ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <div
                  className="forge-provider-collapse"
                  data-state={isExpanded ? "open" : "closed"}
                  aria-hidden={!isExpanded}
                  inert={!isExpanded}
                >
                  <div className="grid gap-3 px-4 py-4">
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

                    <div className="flex items-center gap-2 overflow-hidden">
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
                        onClick={() => onFetchModels(provider.id, draftKey)}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${fetchState.status === "loading" ? "animate-spin" : ""}`} />
                        {fetchState.status === "loading"
                          ? settings.language === "zh-CN"
                            ? "拉取中"
                            : "Fetching"
                          : t("settings.fetchModels")}
                      </button>
                      {fetchState.message ? (
                        <span
                          className={`min-w-0 max-w-[560px] truncate text-xs ${
                            fetchState.status === "error" ? "text-[#b45309]" : "text-[#087443]"
                          }`}
                          title={fetchState.message}
                        >
                          {fetchState.message}
                        </span>
                      ) : null}
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
                    <div className="rounded-[14px] border border-[#ececf1] bg-white p-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(560px,672px)] md:items-center">
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
                </div>
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
            const legacyProviderRate = usageRates[provider.id] ?? {
              inputPerMillion: 0,
              outputPerMillion: 0
            };
            const providerModels = getProviderModelRows(provider.id);
            const isExpanded = expandedUsageProviders[provider.id] === true;

            return (
              <div
                key={provider.id}
                className={`grid gap-3 px-4 py-3 ${
                  index === 0 ? "" : "border-t border-[#ececf1]"
                }`}
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedUsageProviders((current) => ({
                      ...current,
                      [provider.id]: !isExpanded
                    }))
                  }
                  className="grid w-full gap-4 rounded-[12px] px-1 py-1.5 text-left transition hover:bg-[#f7f7f8] lg:grid-cols-[minmax(180px,1fr)_minmax(120px,180px)_92px_18px] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ProviderMark provider={provider} fallbackLabel={provider.label} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#202123]">
                        {provider.label}
                      </span>
                      <span className="mt-1 block text-xs text-[#6e6e80]">
                        {formatInteger(usage.totalTokens)} tokens / {usage.requests} requests
                      </span>
                    </span>
                  </div>
                  <div className="text-xs text-[#6e6e80] lg:text-right">
                    <span className="block font-medium text-[#202123]">
                      {formatInteger(usage.totalTokens)}
                    </span>
                    <span>{t("settings.totalTokens")}</span>
                  </div>
                  <div className="text-sm font-semibold text-[#202123] lg:text-right">
                    ${usage.estimatedCost.toFixed(4)}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-[#6e6e80] transition ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                {providerModels.length > 0 ? (
                  <div
                    className="forge-provider-collapse rounded-[12px] border border-transparent bg-[#fafafa]"
                    data-state={isExpanded ? "open" : "closed"}
                    aria-hidden={!isExpanded}
                    inert={!isExpanded}
                  >
                    <div className="overflow-hidden rounded-[12px]">
                      {providerModels.map((modelRow, modelIndex) => {
                        const modelRate = usageRates[modelRow.id] ?? legacyProviderRate;
                        const usageForModel =
                          modelUsage[modelRow.id] ?? summarizeUsage([], usageRates);

                        return (
                          <div
                            key={modelRow.id}
                            className={`grid gap-3 px-3 py-3 lg:grid-cols-[minmax(180px,1fr)_minmax(150px,200px)_minmax(150px,200px)_92px] lg:items-end ${
                              modelIndex === 0 ? "" : "border-t border-[#ececf1]"
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-[#202123]">
                                {modelRow.label}
                              </span>
                              <span className="mt-1 block truncate text-[11px] text-[#8e8ea0]">
                                {formatInteger(usageForModel.totalTokens)} tokens /{" "}
                                {usageForModel.requests} requests
                              </span>
                            </div>
                            <PriceInput
                              label={getUsageModelInputLabel(settings.language)}
                              value={modelRate.inputPerMillion}
                              onChange={(value) =>
                                onUpdateUsageRate(modelRow.id, {
                                  ...modelRate,
                                  inputPerMillion: value
                                })
                              }
                            />
                            <PriceInput
                              label={getUsageModelOutputLabel(settings.language)}
                              value={modelRate.outputPerMillion}
                              onChange={(value) =>
                                onUpdateUsageRate(modelRow.id, {
                                  ...modelRate,
                                  outputPerMillion: value
                                })
                              }
                            />
                            <div className="text-xs font-semibold text-[#202123] lg:text-right">
                              ${usageForModel.estimatedCost.toFixed(4)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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

  function getProviderModelRows(providerId: string): Array<{ id: string; label: string }> {
    const rowsById = new Map<string, { id: string; label: string }>();

    for (const model of settings.models.filter((candidate) => candidate.providerId === providerId)) {
      rowsById.set(model.id, { id: model.id, label: model.label });
    }

    for (const event of usageEvents.filter((candidate) => candidate.providerId === providerId)) {
      rowsById.set(event.modelId, {
        id: event.modelId,
        label:
          rowsById.get(event.modelId)?.label ??
          event.modelId.replace(`${providerId}:`, "") ??
          event.modelId
      });
    }

    return Array.from(rowsById.values());
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
            <InlineSelectMenu
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

function getModelToggleLabel(language: Language, modelLabel: string, enabled: boolean): string {
  if (language === "zh-CN") {
    return `${enabled ? "停用" : "启用"} ${modelLabel}`;
  }

  return `${enabled ? "Disable" : "Enable"} ${modelLabel}`;
}

function modelMatchesSearch(
  model: ForgeModel,
  providers: ModelSettings["providers"],
  query: string
): boolean {
  const normalizedQuery = normalizeModelSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const provider = providers.find((candidate) => candidate.id === model.providerId);
  const normalizedHaystack = normalizeModelSearchText(
    [model.id, model.modelName, model.label, model.providerId, provider?.label ?? ""].join(" ")
  );

  return normalizedHaystack.includes(normalizedQuery);
}

function normalizeModelSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function formatModelDetails(
  language: Language,
  model: ForgeModel,
  providerLabel: string
): string {
  const sourcePrefix = language === "zh-CN" ? "来源" : "From";
  const details = [`${sourcePrefix} ${providerLabel}`];

  if (model.modelName !== model.label) {
    details.push(model.modelName);
  }

  if (model.capabilities.contextWindow) {
    details.push(formatContextWindow(language, model.capabilities.contextWindow));
  }

  if (model.pricing) {
    details.push(
      `$${formatPrice(model.pricing.inputPerMillion)} / $${formatPrice(
        model.pricing.outputPerMillion
      )} / 1M`
    );
  }

  return details.join(" · ");
}

function formatContextWindow(language: Language, contextWindow: number): string {
  const compactValue =
    contextWindow >= 1000 ? `${Math.round(contextWindow / 1000)}K` : formatInteger(contextWindow);

  return language === "zh-CN" ? `${compactValue} 上下文` : `${compactValue} context`;
}

function formatPrice(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function ModeCard({
  description,
  icon: Icon,
  label,
  onClick,
  selected
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  selected: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`grid grid-cols-[24px_minmax(0,1fr)_18px] items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition active:scale-[0.99] ${
        selected
          ? "border-[#d9d9e3] bg-[#ececf1] text-[#202123]"
          : "border-[#ececf1] bg-white text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#6e6e80]">{description}</span>
      </span>
      {selected ? <Check className="h-4 w-4 text-[#202123]" /> : <span />}
    </button>
  );
}

function SettingRow({
  children,
  description,
  label
}: {
  children: ReactElement;
  description: string;
  label: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#ececf1] px-4 py-3 text-sm last:border-b-0">
      <span className="min-w-0">
        <span className="block font-medium text-[#202123]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#6e6e80]">{description}</span>
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

function PreferenceToggle({
  description,
  enabled,
  label,
  onToggle
}: {
  description: string;
  enabled: boolean;
  label: string;
  onToggle: () => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#ececf1] px-4 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#202123]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[#6e6e80]">{description}</span>
      </span>
      <button
        type="button"
        aria-pressed={enabled}
        aria-label={label}
        onClick={onToggle}
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
          enabled ? "justify-end bg-[#202123]" : "justify-start bg-[#d9d9e3]"
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]" />
      </button>
    </div>
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
          className="inline-flex h-9 w-full min-w-0 items-center justify-between gap-3 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition hover:bg-[#f7f7f8] focus:border-[#202123] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#f7f7f8] disabled:text-[#8e8ea0] md:min-w-[560px]"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6e6e80]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="forge-dropdown-content z-50 max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[560px] overflow-auto rounded-[16px] border border-[#ececf1] bg-white p-1.5 text-sm text-[#202123] shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
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

function getUsageModelInputLabel(language: Language): string {
  return language === "zh-CN" ? "模型输入单价 / 1M" : "Model input price / 1M";
}

function getUsageModelOutputLabel(language: Language): string {
  return language === "zh-CN" ? "模型输出单价 / 1M" : "Model output price / 1M";
}

function getGeneralSettingsCopy(language: Language): {
  agentRuntime: string;
  agentRuntimeDescription: string;
  appBackground: string;
  appBackgroundDescription: string;
  autoReview: string;
  autoReviewDescription: string;
  backgroundOpacity: string;
  backgroundOpacityDescription: string;
  blankWorkspace: string;
  codeMode: string;
  codeModeDescription: string;
  clearBackground: string;
  dailyMode: string;
  dailyModeDescription: string;
  defaultOpenTarget: string;
  defaultOpenTargetDescription: string;
  defaultPermission: string;
  defaultPermissionDescription: string;
  fullAccess: string;
  fullAccessDescription: string;
  languageDescription: string;
  permissionsDescription: string;
  permissionsTitle: string;
  recentProject: string;
  telemetry: string;
  telemetryDescription: string;
  terminalShell: string;
  terminalShellDescription: string;
  uploadBackground: string;
  wallpaperImage: string;
  wallpaperImageDescription: string;
  windowsNative: string;
  workModeDescription: string;
  workModeTitle: string;
} {
  if (language === "zh-CN") {
    return {
      agentRuntime: "智能体环境",
      agentRuntimeDescription: "选择智能体在 Windows 上的运行位置",
      appBackground: "软件背景",
      appBackgroundDescription: "上传一张壁纸作为 Forge 的背景, 默认保持轻微透明避免影响阅读",
      autoReview: "自动审核",
      autoReviewDescription: "运行前自动审查潜在高风险操作",
      backgroundOpacity: "背景透明度",
      backgroundOpacityDescription: "控制壁纸的显示强度",
      blankWorkspace: "空白工作区",
      codeMode: "适用于编程",
      codeModeDescription: "更技术性的回答和控制",
      clearBackground: "清除背景图",
      dailyMode: "适用于日常工作",
      dailyModeDescription: "同样强大, 技术细节更少",
      defaultOpenTarget: "默认打开目标",
      defaultOpenTargetDescription: "默认打开文件和文件夹的位置",
      defaultPermission: "默认权限",
      defaultPermissionDescription: "允许 Forge 读取和编辑当前工作区中的文件",
      fullAccess: "完全访问权限",
      fullAccessDescription: "允许请求额外文件和联网命令, 生产操作仍需谨慎",
      languageDescription: "应用 UI 语言",
      permissionsDescription: "控制智能体默认能做什么, 高风险操作仍会保留明确反馈",
      permissionsTitle: "权限",
      recentProject: "最近项目",
      telemetry: "诊断信息",
      telemetryDescription: "本地保留基础诊断开关, 默认关闭",
      terminalShell: "集成终端 Shell",
      terminalShellDescription: "选择要在集成终端中打开的 Shell",
      uploadBackground: "上传背景图",
      wallpaperImage: "背景图片",
      wallpaperImageDescription: "选择本机图片作为软件背景",
      windowsNative: "Windows 原生",
      workModeDescription: "选择 Forge 默认显示多少技术细节",
      workModeTitle: "工作模式"
    };
  }

  return {
    agentRuntime: "Agent runtime",
    agentRuntimeDescription: "Choose where the agent runs on Windows",
    appBackground: "App background",
    appBackgroundDescription:
      "Upload a wallpaper for Forge. The default opacity stays subtle so code remains readable.",
    autoReview: "Auto review",
    autoReviewDescription: "Review potentially risky operations before running",
    backgroundOpacity: "App background opacity",
    backgroundOpacityDescription: "Control how strongly the wallpaper appears",
    blankWorkspace: "Blank workspace",
    codeMode: "Code work",
    codeModeDescription: "More technical answers and controls",
    clearBackground: "Clear background image",
    dailyMode: "Daily work",
    dailyModeDescription: "Same power, fewer implementation details",
    defaultOpenTarget: "Default open target",
    defaultOpenTargetDescription: "Default location for opening files and folders",
    defaultPermission: "Default permission",
    defaultPermissionDescription: "Allow Forge to read and edit files in the current workspace",
    fullAccess: "Full access",
    fullAccessDescription: "Allow extra file access and network commands when needed",
    languageDescription: "Application UI language",
    permissionsDescription: "Control what the agent can do by default",
    permissionsTitle: "Permissions",
    recentProject: "Recent project",
    telemetry: "Diagnostics",
    telemetryDescription: "Keep local diagnostics off by default",
    terminalShell: "Integrated terminal shell",
    terminalShellDescription: "Choose the shell opened in the integrated terminal",
    uploadBackground: "Upload background image",
    wallpaperImage: "Background image",
    wallpaperImageDescription: "Choose a local image to use behind the app",
    windowsNative: "Windows native",
    workModeDescription: "Choose how much technical detail Forge shows by default",
    workModeTitle: "Work mode"
  };
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString();
}
