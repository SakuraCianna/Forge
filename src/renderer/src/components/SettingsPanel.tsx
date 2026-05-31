// 本文件说明: 渲染常规, 模型, API, Agent, 记忆和用量设置
import type { ComponentType, ReactElement } from "react";
import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Archive,
  Bot,
  Brain,
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
import type { AgentMemoryEntry } from "@/state/agentMemory";
import type { AgentProfile, AgentProfilePatch, AgentProfileTool } from "@/state/agentProfiles";
import {
  clampCommandTimeoutSeconds,
  defaultCommandSafetyRuleReason,
  maxCommandTimeoutSeconds,
  minCommandTimeoutSeconds,
  type CommandSafetyRule,
  type CommandSafetyRuleLevel,
  type GeneralPreferences
} from "@/state/generalPreferences";
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
  agentMemories: AgentMemoryEntry[];
  agentProfiles: AgentProfile[];
  generalPreferences: GeneralPreferences;
  onClearAgentMemories: () => void;
  onDeleteProviderKey: (providerId: string) => void;
  onDeleteAgentMemory: (memoryId: string) => void;
  onSelectAgentProfile: (profileId: string) => void;
  onFetchModels: (providerId: string, apiKey?: string) => void;
  onAddManualModel: (providerId: string, modelName: string, apiKey?: string) => void;
  onAddProvider: (label: string, baseUrl: string) => void;
  onClearUsage: () => void;
  onDeleteProvider: (providerId: string) => void;
  onSaveProviderKey: (providerId: string, apiKey: string) => void;
  onSetLanguage: (language: Language) => void;
  onToggleModelEnabled: (modelId: string, enabled: boolean) => void;
  onUpdateAgentProfile: (profileId: string, patch: AgentProfilePatch) => void;
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

type SettingsSection =
  | "general"
  | "models"
  | "providers"
  | "agents"
  | "memory"
  | "usage"
  | "personalization"
  | "archived";

type SectionItem = {
  id: SettingsSection;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

// 管理设置页分区切换和表单状态, 默认进入常规设置
export function SettingsPanel({
  settings,
  keyStatuses,
  archivedThreads,
  agentMemories,
  agentProfiles,
  generalPreferences,
  onClearAgentMemories,
  onDeleteAgentMemory,
  onDeleteProviderKey,
  onSelectAgentProfile,
  onFetchModels,
  onAddManualModel,
  onAddProvider,
  onClearUsage,
  onDeleteProvider,
  onSaveProviderKey,
  onSetLanguage,
  onToggleModelEnabled,
  onUpdateAgentProfile,
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
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [expandedProviderId, setExpandedProviderId] = useState(settings.providers[0]?.id ?? "");
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [draftBaseUrls, setDraftBaseUrls] = useState<Record<string, string>>({});
  const [manualModelProviderId, setManualModelProviderId] = useState<string | null>(null);
  const [draftManualModels, setDraftManualModels] = useState<Record<string, string>>({});
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
  const activeAgentProfile = agentProfiles.find((profile) => profile.active) ?? agentProfiles[0] ?? null;
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
      id: "agents",
      label: settings.language === "zh-CN" ? "Agent 配置" : "Agent profiles",
      description: activeAgentProfile?.name ?? (settings.language === "zh-CN" ? "暂无" : "None"),
      icon: Bot
    },
    {
      id: "memory",
      label: settings.language === "zh-CN" ? "记忆" : "Memory",
      description:
        agentMemories.length > 0
          ? `${agentMemories.length}`
          : settings.language === "zh-CN"
            ? "暂无"
            : "None",
      icon: Brain
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
            {activeSection === "agents" ? renderAgentProfilesSection() : null}
            {activeSection === "memory" ? renderMemorySection() : null}
            {activeSection === "usage" ? renderUsageSection() : null}
            {activeSection === "personalization" ? renderPersonalizationSection() : null}
            {activeSection === "archived" ? renderArchivedSection() : null}
          </main>
        </div>
      </div>
    </section>
  );

  // 读取用户选择的背景图并转成 data URL 保存
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

  // 新增一条命令安全规则, 默认使用本地验证命令作为可编辑模板
  function addCommandSafetyRule(): void {
    updateCommandSafetyRules([
      ...generalPreferences.commandSafetyRules,
      {
        id: createCommandSafetyRuleId(),
        pattern: "npm run e2e *",
        level: "ask",
        reason: defaultCommandSafetyRuleReason
      }
    ]);
  }

  // 更新单条命令安全规则, 保留其他规则的顺序
  function updateCommandSafetyRule(ruleId: string, patch: Partial<CommandSafetyRule>): void {
    updateCommandSafetyRules(
      generalPreferences.commandSafetyRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule
      )
    );
  }

  // 删除单条命令安全规则, 不影响其他权限开关
  function deleteCommandSafetyRule(ruleId: string): void {
    updateCommandSafetyRules(generalPreferences.commandSafetyRules.filter((rule) => rule.id !== ruleId));
  }

  // 写回命令安全规则列表, 交给通用偏好统一持久化
  function updateCommandSafetyRules(commandSafetyRules: CommandSafetyRule[]): void {
    onUpdateGeneralPreferences({
      ...generalPreferences,
      commandSafetyRules
    });
  }

  // 渲染通用设置, 包含工作模式, 语言和命令安全规则
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
              <h2 className="text-sm font-semibold text-[#202123]">{copy.inputRunTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-[#6e6e80]">
                {copy.inputRunDescription}
              </p>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
              <SettingRow
                label={copy.composerSubmitShortcut}
                description={copy.composerSubmitShortcutDescription}
              >
                <InlineSelectMenu
                  ariaLabel={copy.composerSubmitShortcut}
                  value={generalPreferences.composerSubmitShortcut}
                  options={[
                    { value: "enter", label: copy.submitWithEnter },
                    { value: "ctrl-enter", label: copy.submitWithCtrlEnter }
                  ]}
                  onChange={(value) =>
                    onUpdateGeneralPreferences({
                      ...generalPreferences,
                      composerSubmitShortcut:
                        value as GeneralPreferences["composerSubmitShortcut"]
                    })
                  }
                />
              </SettingRow>
              <SettingRow label={copy.commandTimeout} description={copy.commandTimeoutDescription}>
                <label className="inline-flex h-9 min-w-32 items-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123]">
                  <input
                    type="number"
                    min={minCommandTimeoutSeconds}
                    max={maxCommandTimeoutSeconds}
                    step="15"
                    aria-label={copy.commandTimeout}
                    value={generalPreferences.commandTimeoutSeconds}
                    onChange={(event) =>
                      onUpdateGeneralPreferences({
                        ...generalPreferences,
                        commandTimeoutSeconds: clampCommandTimeoutSeconds(
                          Number(event.currentTarget.value)
                        )
                      })
                    }
                    className="w-16 bg-transparent text-right outline-none"
                  />
                  <span className="text-xs text-[#6e6e80]">{copy.commandTimeoutUnit}</span>
                </label>
              </SettingRow>
              <PreferenceToggle
                label={copy.autoRunSafeActions}
                description={copy.autoRunSafeActionsDescription}
                enabled={generalPreferences.autoRunSafeActions}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    autoRunSafeActions: !generalPreferences.autoRunSafeActions
                  })
                }
              />
            </div>
          </div>

          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-[#202123]">{copy.outputTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-[#6e6e80]">{copy.outputDescription}</p>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
              <PreferenceToggle
                label={copy.showProcessedSummary}
                description={copy.showProcessedSummaryDescription}
                enabled={generalPreferences.showProcessedSummary}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    showProcessedSummary: !generalPreferences.showProcessedSummary
                  })
                }
              />
              <PreferenceToggle
                label={copy.expandProcessedSummary}
                description={copy.expandProcessedSummaryDescription}
                enabled={generalPreferences.expandProcessedSummary}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    expandProcessedSummary: !generalPreferences.expandProcessedSummary
                  })
                }
              />
            </div>
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
                label={copy.readOnly}
                description={copy.readOnlyDescription}
                enabled={generalPreferences.readOnly}
                onToggle={() =>
                  onUpdateGeneralPreferences({
                    ...generalPreferences,
                    defaultPermission: true,
                    autoReview: true,
                    readOnly: !generalPreferences.readOnly,
                    fullAccess: false
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
                    defaultPermission: true,
                    autoReview: true,
                    readOnly: false,
                    fullAccess: false
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
                    defaultPermission: true,
                    autoReview: true,
                    readOnly: false,
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
              <div className="border-t border-[#ececf1] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#202123]">
                      {copy.commandRulesTitle}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#6e6e80]">
                      {copy.commandRulesDescription}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={copy.addCommandRule}
                    onClick={addCommandSafetyRule}
                    className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] transition hover:bg-[#f7f7f8]"
                  >
                    <Plus className="h-4 w-4" />
                    {copy.addCommandRule}
                  </button>
                </div>

                {generalPreferences.commandSafetyRules.length === 0 ? (
                  <p className="mt-3 text-xs leading-5 text-[#8e8ea0]">{copy.commandRulesEmpty}</p>
                ) : (
                  <div className="mt-3 divide-y divide-[#ececf1]">
                    {generalPreferences.commandSafetyRules.map((rule) => (
                      <div key={rule.id} className="grid gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_128px]">
                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-[#565869]">
                              {copy.commandRulePattern}
                            </span>
                            <input
                              type="text"
                              aria-label={copy.commandRulePattern}
                              value={rule.pattern}
                              onChange={(event) =>
                                updateCommandSafetyRule(rule.id, {
                                  pattern: event.currentTarget.value
                                })
                              }
                              className="h-9 min-w-0 rounded-[12px] border border-[#d9d9e3] bg-white px-3 font-mono text-sm text-[#202123] outline-none transition focus:border-[#202123]"
                            />
                          </label>
                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-[#565869]">
                              {copy.commandRuleLevelLabel}
                            </span>
                            <InlineSelectMenu<CommandSafetyRuleLevel>
                              ariaLabel={copy.commandRuleLevel}
                              value={rule.level}
                              options={[
                                { value: "allow", label: copy.commandRuleAllow },
                                { value: "ask", label: copy.commandRuleAsk },
                                { value: "deny", label: copy.commandRuleDeny }
                              ]}
                              onChange={(value) =>
                                updateCommandSafetyRule(rule.id, {
                                  level: value
                                })
                              }
                              triggerClassName="w-full min-w-0"
                            />
                          </label>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                          <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-[#565869]">
                              {copy.commandRuleReason}
                            </span>
                            <input
                              type="text"
                              aria-label={copy.commandRuleReason}
                              value={rule.reason}
                              onChange={(event) =>
                                updateCommandSafetyRule(rule.id, {
                                  reason: event.currentTarget.value
                                })
                              }
                              className="h-9 min-w-0 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
                            />
                          </label>
                          <button
                            type="button"
                            aria-label={copy.deleteCommandRule}
                            onClick={() => deleteCommandSafetyRule(rule.id)}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#8a1f11] transition hover:bg-[#fff7ed]"
                          >
                            <Trash2 className="h-4 w-4" />
                            {copy.deleteCommandRule}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionFrame>
    );
  }

  // 渲染可用模型管理, 搜索和启用状态都在这里处理
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

  // 渲染 API 配置和自定义模型添加入口
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
            const draftManualModel = draftManualModels[provider.id] ?? "";
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

                {/* 只挂载当前展开的 API 配置, 避免隐藏表单参与布局 */}
                {isExpanded ? (
                  <div data-testid="provider-profile-details" className="forge-provider-panel">
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

                    <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap">
                      {requiresApiKey ? (
                        <>
                          <button
                            type="button"
                            aria-label={`${t("settings.saveKey")} ${providerLabel} API Key`}
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[12px] bg-[#202123] px-3 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                            onClick={() => onSaveProviderKey(provider.id, draftKey)}
                          >
                            {t("settings.saveKey")}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-xs text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                            onClick={() => onDeleteProviderKey(provider.id)}
                          >
                            {t("settings.deleteKey")}
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={fetchState.status === "loading"}
                        className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 border border-[#d9d9e3] bg-white px-3 text-xs font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 ${
                          provider.custom ? "rounded-l-[12px] rounded-r-none" : "rounded-[12px]"
                        }`}
                        onClick={() => onFetchModels(provider.id, draftKey)}
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
                          aria-label={`Add model ID for ${providerLabel}`}
                          className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-l-none rounded-r-[12px] border border-l-0 border-[#d9d9e3] bg-white text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                          onClick={() =>
                            setManualModelProviderId((current) =>
                              current === provider.id ? null : provider.id
                            )
                          }
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : null}
                      {fetchState.message ? (
                        <span
                          className={`min-w-0 flex-1 truncate whitespace-nowrap text-xs ${
                            fetchState.status === "error" ? "text-[#b45309]" : "text-[#087443]"
                          }`}
                        >
                          {fetchState.message}
                        </span>
                      ) : null}
                      {provider.custom ? (
                        <button
                          type="button"
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[12px] border border-[#f1c2c2] bg-white px-3 text-xs font-semibold text-[#b42318] transition hover:bg-[#fff5f5] active:scale-[0.99]"
                          onClick={() => onDeleteProvider(provider.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("settings.deleteProvider")}
                        </button>
                      ) : null}
                    </div>

                    {manualModelProviderId === provider.id ? (
                      // 手动模型行保持单行, 避免状态信息挤压按钮
                      <div
                        data-testid={`manual-model-row-${provider.id}`}
                        className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap"
                      >
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">{providerLabel} model ID</span>
                          <input
                            aria-label={`${providerLabel} model ID`}
                            value={draftManualModel}
                            onChange={(event) => {
                              const nextValue = event.currentTarget.value;

                              setDraftManualModels((current) => ({
                                ...current,
                                [provider.id]: nextValue
                              }));
                            }}
                            placeholder="model-id"
                            className="h-9 w-full rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-xs text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={`Save ${providerLabel} model ID`}
                          className="h-9 shrink-0 rounded-[12px] bg-[#202123] px-3 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                          onClick={() => {
                            onAddManualModel(provider.id, draftManualModel, draftKey);
                            setDraftManualModels((current) => ({
                              ...current,
                              [provider.id]: ""
                            }));
                          }}
                        >
                          {settings.language === "zh-CN" ? "保存" : "Save"}
                        </button>
                      </div>
                    ) : null}

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
                ) : null}
              </article>
            );
          })}
        </div>
      </SectionFrame>
    );
  }

  // 渲染 Agent 配置编辑器, 权限和工具能力在这里配置
  function renderAgentProfilesSection(): ReactElement {
    const copy = getAgentProfilesCopy(settings.language);
    const selectedProfile = activeAgentProfile ?? agentProfiles[0] ?? null;

    return (
      <SectionFrame>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-[#202123]">{copy.title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#6e6e80]">{copy.description}</p>
        </div>

        {selectedProfile ? (
          <div
            data-testid="agent-profile-workbench"
            className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"
          >
            {/* 左侧 Agent 列表按内容高度排列, 避免被右侧表单拉伸 */}
            <div
              data-testid="agent-profile-list"
              className="grid self-start content-start gap-2 rounded-[18px] border border-[#ececf1] bg-[#f7f7f8] p-2"
            >
              {agentProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  aria-label={copy.selectProfile(profile.name)}
                  onClick={() => onSelectAgentProfile(profile.id)}
                  className={`grid min-h-[76px] grid-cols-[minmax(0,1fr)_18px] items-center gap-2 rounded-[14px] border px-3 py-3 text-left transition active:scale-[0.99] ${
                    profile.active
                      ? "border-[#d9d9e3] bg-white text-[#202123] shadow-[0_8px_22px_rgba(0,0,0,0.06)]"
                      : "border-transparent text-[#565869] hover:bg-white hover:text-[#202123]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{profile.name}</span>
                    <span className="mt-1 block truncate text-xs leading-5 text-[#8e8ea0]">
                      {profile.description}
                    </span>
                  </span>
                  {profile.active ? <Check className="h-4 w-4 text-[#202123]" /> : <span />}
                </button>
              ))}
            </div>

            <div
              data-testid="agent-profile-editor"
              className="overflow-hidden rounded-[20px] border border-[#ececf1] bg-[#fbfbfc] shadow-[0_18px_54px_rgba(0,0,0,0.05)]"
            >
              <div className="border-b border-[#ececf1] bg-white px-5 py-4">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-[#8e8ea0]">
                  {copy.title}
                </span>
                <h3 className="mt-1 text-base font-semibold text-[#202123]">
                  {selectedProfile.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-[#6e6e80]">
                  {selectedProfile.description}
                </p>
              </div>

              <div className="grid gap-4 p-5">
                <label className="grid gap-1 text-xs text-[#6e6e80]">
                  {copy.name}
                  <input
                    value={selectedProfile.name}
                    onChange={(event) =>
                      onUpdateAgentProfile(selectedProfile.id, { name: event.currentTarget.value })
                    }
                    className="h-10 rounded-[14px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#6e6e80]">
                  {copy.descriptionLabel}
                  <input
                    value={selectedProfile.description}
                    onChange={(event) =>
                      onUpdateAgentProfile(selectedProfile.id, {
                        description: event.currentTarget.value
                      })
                    }
                    className="h-10 rounded-[14px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#6e6e80]">
                  {copy.instructions}
                  <textarea
                    aria-label={copy.instructions}
                    value={selectedProfile.systemPrompt}
                    onChange={(event) =>
                      onUpdateAgentProfile(selectedProfile.id, {
                        systemPrompt: event.currentTarget.value
                      })
                    }
                    className="min-h-32 resize-none rounded-[14px] border border-[#d9d9e3] bg-white px-3 py-2.5 text-sm leading-5 text-[#202123] outline-none transition focus:border-[#202123]"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-3 rounded-[16px] border border-[#ececf1] bg-white p-4">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[#202123]">
                        {copy.permissionMode}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#6e6e80]">
                        {copy.permissionDescription}
                      </span>
                    </span>
                    <InlineSelectMenu<AgentProfile["permissionMode"]>
                      ariaLabel={copy.permissionMode}
                      value={selectedProfile.permissionMode}
                      options={[
                        { value: "auto", label: copy.autoReview },
                        { value: "full", label: copy.fullAccess }
                      ]}
                      onChange={(value) =>
                        onUpdateAgentProfile(selectedProfile.id, { permissionMode: value })
                      }
                    />
                  </div>
                  <label className="grid gap-3 rounded-[16px] border border-[#ececf1] bg-white p-4 text-xs text-[#6e6e80]">
                    <span>
                      <span className="block text-sm font-medium text-[#202123]">
                        {copy.contextBudget}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#6e6e80]">
                        2000 - 64000
                      </span>
                    </span>
                    <input
                      type="number"
                      min="2000"
                      max="64000"
                      step="1000"
                      value={selectedProfile.contextBudget}
                      onChange={(event) =>
                        onUpdateAgentProfile(selectedProfile.id, {
                          contextBudget: Number(event.currentTarget.value) || selectedProfile.contextBudget
                        })
                      }
                      className="h-10 rounded-[14px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
                    />
                  </label>
                </div>

                <div className="grid gap-3 rounded-[18px] border border-[#ececf1] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#202123]">{copy.tools}</span>
                    <span className="text-xs text-[#8e8ea0]">
                      {
                        (["read", "edit", "command", "git"] as const).filter(
                          (tool) => selectedProfile.tools[tool]
                        ).length
                      }
                      /4
                    </span>
                  </div>
                  <div data-testid="agent-tool-grid" className="grid gap-2 sm:grid-cols-4">
                    {(["read", "edit", "command", "git"] as const).map((tool) => (
                      <label
                        key={tool}
                        className={`flex h-10 items-center gap-2 rounded-[12px] border px-3 text-sm transition ${
                          selectedProfile.tools[tool]
                            ? "border-[#d9d9e3] bg-[#f7f7f8] text-[#202123]"
                            : "border-transparent bg-[#f7f7f8] text-[#6e6e80]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProfile.tools[tool]}
                          onChange={(event) =>
                            onUpdateAgentProfile(selectedProfile.id, {
                              tools: {
                                ...selectedProfile.tools,
                                [tool]: event.currentTarget.checked
                              }
                            })
                          }
                          className="accent-[#202123]"
                        />
                        {copy.toolLabel(tool)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#6e6e80]">{copy.empty}</p>
        )}
      </SectionFrame>
    );
  }

  // 渲染长期记忆列表, 只显示已保存的用户偏好和项目事实
  function renderMemorySection(): ReactElement {
    const copy = getMemorySettingsCopy(settings.language);

    return (
      <SectionFrame>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#202123]">{copy.title}</h2>
            <p className="mt-1 text-xs leading-5 text-[#6e6e80]">{copy.description}</p>
          </div>
          {agentMemories.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[#f4c7c7] bg-white px-3 text-sm text-[#b42318] transition hover:bg-[#fff5f5]"
              onClick={onClearAgentMemories}
            >
              <Trash2 className="h-4 w-4" />
              {copy.clearAll}
            </button>
          ) : null}
        </div>

        {agentMemories.length > 0 ? (
          <div className="overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
            {agentMemories.map((memory, index) => (
              <div
                key={memory.id}
                className={`grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] ${
                  index === 0 ? "" : "border-t border-[#ececf1]"
                }`}
              >
                <div className="min-w-0">
                  <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#d9d9e3] bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#565869]">
                      {memory.scope === "project" ? copy.projectScope : copy.globalScope}
                    </span>
                    <span className="truncate text-xs text-[#8e8ea0]">
                      {memory.projectPath ?? copy.allProjects}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[#202123]">
                    {memory.content}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={copy.deleteMemory}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-2 text-xs text-[#b42318] transition hover:bg-[#fff5f5]"
                  onClick={() => onDeleteAgentMemory(memory.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  {copy.delete}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[#d9d9e3] bg-white px-4 py-10 text-center text-sm leading-6 text-[#6e6e80]">
            {copy.empty}
          </div>
        )}
      </SectionFrame>
    );
  }

  // 渲染用量和价格设置, 成本统计依赖这里的价格表
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
                {providerModels.length > 0 && isExpanded ? (
                  <div
                    className="forge-provider-panel rounded-[12px] border border-transparent bg-[#fafafa]"
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

  // 过滤供应商模型行, 搜索词同时匹配名称和模型 id
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

  // 渲染个性化设置, 这些内容会追加到模型系统提示
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

  // 渲染已归档对话列表, 方便用户恢复旧会话
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

  // 把语气枚举翻译成设置页标签
  function getToneLabel(tone: PersonalizationSettings["replyTone"]): string {
    if (tone === "concise") {
      return t("settings.tone.concise");
    }

    if (tone === "technical") {
      return t("settings.tone.technical");
    }

    return t("settings.tone.friendly");
  }

  // 根据当前分区返回页面副标题
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

    if (section === "agents") {
      return settings.language === "zh-CN"
        ? "配置可复用的子 Agent 提示词, 权限和工具能力"
        : "Configure reusable sub-agent prompts, permissions, and tools";
    }

    if (section === "usage") {
      return t("settings.usageDescription");
    }

    if (section === "memory") {
      return settings.language === "zh-CN"
        ? "管理会被注入 Agent 上下文的本地记忆"
        : "Manage local memories injected into agent context";
    }

    if (section === "archived") {
      return settings.language === "zh-CN" ? "查看和恢复已归档的对话" : "Review and restore archived chats";
    }

    return t("settings.personalizationDescription");
  }
}

// 给设置分区提供统一外框, 保持表单密度一致
function SectionFrame({ children }: { children: ReactElement | ReactElement[] }): ReactElement {
  return <section>{children}</section>;
}

// 生成模型启用按钮的可访问文案
function getModelToggleLabel(language: Language, modelLabel: string, enabled: boolean): string {
  if (language === "zh-CN") {
    return `${enabled ? "停用" : "启用"} ${modelLabel}`;
  }

  return `${enabled ? "Disable" : "Enable"} ${modelLabel}`;
}

// 判断模型是否匹配搜索词, 供应商和能力信息都参与匹配
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
  const providerLabel = provider?.label ?? model.providerId;
  const normalizedHaystack = normalizeModelSearchText(
    [
      model.id,
      model.modelName,
      model.label,
      model.providerId,
      providerLabel,
      formatModelDetails("en-US", model, providerLabel),
      formatModelDetails("zh-CN", model, providerLabel)
    ].join(" ")
  );

  return normalizedHaystack.includes(normalizedQuery);
}

// 统一模型搜索文本大小写和空白
function normalizeModelSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

// 生成模型详情短文本, 显示上下文窗口和价格
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

  details.push(...formatModelCapabilityLabels(language, model));

  if (model.pricing) {
    details.push(
      `$${formatPrice(model.pricing.inputPerMillion)} / $${formatPrice(
        model.pricing.outputPerMillion
      )} / 1M`
    );
  }

  details.push(formatCapabilitySource(language, model.capabilitySource));

  return details.join(" · ");
}

// 把模型能力压成短标签, 让用户能看出 Provider API 探测到了什么
function formatModelCapabilityLabels(language: Language, model: ForgeModel): string[] {
  const labels: string[] = [];

  if (model.capabilities.reasoning.type !== "none") {
    labels.push(language === "zh-CN" ? "推理" : "Reasoning");
  }

  labels.push(...formatTriStateCapability(language, model.capabilities.toolCalling, "tools"));
  labels.push(...formatTriStateCapability(language, model.capabilities.streaming, "streaming"));
  labels.push(...formatTriStateCapability(language, model.capabilities.vision, "vision"));

  return labels;
}

// 格式化布尔或未知的模型能力, 未知能力不展示以保持列表简洁
function formatTriStateCapability(
  language: Language,
  capability: boolean | "unknown",
  kind: "tools" | "streaming" | "vision"
): string[] {
  if (capability === "unknown") {
    return [];
  }

  const labels = {
    tools: {
      enabled: language === "zh-CN" ? "工具调用" : "Tools",
      disabled: language === "zh-CN" ? "无工具调用" : "No tools"
    },
    streaming: {
      enabled: language === "zh-CN" ? "流式输出" : "Streaming",
      disabled: language === "zh-CN" ? "无流式输出" : "No streaming"
    },
    vision: {
      enabled: language === "zh-CN" ? "视觉" : "Vision",
      disabled: language === "zh-CN" ? "纯文本" : "Text only"
    }
  }[kind];

  return [capability ? labels.enabled : labels.disabled];
}

// 标记模型能力来自内置配置, 模型列表, 探测或手动添加
function formatCapabilitySource(language: Language, source: ForgeModel["capabilitySource"]): string {
  const labels: Record<ForgeModel["capabilitySource"], { zh: string; en: string }> = {
    "built-in": {
      zh: "内置能力",
      en: "Built-in"
    },
    "provider-api": {
      zh: "模型列表",
      en: "Provider API"
    },
    probe: {
      zh: "能力探测",
      en: "Probe"
    },
    manual: {
      zh: "手动添加",
      en: "Manual"
    }
  };

  return language === "zh-CN" ? labels[source].zh : labels[source].en;
}

// 把上下文窗口数字格式化成 k tokens
function formatContextWindow(language: Language, contextWindow: number): string {
  const compactValue =
    contextWindow >= 1000 ? `${Math.round(contextWindow / 1000)}K` : formatInteger(contextWindow);

  return language === "zh-CN" ? `${compactValue} 上下文` : `${compactValue} context`;
}

// 把每百万 token 价格格式化成美元字符串
function formatPrice(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

// 渲染工作模式卡片, 用于常规设置的二选一入口
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

// 渲染设置行, 左侧说明和右侧控件保持固定结构
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

// 渲染统一开关控件, 禁用态仍保留未来功能位置
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

// 渲染供应商模型折叠区, 使用原生 DOM 展开避免昂贵动画
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
          className="forge-dropdown-content forge-dropdown-fast z-50 max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[560px] overflow-auto rounded-[16px] border border-[#ececf1] bg-white p-1.5 text-sm text-[#202123] shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
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

// 渲染状态概览卡片, 用于用量页顶部指标
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

// 渲染模型或供应商维度的用量指标
function MetricTile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-3">
      <div className="text-xs text-[#6e6e80]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-[#202123]">{value}</div>
    </div>
  );
}

// 渲染价格输入框, 空值代表未知价格
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

// 生成模型输入价格字段标签
function getUsageModelInputLabel(language: Language): string {
  return language === "zh-CN" ? "模型输入单价 / 1M" : "Model input price / 1M";
}

// 生成模型输出价格字段标签
function getUsageModelOutputLabel(language: Language): string {
  return language === "zh-CN" ? "模型输出单价 / 1M" : "Model output price / 1M";
}

// 返回记忆设置文案, 后续扩展记忆类型时集中维护
function getMemorySettingsCopy(language: Language): {
  allProjects: string;
  clearAll: string;
  delete: string;
  deleteMemory: string;
  description: string;
  empty: string;
  globalScope: string;
  projectScope: string;
  title: string;
} {
  if (language === "zh-CN") {
    return {
      allProjects: "全部项目",
      clearAll: "清空记忆",
      delete: "删除",
      deleteMemory: "删除记忆",
      description: "Forge 会把匹配当前项目的记忆注入到模型上下文",
      empty: "还没有记忆, 在对话里说“记住...”即可保存到当前项目",
      globalScope: "全局",
      projectScope: "项目",
      title: "Agent 记忆"
    };
  }

  return {
    allProjects: "All projects",
    clearAll: "Clear memory",
    delete: "Delete",
    deleteMemory: "Delete memory",
    description: "Forge injects memories that match the current project into model context",
    empty: 'No memories yet. Say "remember..." in chat to save one for the current project',
    globalScope: "Global",
    projectScope: "Project",
    title: "Agent memory"
  };
}

// 返回 Agent 配置页文案, 内置配置显示也走这里
function getAgentProfilesCopy(language: Language): {
  autoReview: string;
  contextBudget: string;
  description: string;
  descriptionLabel: string;
  empty: string;
  fullAccess: string;
  instructions: string;
  name: string;
  permissionDescription: string;
  permissionMode: string;
  selectProfile: (name: string) => string;
  title: string;
  tools: string;
  toolLabel: (tool: AgentProfileTool) => string;
} {
  if (language === "zh-CN") {
    return {
      autoReview: "自动审查",
      contextBudget: "上下文预算",
      description: "配置 Forge 子 Agent 的系统提示词, 权限边界, 工具能力和上下文预算",
      descriptionLabel: "描述",
      empty: "还没有 Agent 配置",
      fullAccess: "完全访问权限",
      instructions: "Agent 指令",
      name: "名称",
      permissionDescription: "控制这个 Agent 默认用什么权限模式运行",
      permissionMode: "权限模式",
      selectProfile: (name) => `选择 ${name}`,
      title: "Agent 配置",
      tools: "工具能力",
      toolLabel: (tool) =>
        ({
          read: "读取文件",
          edit: "编辑文件",
          command: "运行命令",
          git: "Git 操作"
        })[tool]
    };
  }

  return {
    autoReview: "Auto review",
    contextBudget: "Context budget",
    description: "Configure sub-agent prompts, permissions, tools, and context budgets for Forge",
    descriptionLabel: "Description",
    empty: "No agent profiles yet",
    fullAccess: "Full access",
    instructions: "Agent instructions",
    name: "Name",
    permissionDescription: "Controls the default permission mode for this agent",
    permissionMode: "Permission mode",
    selectProfile: (name) => `Select ${name}`,
    title: "Agent profiles",
    tools: "Tool access",
    toolLabel: (tool) =>
      ({
        read: "Read files",
        edit: "Edit files",
        command: "Run commands",
        git: "Git operations"
      })[tool]
  };
}

// 返回常规设置页文案, 中英文 UI 只维护一份结构
function getGeneralSettingsCopy(language: Language): {
  agentRuntime: string;
  agentRuntimeDescription: string;
  appBackground: string;
  appBackgroundDescription: string;
  autoReview: string;
  autoReviewDescription: string;
  autoRunSafeActions: string;
  autoRunSafeActionsDescription: string;
  backgroundOpacity: string;
  backgroundOpacityDescription: string;
  blankWorkspace: string;
  codeMode: string;
  codeModeDescription: string;
  clearBackground: string;
  addCommandRule: string;
  commandRuleAllow: string;
  commandRuleAsk: string;
  commandRuleDeny: string;
  commandRuleLevel: string;
  commandRuleLevelLabel: string;
  commandRulePattern: string;
  commandRuleReason: string;
  commandRulesDescription: string;
  commandRulesEmpty: string;
  commandRulesTitle: string;
  commandTimeout: string;
  commandTimeoutDescription: string;
  commandTimeoutUnit: string;
  composerSubmitShortcut: string;
  composerSubmitShortcutDescription: string;
  deleteCommandRule: string;
  dailyMode: string;
  dailyModeDescription: string;
  defaultOpenTarget: string;
  defaultOpenTargetDescription: string;
  fullAccess: string;
  fullAccessDescription: string;
  languageDescription: string;
  inputRunDescription: string;
  inputRunTitle: string;
  outputDescription: string;
  outputTitle: string;
  showProcessedSummary: string;
  showProcessedSummaryDescription: string;
  expandProcessedSummary: string;
  expandProcessedSummaryDescription: string;
  permissionsDescription: string;
  permissionsTitle: string;
  readOnly: string;
  readOnlyDescription: string;
  recentProject: string;
  telemetry: string;
  telemetryDescription: string;
  terminalShell: string;
  terminalShellDescription: string;
  submitWithCtrlEnter: string;
  submitWithEnter: string;
  uploadBackground: string;
  wallpaperImage: string;
  wallpaperImageDescription: string;
  windowsNative: string;
  workModeDescription: string;
  workModeTitle: string;
} {
  if (language === "zh-CN") {
    return {
      addCommandRule: "添加命令规则",
      commandRuleAllow: "允许",
      commandRuleAsk: "询问",
      commandRuleDeny: "拒绝",
      commandRuleLevel: "命令规则级别",
      commandRuleLevelLabel: "级别",
      commandRulePattern: "命令规则模式",
      commandRuleReason: "命令规则原因",
      commandRulesDescription: "按模式覆盖非破坏性命令的允许, 询问或拒绝策略",
      commandRulesEmpty: "还没有自定义命令规则",
      commandRulesTitle: "命令规则",
      commandTimeout: "命令超时",
      commandTimeoutDescription: "运行命令超过这个时间会自动终止, 避免 Agent 看起来卡死",
      commandTimeoutUnit: "秒",
      composerSubmitShortcut: "发送快捷键",
      composerSubmitShortcutDescription: "控制输入框何时提交任务, 另一种按键保留换行",
      deleteCommandRule: "删除命令规则",
      agentRuntime: "智能体环境",
      agentRuntimeDescription: "选择智能体在 Windows 上的运行位置",
      appBackground: "软件背景",
      appBackgroundDescription: "上传一张壁纸作为 Forge 的背景, 默认保持轻微透明避免影响阅读",
      autoReview: "自动审核",
      autoReviewDescription: "运行前自动审查潜在高风险操作",
      autoRunSafeActions: "自动运行安全步骤",
      autoRunSafeActionsDescription: "生成计划后自动推进读取, 搜索和允许的命令, 遇到审查或风险门禁仍会停下",
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
      fullAccess: "完全访问权限",
      fullAccessDescription: "允许请求额外文件和联网命令, 生产操作仍需谨慎",
      languageDescription: "应用 UI 语言",
      inputRunDescription: "调整输入框和命令执行的默认行为",
      inputRunTitle: "输入与运行",
      outputDescription: "控制主对话区如何呈现 Agent 的内部执行反馈",
      outputTitle: "输出体验",
      showProcessedSummary: "显示“已处理”摘要",
      showProcessedSummaryDescription: "把读取文件, 命令和 Agent 事件折叠到一行轻量反馈里",
      expandProcessedSummary: "默认展开已处理详情",
      expandProcessedSummaryDescription: "进入线程时直接展开最近内部步骤, 适合调试 Agent 稳定性",
      permissionsDescription: "控制智能体默认能做什么, 高风险操作仍会保留明确反馈",
      permissionsTitle: "权限",
      readOnly: "只读模式",
      readOnlyDescription: "只允许读取项目和回答问题, 不生成修改, 不运行命令",
      recentProject: "最近项目",
      telemetry: "诊断信息",
      telemetryDescription: "本地保留基础诊断开关, 默认关闭",
      terminalShell: "集成终端 Shell",
      terminalShellDescription: "选择要在集成终端中打开的 Shell",
      submitWithCtrlEnter: "Ctrl Enter 发送",
      submitWithEnter: "Enter 发送",
      uploadBackground: "上传背景图",
      wallpaperImage: "背景图片",
      wallpaperImageDescription: "选择本机图片作为软件背景",
      windowsNative: "Windows 原生",
      workModeDescription: "选择 Forge 默认显示多少技术细节",
      workModeTitle: "工作模式"
    };
  }

  return {
    addCommandRule: "Add command rule",
    commandRuleAllow: "Allow",
    commandRuleAsk: "Ask",
    commandRuleDeny: "Deny",
    commandRuleLevel: "Command rule level",
    commandRuleLevelLabel: "Level",
    commandRulePattern: "Command rule pattern",
    commandRuleReason: "Command rule reason",
    commandRulesDescription: "Override allow, ask, or deny behavior for matching non-destructive commands",
    commandRulesEmpty: "No custom command rules yet",
    commandRulesTitle: "Command rules",
    commandTimeout: "Command timeout",
    commandTimeoutDescription: "Stop commands after this many seconds so the agent cannot appear stuck",
    commandTimeoutUnit: "sec",
    composerSubmitShortcut: "Send shortcut",
    composerSubmitShortcutDescription: "Choose when the composer submits while the other key path keeps newlines",
    deleteCommandRule: "Delete command rule",
    agentRuntime: "Agent runtime",
    agentRuntimeDescription: "Choose where the agent runs on Windows",
    appBackground: "App background",
    appBackgroundDescription:
      "Upload a wallpaper for Forge. The default opacity stays subtle so code remains readable.",
    autoReview: "Auto review",
    autoReviewDescription: "Review potentially risky operations before running",
    autoRunSafeActions: "Auto-run safe steps",
    autoRunSafeActionsDescription:
      "After planning, run safe reads, searches, and allowed commands automatically while still stopping at gates",
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
    fullAccess: "Full access",
    fullAccessDescription: "Allow extra file access and network commands when needed",
    languageDescription: "Application UI language",
    inputRunDescription: "Adjust composer and command execution defaults",
    inputRunTitle: "Input and run",
    outputDescription: "Control how the main conversation presents internal agent activity",
    outputTitle: "Output experience",
    showProcessedSummary: "Show processed summary",
    showProcessedSummaryDescription: "Fold file reads, commands, and agent events into one quiet status row",
    expandProcessedSummary: "Expand processed details by default",
    expandProcessedSummaryDescription:
      "Open each thread with recent internal steps visible for agent debugging",
    permissionsDescription: "Control what the agent can do by default",
    permissionsTitle: "Permissions",
    readOnly: "Read only",
    readOnlyDescription: "Allow reading and answers only, without edits, commands, or Git actions",
    recentProject: "Recent project",
    telemetry: "Diagnostics",
    telemetryDescription: "Keep local diagnostics off by default",
    terminalShell: "Integrated terminal shell",
    terminalShellDescription: "Choose the shell opened in the integrated terminal",
    submitWithCtrlEnter: "Ctrl Enter sends",
    submitWithEnter: "Enter sends",
    uploadBackground: "Upload background image",
    wallpaperImage: "Background image",
    wallpaperImageDescription: "Choose a local image to use behind the app",
    windowsNative: "Windows native",
    workModeDescription: "Choose how much technical detail Forge shows by default",
    workModeTitle: "Work mode"
  };
}

// 生成命令安全规则 id, 避免新增行之间互相覆盖
function createCommandSafetyRuleId(): string {
  return `command-rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 格式化整数并提供中文环境下的分组展示
function formatInteger(value: number): string {
  return Math.round(value).toLocaleString();
}
