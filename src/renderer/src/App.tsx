// 本文件说明: 协调 Forge 渲染层的项目, 对话, 设置和 Agent 执行入口
import type { ReactElement } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectFileChangePreview, ProjectFilePreview, ProjectTextFile } from "@shared/fileTypes";
import type {
  AgentAttachmentContext,
  AgentImageAttachment,
  AgentProfileContext
} from "@shared/agentTypes";
import type { ProjectGitCommitResult, ProjectGitStatus } from "@shared/gitTypes";
import type { ForgeModel, ForgeProvider, Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import { createAgentActionsFromPlanSteps, type AgentAction } from "@shared/agentExecutionPlan";
import { AppShell, type WorkbenchView } from "@/components/AppShell";
import { InlineSelectMenu } from "@/components/InlineSelectMenu";
import { LazyPanelFallback } from "@/components/LazyPanelFallback";
import {
  LazyFilePreviewRenderer,
  LazySettingsPanel,
  LazyThreadWorkspace
} from "@/components/lazyWorkbenchComponents";
import { ProjectMissingNotice } from "@/components/ProjectMissingNotice";
import { ProjectFileIcon } from "@/components/ProjectFileIcon";
import { ProjectFileTree } from "@/components/ProjectFileTree";
import { SourceDiffPreview } from "@/components/SourceDiffPreview";
import type { ProviderFetchState } from "@/components/SettingsPanel";
import { TaskComposer } from "@/components/TaskComposer";
import {
  getRunnablePendingAgentActions,
  runAgentActionBatch,
  resolveMissingInspectFileFallback,
  type AgentActionRunOutcome
} from "@/agent/agentActionExecutor";
import { getBlockingFileChangePreviews } from "@/agent/agentConfirmationQueue";
import {
  createCommandFinishedEvent,
  createCommandRunId,
  createCommandStartedEvent
} from "@/agent/commandEvents";
import {
  createAutoFailureRecoverySkipEvent,
  selectAutoFailureRecoveryCandidate,
  selectAutoFailureRecoverySkipNotice
} from "@/agent/autoFailureRecovery";
import {
  createFailureFixTaskPrompt,
  findLatestCommandResultForAction
} from "@/agent/failureFixPrompt";
import {
  appendAgentActionOutcomeRecord,
  appendAgentActionRunRecord,
  appendAgentCompletionSummaryIfDone as appendAgentCompletionSummaryIfDoneToThreads,
  applyAgentActionDecisionStatus
} from "@/agent/agentActionLifecycle";
import {
  appendAgentToolResultEvent,
  useAgentToolResults,
  type AgentToolResultEventKind
} from "@/agent/agentToolResults";
import {
  createAgentAskRequestPayload,
  createAgentFileChangeRequestPayload,
  createAgentPlanRequestPayload,
  type AgentRequestRuntimeContext
} from "@/agent/agentRequestPayloads";
import {
  formatFailureFixPlanStartMessage
} from "@/agent/agentRunMessages";
import { improveAgentPlanActions } from "@/agent/agentPlanQuality";
import {
  resolveAgentRuntimeCommandDecision,
  resolveAgentRuntimePreflightDecision,
  runAgentRuntimeExecution
} from "@/agent/agentRuntimeOrchestrator";
import {
  appendSourceUrlsToAgentSummary,
  extractSourceUrlsFromText,
} from "@/agent/agentSources";
import { createContinuationPlanTaskPrompt } from "@/agent/continuationPlanPrompt";
import { createFileChangeTaskPrompt } from "@/agent/fileChangeTaskPrompt";
import {
  collectInvalidTargetRecoveryCandidates,
  formatInvalidTargetRecoveryMessage
} from "@/agent/invalidTargetRecovery";
import {
  formatGitStatus,
  formatProjectDirectoryListResultMessage,
  formatProjectFileReadResultMessage,
  formatProjectGitStatusMessage,
  formatProjectGlobResultMessage,
  formatProjectSearchResultMessage
} from "@/agent/projectToolResultMessages";
import {
  formatAgentCommandDenied,
  formatAgentCommandNeedsApproval
} from "@/i18n/agentMessages";
import { formatRemoteModelError, formatRuntimeError } from "@/i18n/runtimeErrors";
import { useI18n } from "@/i18n/useI18n";
import {
  attachFileChangePreviewSource,
  findFileChangePreviewSource,
  removeFileChangePreview,
  upsertFileChangePreview,
  type FileChangePreviewSource
} from "@/state/fileChanges";
import {
  addManualModel,
  addCustomProvider,
  createDefaultModelSettings,
  deleteCustomProvider,
  loadModelSettings,
  mergeFetchedModels,
  mergeOpenRouterReferenceModels,
  removeProviderModels,
  saveModelSettings,
  setCurrentModel,
  setIntelligence,
  setLanguage,
  setSpeed,
  updateModelEnabled,
  updateProviderBaseUrl,
  updateProviderLabel
} from "@/state/modelSettings";
import {
  createDefaultPersonalizationSettings,
  createPersonalizationPrompt,
  loadPersonalizationSettings,
  savePersonalizationSettings,
  type PersonalizationSettings
} from "@/state/personalization";
import {
  createHeroComposerPlaceholder,
  createHeroPromptSuggestions
} from "@/state/contextSuggestions";
import { useAgentRunState } from "@/state/agentRunState";
import { useComposerSignals } from "@/state/composerSignals";
import {
  addUniquePath,
  mergeProjectFileTreeDirectoryEntries,
  normalizeLazyDirectoryPath,
  removePath
} from "@/state/lazyProjectFileTree";
import { getProjectFileParentPaths, type ProjectFileTreeNode } from "@/state/projectFileTree";
import {
  addRecentProject,
  createProjectFromPath,
  loadRecentProjects,
  removeRecentProject as removeRecentProjectRecord,
  saveRecentProjects,
  toggleProjectPinned,
  type ForgeProject
} from "@/state/projects";
import {
  attachThreadAgentActions,
  attachThreadMemoryContext,
  appendThreadEvents,
  appendThreadFollowUpPrompt,
  appendCommandRunOutput,
  appendThreadPlanDelta,
  appendThreadResultDelta,
  archiveAllThreads,
  archiveProjectThreads,
  archiveThread,
  cancelThread,
  completeNextPendingAgentAction,
  createCommandApprovalEvent,
  deleteThread,
  restoreThread,
  toggleThreadPinned,
  updateThreadAgentActionFromFileChangePreview,
  updateThreadAgentActionStatus,
  type AgentActionRunRecord,
  type CommandRunResult,
  type FailureRecoveryAttemptRecord,
  type TaskThread
} from "@/state/taskThreads";
import {
  findPendingAgentCommitAction,
  formatAgentCommitMessageSuggestion,
  hasContinuableAgentActions,
  resolveVisionAttachments,
  selectThreadById,
  selectVisibleWorkspaceThreads
} from "@/state/threadSelectors";
import {
  appendUsageEvent,
  createUsageEvent,
  loadUsageEvents,
  loadUsageRates,
  mergeModelPricingRates,
  saveUsageEvents,
  saveUsageRates,
  type UsageRateMap
} from "@/state/usage";
import {
  formatCodePreview,
  getAvailableCodeFormatterModes,
  getDefaultCodeFormatterMode,
  type CodeFormatResult,
  type CodeFormatterMode
} from "@/state/codeFormatting";
import { createTaskSubmissionRoute } from "@/state/taskSubmissionRouting";
import {
  createTaskSubmissionExecution,
  type TaskSubmissionNoticeReason
} from "@/state/taskSubmissionExecution";
import {
  appendCommandSafetyRule,
  createExactCommandAllowRule,
  createDefaultGeneralPreferences,
  loadGeneralPreferences,
  saveGeneralPreferences,
  type GeneralPreferences
} from "@/state/generalPreferences";
import {
  deleteAgentMemory,
  extractAgentMemoryCandidate,
  loadAgentMemories,
  saveAgentMemories,
  upsertAgentMemory,
  type AgentMemoryEntry
} from "@/state/agentMemory";
import {
  createDefaultAgentProfiles,
  getActiveAgentProfileContext,
  loadAgentProfiles,
  saveAgentProfiles,
  selectAgentProfile,
  updateAgentProfile,
  type AgentProfile
} from "@/state/agentProfiles";
import type { TokenUsage, UsageEvent, UsageEventKind } from "@shared/usageTypes";

type ProviderKeyStatus = {
  hasKey: boolean;
  last4: string | null;
};

type FailureFixPlanOptions = Pick<
  FailureRecoveryAttemptRecord,
  "source" | "attempt" | "limit"
>;

const heroSwapAnimationMs = 900;
const heroSwapIdleMs = 1500;
const fileTreeDirectoryEntryLimit = 2000;

function selectInitialProjectFromPreferences(
  projects: ForgeProject[],
  storage: Storage | null
): ForgeProject | null {
  if (!storage) {
    return projects[0] ?? null;
  }

  const preferences = loadGeneralPreferences(storage);

  return preferences.defaultOpenTarget === "blank" ? null : (projects[0] ?? null);
}

function createTextFilePreview(file: ProjectTextFile): ProjectFilePreview {
  return {
    ...file,
    kind: "text",
    mediaType: "text/plain; charset=utf-8"
  };
}

export function App(): ReactElement {
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") {
      return createDefaultModelSettings();
    }

    return loadModelSettings(window.localStorage);
  });
  const [keyStatuses, setKeyStatuses] = useState<Record<string, ProviderKeyStatus>>({});
  const [recentProjects, setRecentProjects] = useState<ForgeProject[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    return loadRecentProjects(window.localStorage);
  });
  const [currentProject, setCurrentProject] = useState<ForgeProject | null>(() =>
    selectInitialProjectFromPreferences(
      recentProjects,
      typeof window === "undefined" ? null : window.localStorage
    )
  );
  const [projectScanResult, setProjectScanResult] = useState<ProjectScanResult | null>(null);
  const [previewFile, setPreviewFile] = useState<ProjectTextFile | null>(null);
  const [filePreview, setFilePreview] = useState<ProjectFilePreview | null>(null);
  const [expandedFileTreeFolders, setExpandedFileTreeFolders] = useState<string[]>([]);
  const [lazyFileTreeNodes, setLazyFileTreeNodes] = useState<ProjectFileTreeNode[]>([]);
  const [loadedFileTreeFolders, setLoadedFileTreeFolders] = useState<string[]>([]);
  const [loadingFileTreeFolders, setLoadingFileTreeFolders] = useState<string[]>([]);
  const [truncatedFileTreeFolders, setTruncatedFileTreeFolders] = useState<string[]>([]);
  const [fileTreeDirectoryNextOffsets, setFileTreeDirectoryNextOffsets] = useState<Record<string, number>>({});
  const [fileTreeNotice, setFileTreeNotice] = useState<string | null>(null);
  const [fileFormatterMode, setFileFormatterMode] = useState<CodeFormatterMode>("raw");
  const [formattedPreview, setFormattedPreview] = useState<CodeFormatResult | null>(null);
  const [missingProjectPath, setMissingProjectPath] = useState<string | null>(null);
  const [changePreviews, setChangePreviews] = useState<ProjectFileChangePreview[]>([]);
  const [gitStatus, setGitStatus] = useState<ProjectGitStatus | null>(null);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitBranch, setCommitBranch] = useState("");
  const [createCommitBranch, setCreateCommitBranch] = useState(false);
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [gitRemote, setGitRemote] = useState("origin");
  const [threads, setThreads] = useState<TaskThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [providerFetchStates, setProviderFetchStates] = useState<Record<string, ProviderFetchState>>({});
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    return loadUsageEvents(window.localStorage);
  });
  const [usageRates, setUsageRates] = useState<UsageRateMap>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    return loadUsageRates(window.localStorage);
  });
  const [personalization, setPersonalization] = useState<PersonalizationSettings>(() => {
    if (typeof window === "undefined") {
      return createDefaultPersonalizationSettings();
    }

    return loadPersonalizationSettings(window.localStorage);
  });
  const [generalPreferences, setGeneralPreferences] = useState<GeneralPreferences>(() => {
    if (typeof window === "undefined") {
      return createDefaultGeneralPreferences();
    }

    return loadGeneralPreferences(window.localStorage);
  });
  const [agentMemories, setAgentMemories] = useState<AgentMemoryEntry[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    return loadAgentMemories(window.localStorage);
  });
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    return loadAgentProfiles(window.localStorage);
  });
  const {
    focusSignal: composerFocusSignal,
    submitSignal: composerSubmitSignal,
    focusComposer,
    submitComposer
  } = useComposerSignals();
  const [activeView, setActiveView] = useState<WorkbenchView>("workspace");
  const [heroPromptIndex, setHeroPromptIndex] = useState(0);
  const {
    cancelledThreadIdsRef,
    clearPausedAgentThread,
    clearPausedAgentThreads,
    clearReservedAgentActions,
    hasReservedAgentAction,
    markThreadCancelled,
    pauseAgentThread,
    pausedThreadIds,
    reserveAgentActionBatch
  } = useAgentRunState();
  const { t } = useI18n(settings.language);
  const threadsRef = useRef<TaskThread[]>(threads);
  const activePlanStreamRequestIdsRef = useRef<Map<string, string>>(new Map());
  const activeAskStreamRequestIdsRef = useRef<Map<string, string>>(new Map());
  const activeAutoFailureFixKeysRef = useRef<Set<string>>(new Set());
  const autoFailureFixAttemptedKeysRef = useRef<Set<string>>(new Set());
  const autoFailureFixCountsRef = useRef<Map<string, number>>(new Map());
  const currentProjectPathRef = useRef<string | null>(currentProject?.path ?? null);
  const {
    clearAgentToolResults,
    getRecentAgentToolResults,
    rememberAgentToolResult
  } = useAgentToolResults();
  threadsRef.current = threads;
  currentProjectPathRef.current = currentProject?.path ?? null;
  const currentProjectMissing =
    Boolean(currentProject) && missingProjectPath === currentProject?.path;
  const heroSuggestionInput = {
    language: settings.language,
    contextSuggestionsEnabled: personalization.contextSuggestionsEnabled,
    projectName: currentProject?.name ?? null,
    indexedFileCount: projectScanResult?.files.length ?? 0,
    changedFileCount: gitStatus?.changedFiles.length ?? 0,
    pendingChangeCount: changePreviews.length,
    hasRunningThread: threads.some((thread) => !thread.archived && thread.status === "running"),
    hasBlockedThread: threads.some((thread) => !thread.archived && thread.status === "blocked"),
    missingProject: currentProjectMissing
  };
  const activeHeroPrompts = createHeroPromptSuggestions(heroSuggestionInput);
  const activeHeroPrompt =
    activeHeroPrompts[heroPromptIndex % activeHeroPrompts.length] ?? activeHeroPrompts[0];
  const expandedFileTreeFolderSet = useMemo(
    () => new Set(expandedFileTreeFolders),
    [expandedFileTreeFolders]
  );
  const loadedFileTreeFolderSet = useMemo(
    () => new Set(loadedFileTreeFolders),
    [loadedFileTreeFolders]
  );
  const loadingFileTreeFolderSet = useMemo(
    () => new Set(loadingFileTreeFolders),
    [loadingFileTreeFolders]
  );
  const truncatedFileTreeFolderSet = useMemo(
    () => new Set(truncatedFileTreeFolders),
    [truncatedFileTreeFolders]
  );
  const hasMoreFileTreeFolderSet = useMemo(
    () => new Set(Object.keys(fileTreeDirectoryNextOffsets)),
    [fileTreeDirectoryNextOffsets]
  );
  const heroComposerPlaceholder = createHeroComposerPlaceholder(
    heroSuggestionInput,
    t("composer.heroPlaceholder")
  );
  const activeAgentProfileContext = applyGeneralPreferencesToAgentProfile(
    getActiveAgentProfileContext(agentProfiles, settings.language),
    generalPreferences
  );
  const fullAccessMode =
    !generalPreferences.readOnly &&
    (generalPreferences.fullAccess || activeAgentProfileContext.permissionMode === "full");

  function getLiveThread(threadId: string): TaskThread | null {
    return selectThreadById(threadsRef.current, threadId);
  }

  function getLiveAgentAction(threadId: string, actionId: string): AgentAction | null {
    return getLiveThread(threadId)?.agentActions?.find((action) => action.id === actionId) ?? null;
  }

  function getThreadAgentProfileContext(threadId: string): AgentProfileContext {
    return getLiveThread(threadId)?.agentProfile ?? activeAgentProfileContext;
  }

  function getThreadFullAccessMode(threadId: string): boolean {
    const agentProfile = getThreadAgentProfileContext(threadId);

    return !generalPreferences.readOnly &&
      (generalPreferences.fullAccess || agentProfile.permissionMode === "full");
  }

  function getThreadAutoRunBatchSize(threadId: string): number {
    return Math.min(
      generalPreferences.autoRunBatchSize,
      getThreadAgentProfileContext(threadId).autoRunBatchSize
    );
  }

  function getThreadFailureRecoveryLimit(threadId: string): number {
    return Math.max(0, getThreadAgentProfileContext(threadId).maxFailureRecoveryAttempts);
  }

  function createAgentRequestRuntimeContext({
    threadId,
    model,
    provider,
    intelligence,
    speed
  }: {
    threadId: string;
    model: ForgeModel;
    provider: ForgeProvider;
    intelligence: AgentRequestRuntimeContext["intelligence"];
    speed: AgentRequestRuntimeContext["speed"];
  }): AgentRequestRuntimeContext {
    // 所有 Agent 模型请求都从这里读取实时设置和线程 profile, 避免 plan/ask/edit 三处各自拼接后漂移。
    return {
      provider,
      model,
      intelligence,
      agentProfile: getThreadAgentProfileContext(threadId),
      personalization,
      speed,
      workMode: generalPreferences.workMode,
      agentRuntime: generalPreferences.agentRuntime,
      language: settings.language
    };
  }

  useEffect(() => {
    saveModelSettings(window.localStorage, settings);
  }, [settings]);

  useEffect(() => {
    saveRecentProjects(window.localStorage, recentProjects);
  }, [recentProjects]);

  useEffect(() => {
    saveUsageEvents(window.localStorage, usageEvents);
  }, [usageEvents]);

  useEffect(() => {
    saveUsageRates(window.localStorage, usageRates);
  }, [usageRates]);

  useEffect(() => {
    savePersonalizationSettings(window.localStorage, personalization);
  }, [personalization]);

  useEffect(() => {
    saveGeneralPreferences(window.localStorage, generalPreferences);
  }, [generalPreferences]);

  useEffect(() => {
    saveAgentMemories(window.localStorage, agentMemories);
  }, [agentMemories]);

  useEffect(() => {
    saveAgentProfiles(window.localStorage, agentProfiles);
  }, [agentProfiles]);

  useEffect(() => {
    let disposed = false;

    void window.forge.models
      .refreshOpenRouterCatalog()
      .then((models) => {
        if (disposed || models.length === 0) {
          return;
        }

        setUsageRates((current) => mergeModelPricingRates(current, models));
        setSettings((current) => mergeOpenRouterReferenceModels(current, models));
      })
      .catch(() => {
        // OpenRouter 参考目录是静默增强, 启动失败不打扰用户主流程
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    return window.forge.commands.onOutput((chunk) => {
      setThreads((current) => appendCommandRunOutput(current, chunk));
    });
  }, []);

  useEffect(() => {
    if (!generalPreferences.autoRunSafeActions) {
      return;
    }

    const blockingChangePreviews = getBlockingFileChangePreviews(changePreviews, {
      isFullAccessThread: getThreadFullAccessMode
    });

    if (blockingChangePreviews.length > 0) {
      return;
    }

    const nextThread = threads.find((thread) => {
      if (thread.archived || cancelledThreadIdsRef.current.has(thread.id)) {
        return false;
      }

      const runnableActions = getRunnablePendingAgentActions(thread.agentActions ?? [], {
        fullAccess: getThreadFullAccessMode(thread.id),
        rules: generalPreferences.commandSafetyRules
      });
      const runnableBatch = runnableActions.slice(0, getThreadAutoRunBatchSize(thread.id));

      return runnableBatch.length > 0 && !hasReservedAgentAction(thread.id, runnableBatch);
    });

    if (!nextThread) {
      return;
    }

    const runnableActions = getRunnablePendingAgentActions(nextThread.agentActions ?? [], {
      fullAccess: getThreadFullAccessMode(nextThread.id),
      rules: generalPreferences.commandSafetyRules
    });
    const runnableActionBatch = runnableActions.slice(0, getThreadAutoRunBatchSize(nextThread.id));
    void runAgentActions(nextThread.id, runnableActionBatch);
  }, [
    changePreviews,
    fullAccessMode,
    generalPreferences.autoRunBatchSize,
    generalPreferences.autoRunSafeActions,
    generalPreferences.commandSafetyRules,
    threads
  ]);

  useEffect(() => {
    if (!currentProject || !projectScanResult) {
      return;
    }

    const blockingChangePreviews = getBlockingFileChangePreviews(changePreviews, {
      isFullAccessThread: getThreadFullAccessMode
    });

    if (blockingChangePreviews.length > 0) {
      return;
    }

    const candidate = selectAutoFailureRecoveryCandidate({
      threads,
      currentProjectPath: currentProject.path,
      cancelledThreadIds: cancelledThreadIdsRef.current,
      activeKeys: activeAutoFailureFixKeysRef.current,
      attemptedKeys: autoFailureFixAttemptedKeysRef.current,
      countsByThreadId: autoFailureFixCountsRef.current,
      getThreadFailureRecoveryLimit
    });

    if (!candidate) {
      const skipNotice = selectAutoFailureRecoverySkipNotice({
        threads,
        currentProjectPath: currentProject.path,
        cancelledThreadIds: cancelledThreadIdsRef.current
      });

      if (skipNotice) {
        const createdAt = new Date().toISOString();
        const event = createAutoFailureRecoverySkipEvent({
          threadId: skipNotice.thread.id,
          action: skipNotice.failedAction,
          decision: skipNotice.decision,
          language: settings.language,
          createdAt
        });

        setThreads((current) =>
          current.map((thread) => {
            if (
              thread.id !== skipNotice.thread.id ||
              thread.events.some((threadEvent) => threadEvent.id === event.id)
            ) {
              return thread;
            }

            return {
              ...thread,
              events: [...thread.events, event]
            };
          })
        );
      }

      return;
    }

    activeAutoFailureFixKeysRef.current.add(candidate.key);
    autoFailureFixAttemptedKeysRef.current.add(candidate.key);
    autoFailureFixCountsRef.current.set(candidate.thread.id, candidate.attempt);
    void generateFailureFixPlan(candidate.thread.id, candidate.failedAction, null, {
      source: "auto",
      attempt: candidate.attempt,
      limit: candidate.limit
    }).finally(() => {
      activeAutoFailureFixKeysRef.current.delete(candidate.key);
    });
  }, [
    changePreviews,
    currentProject,
    projectScanResult,
    settings.language,
    threads
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHeroPromptIndex((current) => (current + 1) % activeHeroPrompts.length);
    }, heroSwapAnimationMs + heroSwapIdleMs);

    return () => window.clearTimeout(timeoutId);
  }, [activeHeroPrompts.length, heroPromptIndex]);

  useEffect(() => {
    if (!currentProject) {
      setProjectScanResult(null);
      setPreviewFile(null);
      setFilePreview(null);
      setExpandedFileTreeFolders([]);
      setFormattedPreview(null);
      setMissingProjectPath(null);
      setChangePreviews([]);
      setGitStatus(null);
      setSelectedGitPath(null);
      setGitNotice(null);
      return;
    }

    void scanProject(currentProject.path).then((projectExists) => {
      if (projectExists) {
        void refreshProjectGitStatus(currentProject.path);
      }
    });
  }, [currentProject]);

  useEffect(() => {
    let isActive = true;

    if (!previewFile) {
      setFormattedPreview(null);
      return () => {
        isActive = false;
      };
    }

    void formatCodePreview(previewFile.relativePath, previewFile.content, fileFormatterMode).then(
      (result) => {
        if (isActive) {
          setFormattedPreview(result);
        }
      }
    );

    return () => {
      isActive = false;
    };
  }, [fileFormatterMode, previewFile]);

  useEffect(() => {
    const changes = gitStatus?.changes ?? [];

    if (changes.length === 0) {
      setSelectedGitPath(null);
      return;
    }

    if (!selectedGitPath || !changes.some((change) => change.path === selectedGitPath)) {
      setSelectedGitPath(changes[0].path);
    }
  }, [gitStatus, selectedGitPath]);

  useEffect(() => {
    setCommitBranch(gitStatus?.currentBranch ?? "");
    setCreateCommitBranch(false);
    setGitRemote(gitStatus?.remotes[0] ?? "origin");
  }, [currentProject?.path, gitStatus?.currentBranch, gitStatus?.remotes]);

  useEffect(() => {
    for (const provider of settings.providers) {
      void refreshProviderKeyStatus(provider.id);
    }
  }, [settings.providers]);

  // 刷新某个供应商的密钥状态, 用 last4 给设置页做安全提示
  async function refreshProviderKeyStatus(providerId: string): Promise<void> {
    const status = await window.forge.secrets.getProviderKeyStatus(providerId);
    setKeyStatuses((current) => ({ ...current, [providerId]: status }));
  }

  // 保存 API Key 后立刻刷新状态, 避免设置页展示旧的配置结果
  async function saveProviderKey(providerId: string, apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      return;
    }

    await window.forge.secrets.saveProviderKey(providerId, apiKey.trim());
    await refreshProviderKeyStatus(providerId);
  }

  // 删除供应商密钥并同步清空本地状态提示
  async function deleteProviderKey(providerId: string): Promise<void> {
    await window.forge.secrets.deleteProviderKey(providerId);
    setSettings((current) => removeProviderModels(current, providerId));
    await refreshProviderKeyStatus(providerId);
  }

  // 隐私清理入口: 主进程密钥与渲染层本地状态一起重置, 但不触碰用户项目文件
  async function clearAllLocalData(): Promise<void> {
    const activePlanRequestIds = [...activePlanStreamRequestIdsRef.current.values()];
    const activeAskRequestIds = [...activeAskStreamRequestIdsRef.current.values()];

    for (const thread of threadsRef.current) {
      markThreadCancelled(thread.id);
    }

    await Promise.allSettled([
      ...activePlanRequestIds.map((requestId) => window.forge.agent.cancelPlanStream(requestId)),
      ...activeAskRequestIds.map((requestId) => window.forge.agent.cancelAskStream(requestId))
    ]);
    await window.forge.secrets.clearAllProviderKeys();

    window.localStorage.clear();
    window.sessionStorage.clear();

    activePlanStreamRequestIdsRef.current.clear();
    activeAskStreamRequestIdsRef.current.clear();
    clearReservedAgentActions();
    activeAutoFailureFixKeysRef.current.clear();
    autoFailureFixAttemptedKeysRef.current.clear();
    autoFailureFixCountsRef.current.clear();
    clearAgentToolResults();

    setSettings(createDefaultModelSettings());
    setKeyStatuses({});
    setRecentProjects([]);
    setCurrentProject(null);
    setProjectScanResult(null);
    setPreviewFile(null);
    setFilePreview(null);
    setExpandedFileTreeFolders([]);
    resetLazyProjectFileTree();
    setFileFormatterMode("raw");
    setFormattedPreview(null);
    setMissingProjectPath(null);
    setChangePreviews([]);
    setGitStatus(null);
    setSelectedGitPath(null);
    setGitNotice(null);
    setCommitMessage("");
    setCommitBranch("");
    setCreateCommitBranch(false);
    setPushAfterCommit(false);
    setGitRemote("origin");
    threadsRef.current = [];
    setThreads([]);
    setSelectedThreadId(null);
    setTaskNotice(null);
    setProviderFetchStates({});
    setUsageEvents([]);
    setUsageRates({});
    setPersonalization(createDefaultPersonalizationSettings());
    setGeneralPreferences(createDefaultGeneralPreferences());
    setAgentMemories([]);
    setAgentProfiles(createDefaultAgentProfiles());
    focusComposer();
    setHeroPromptIndex(0);
    clearPausedAgentThreads();
  }

  // 先保存当前配置再拉取模型, 自定义 Base URL 和 Key 都以最新输入为准
  async function fetchModels(providerId: string, apiKey?: string): Promise<void> {
    const provider = settings.providers.find((candidate) => candidate.id === providerId);

    if (!provider) {
      return;
    }

    const trimmedApiKey = apiKey?.trim();

    setProviderFetchStates((current) => ({
      ...current,
      [providerId]: {
        status: "loading",
        message:
          trimmedApiKey && provider.requiresApiKey !== false
            ? settings.language === "zh-CN"
              ? "正在保存并拉取模型..."
              : "Saving and fetching models..."
            : settings.language === "zh-CN"
              ? "正在拉取模型..."
              : "Fetching models..."
      }
    }));

    try {
      if (trimmedApiKey && provider.requiresApiKey !== false) {
        await window.forge.secrets.saveProviderKey(providerId, trimmedApiKey);
        await refreshProviderKeyStatus(providerId);
      }

      const fetchedModels = await window.forge.models.fetchProviderModels(provider);
      setUsageRates((current) => mergeModelPricingRates(current, fetchedModels));
      setSettings((current) => mergeFetchedModels(current, fetchedModels));
      setProviderFetchStates((current) => ({
        ...current,
        [providerId]: {
          status: "success",
          message:
            settings.language === "zh-CN"
              ? `已拉取 ${fetchedModels.length} 个模型`
              : `Fetched ${fetchedModels.length} models`
        }
      }));
    } catch (error) {
      setProviderFetchStates((current) => ({
        ...current,
        [providerId]: {
          status: "error",
          message: formatRemoteModelError(settings.language, error)
        }
      }));
    }
  }

  // 把用户手动填写的模型 id 合入可选列表, 检测通过后立即选中
  async function addManualProviderModel(
    providerId: string,
    modelName: string,
    apiKey?: string
  ): Promise<void> {
    const provider = settings.providers.find((candidate) => candidate.id === providerId);
    const normalizedModelName = modelName.trim();

    if (!provider || !normalizedModelName) {
      setProviderFetchStates((current) => ({
        ...current,
        [providerId]: {
          status: "error",
          message: settings.language === "zh-CN" ? "请先填写模型 ID" : "Enter a model ID first"
        }
      }));
      return;
    }

    const trimmedApiKey = apiKey?.trim();
    const manualModel: ForgeModel = {
      id: `${provider.id}:${normalizedModelName}`,
      providerId: provider.id,
      label: normalizedModelName,
      modelName: normalizedModelName,
      enabled: true,
      capabilities: {
        reasoning: { type: "none" },
        toolCalling: "unknown",
        streaming: "unknown",
        vision: "unknown"
      },
      capabilitySource: "manual"
    };

    setProviderFetchStates((current) => ({
      ...current,
      [providerId]: {
        status: "loading",
        message: settings.language === "zh-CN" ? "正在验证模型..." : "Validating model..."
      }
    }));

    try {
      if (trimmedApiKey && provider.requiresApiKey !== false) {
        await window.forge.secrets.saveProviderKey(providerId, trimmedApiKey);
        await refreshProviderKeyStatus(providerId);
      }

      await window.forge.agent.generateAsk({
        provider,
        model: manualModel,
        intelligence: settings.intelligence,
        personalization: createPersonalizationPrompt(personalization),
        speed: settings.speed,
        prompt: "Reply with OK."
      });
      setSettings((current) => addManualModel(current, providerId, normalizedModelName));
      setProviderFetchStates((current) => ({
        ...current,
        [providerId]: {
          status: "success",
          message: settings.language === "zh-CN" ? "模型已验证并保存" : "Model verified and saved"
        }
      }));
    } catch (error) {
      const message = formatRemoteModelError(settings.language, error);

      setProviderFetchStates((current) => ({
        ...current,
        [providerId]: {
          status: "error",
          message:
            settings.language === "zh-CN"
              ? `模型不可用: ${message}`
              : `Model is not usable: ${message}`
        }
      }));
    }
  }

  // 切换界面语言并持久化, 不影响模型和项目状态
  function setInterfaceLanguage(language: Language): void {
    setSettings((current) => setLanguage(current, language));
  }

  // 通过系统目录选择器加入项目, 成功后切换到工作台
  async function pickProject(): Promise<void> {
    const projectPath = await window.forge.projects.pickDirectory();

    if (!projectPath) {
      return;
    }

    const project = createProjectFromPath(projectPath);
    setMissingProjectPath(null);
    currentProjectPathRef.current = project.path;
    setCurrentProject(project);
    setRecentProjects((current) => addRecentProject(current, project));
    setActiveView("workspace");
  }

  // 选中侧边栏项目并刷新缺失提示, 不在这里做昂贵扫描
  function selectProject(projectPath: string): void {
    const project = recentProjects.find((candidate) => candidate.path === projectPath);

    if (!project) {
      return;
    }

    setMissingProjectPath(null);
    currentProjectPathRef.current = project.path;
    setCurrentProject(project);
    setRecentProjects((current) => addRecentProject(current, { ...project, openedAt: new Date().toISOString() }));
    setSelectedThreadId(
      threads.find((thread) => !thread.archived && thread.projectPath === projectPath)?.id ?? null
    );
    setActiveView("workspace");
  }

  // 移除最近项目记录, 当前项目被移除时自动选择下一个项目
  function removeProjectRecord(projectPath: string): void {
    setRecentProjects((current) => removeRecentProjectRecord(current, projectPath));

    if (currentProject?.path === projectPath) {
      setMissingProjectPath(null);
      currentProjectPathRef.current = null;
      setCurrentProject(null);
    }
  }

  // 切换项目置顶状态并同步当前项目引用
  function togglePinnedProject(projectPath: string): void {
    setRecentProjects((current) => {
      const nextProjects = toggleProjectPinned(current, projectPath);
      const updatedProject = nextProjects.find((project) => project.path === projectPath);

      if (updatedProject) {
        setCurrentProject((currentProjectValue) =>
          currentProjectValue?.path === projectPath ? updatedProject : currentProjectValue
        );
      }

      return nextProjects;
    });
  }

  // 归档指定项目的全部会话, 用于项目更多菜单的清理动作
  function archiveProjectConversations(projectPath: string): void {
    setThreads((current) => archiveProjectThreads(current, projectPath));
  }

  // 创建永久 Git worktree 并把新目录加入最近项目
  async function createProjectWorktree(projectPath: string): Promise<void> {
    const project = recentProjects.find((candidate) => candidate.path === projectPath);
    const worktreeName = window.prompt(
      settings.language === "zh-CN" ? "输入工作树名称" : "Enter worktree name",
      "agent-worktree"
    );

    if (!worktreeName?.trim()) {
      return;
    }

    setTaskNotice(
      settings.language === "zh-CN"
        ? `正在为 ${project?.name ?? projectPath} 创建 Git worktree...`
        : `Creating Git worktree for ${project?.name ?? projectPath}...`
    );

    try {
      const result = await window.forge.git.createWorktree({
        projectRoot: projectPath,
        name: worktreeName
      });
      const nextProject = createProjectFromPath(result.path);

      setMissingProjectPath(null);
      setCurrentProject(nextProject);
      setRecentProjects((current) => addRecentProject(current, nextProject));
      setSelectedThreadId(null);
      setActiveView("workspace");
      setTaskNotice(
        settings.language === "zh-CN"
          ? `已创建 Git worktree：${result.path}（分支 ${result.branch}）`
          : `Created Git worktree: ${result.path} (branch ${result.branch})`
      );
    } catch (error) {
      setTaskNotice(formatRuntimeError(settings.language, error));
    }
  }

  // 重命名最近项目展示名, 原始路径保持不变
  function renameProject(projectPath: string): void {
    const project = recentProjects.find((candidate) => candidate.path === projectPath);

    if (!project) {
      return;
    }

    const nextName = window.prompt(
      settings.language === "zh-CN" ? "输入新的项目名称" : "Enter a new project name",
      project.name
    );

    if (!nextName?.trim()) {
      return;
    }

    const normalizedName = makeUniqueProjectName(nextName.trim(), recentProjects, projectPath);
    setRecentProjects((current) =>
      current.map((candidate) =>
        candidate.path === projectPath ? { ...candidate, name: normalizedName } : candidate
      )
    );
    setCurrentProject((current) =>
      current?.path === projectPath ? { ...current, name: normalizedName } : current
    );
  }

  // 启动后优先恢复最近项目, 项目不存在时给出可处理提示
  function openMostRecentProject(): void {
    const recentProject = recentProjects[0];

    if (!recentProject) {
      void pickProject();
      return;
    }

    currentProjectPathRef.current = recentProject.path;
    setCurrentProject(recentProject);
    setMissingProjectPath(null);
    setActiveView("workspace");
  }

  // 读取项目文件索引, 供文件页和 Agent 上下文共用
  function resetLazyProjectFileTree(): void {
    setLazyFileTreeNodes([]);
    setLoadedFileTreeFolders([]);
    setLoadingFileTreeFolders([]);
    setTruncatedFileTreeFolders([]);
    setFileTreeDirectoryNextOffsets({});
    setFileTreeNotice(null);
  }

  async function loadProjectFileTreeDirectory(
    projectPath: string,
    relativePath = ".",
    options: { append?: boolean; force?: boolean } = {}
  ): Promise<void> {
    const normalizedRelativePath = normalizeLazyDirectoryPath(relativePath);
    const nextOffset = fileTreeDirectoryNextOffsets[normalizedRelativePath];

    if (
      loadingFileTreeFolderSet.has(normalizedRelativePath) ||
      (!options.force &&
        !options.append &&
        loadedFileTreeFolderSet.has(normalizedRelativePath))
    ) {
      return;
    }

    if (options.append && typeof nextOffset !== "number") {
      return;
    }

    setLoadingFileTreeFolders((current) => addUniquePath(current, normalizedRelativePath));
    setFileTreeNotice(null);

    try {
      const result = await window.forge.files.listDirectory({
        includeGitIgnored: true,
        projectRoot: projectPath,
        relativePath: normalizedRelativePath,
        limit: fileTreeDirectoryEntryLimit,
        offset: options.append ? nextOffset : 0
      });

      if (currentProjectPathRef.current !== projectPath) {
        return;
      }

      setLazyFileTreeNodes((current) =>
        mergeProjectFileTreeDirectoryEntries(current, normalizedRelativePath, result.entries, {
          append: options.append
        })
      );
      setLoadedFileTreeFolders((current) => addUniquePath(current, normalizedRelativePath));
      setTruncatedFileTreeFolders((current) =>
        result.truncated
          ? addUniquePath(current, normalizedRelativePath)
          : removePath(current, normalizedRelativePath)
      );
      setFileTreeDirectoryNextOffsets((current) => {
        const updatedOffsets = { ...current };

        if (typeof result.nextOffset === "number") {
          updatedOffsets[normalizedRelativePath] = result.nextOffset;
        } else {
          delete updatedOffsets[normalizedRelativePath];
        }

        return updatedOffsets;
      });
    } catch (error) {
      if (currentProjectPathRef.current === projectPath) {
        setFileTreeNotice(formatRuntimeError(settings.language, error));
      }
    } finally {
      setLoadingFileTreeFolders((current) => removePath(current, normalizedRelativePath));
    }
  }

  function toggleProjectFileTreeFolder(relativePath: string): void {
    const normalizedRelativePath = normalizeLazyDirectoryPath(relativePath);
    const willExpand = !expandedFileTreeFolderSet.has(normalizedRelativePath);

    setExpandedFileTreeFolders((current) =>
      current.includes(normalizedRelativePath)
        ? current.filter((path) => path !== normalizedRelativePath)
        : [...current, normalizedRelativePath]
    );

    if (willExpand && currentProject && !loadedFileTreeFolderSet.has(normalizedRelativePath)) {
      void loadProjectFileTreeDirectory(currentProject.path, normalizedRelativePath);
    }
  }

  function loadMoreProjectFileTreeDirectory(relativePath: string): void {
    if (!currentProject) {
      return;
    }

    void loadProjectFileTreeDirectory(currentProject.path, relativePath, { append: true });
  }

  async function loadProjectFileTreeParents(projectPath: string, relativePath: string): Promise<void> {
    const parentPaths = getProjectFileParentPaths(relativePath);

    setExpandedFileTreeFolders((current) => [
      ...new Set([...current, ...parentPaths])
    ]);

    for (const parentPath of [".", ...parentPaths]) {
      await loadProjectFileTreeDirectory(projectPath, parentPath);
    }
  }

  async function scanProject(projectPath: string): Promise<boolean> {
    try {
      const result = await window.forge.projects.scan(projectPath);
      setProjectScanResult(result);
      setPreviewFile(null);
      setFilePreview(null);
      setExpandedFileTreeFolders([]);
      setFormattedPreview(null);
      setMissingProjectPath(null);
      setChangePreviews([]);
      resetLazyProjectFileTree();
      void loadProjectFileTreeDirectory(projectPath, ".", { force: true });
      return true;
    } catch (error) {
      setProjectScanResult(null);
      setPreviewFile(null);
      setFilePreview(null);
      setExpandedFileTreeFolders([]);
      setFormattedPreview(null);
      setChangePreviews([]);
      setGitStatus(null);
      resetLazyProjectFileTree();

      if (isMissingProjectError(error)) {
        setMissingProjectPath(projectPath);
        setTaskNotice(null);
        return false;
      }

      setTaskNotice(formatRuntimeError(settings.language, error));
      return false;
    }
  }

  // 刷新当前项目 Git 状态, 同时保留用户当前选择的文件
  async function refreshProjectGitStatus(projectPath = currentProject?.path): Promise<void> {
    if (!projectPath) {
      return;
    }

    try {
      const status = await window.forge.git.status({ projectRoot: projectPath });
      setGitStatus(status);
      setGitNotice(null);
    } catch (error) {
      setGitNotice(formatRuntimeError(settings.language, error));
    }
  }

  // 使用用户填写的消息提交当前项目, 成功后重刷 Git 状态
  async function createProjectCommit(
    normalizedMessage: string
  ): Promise<{
    result: ProjectGitCommitResult;
    targetBranch: string | undefined;
    targetRemote: string;
  }> {
    if (!currentProject) {
      throw new Error(t("projects.required"));
    }

    const targetBranch =
      commitBranch.trim() || gitStatus?.currentBranch || gitStatus?.branches[0] || undefined;
    const targetRemote = gitRemote.trim() || "origin";
    const result = await window.forge.git.commit({
      projectRoot: currentProject.path,
      message: normalizedMessage,
      branch: targetBranch,
      createBranch: createCommitBranch,
      push: pushAfterCommit,
      remote: targetRemote
    });

    return { result, targetBranch, targetRemote };
  }

  function applyProjectCommitResult({
    result,
    targetBranch,
    targetRemote
  }: {
    result: ProjectGitCommitResult;
    targetBranch: string | undefined;
    targetRemote: string;
  }): void {
    setGitStatus(result.status);
    setCommitMessage("");
    setGitNotice(
      createGitOperationNotice(settings.language, {
        type: pushAfterCommit ? "commit-push" : "commit",
        branch: result.branch ?? targetBranch ?? null,
        remote: targetRemote
      })
    );
  }

  async function commitCurrentProject(message: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    const normalizedMessage = message.trim();
    const selectedThread = selectThreadById(threads, selectedThreadId);
    const pendingCommitAction = findPendingAgentCommitAction(selectedThread);

    if (!normalizedMessage) {
      setGitNotice(t("projects.commitMessageRequired"));
      return;
    }

    try {
      const commitResult = await createProjectCommit(normalizedMessage);
      applyProjectCommitResult(commitResult);
      if (selectedThreadId && pendingCommitAction) {
        const createdAt = new Date().toISOString();

        setThreads((current) =>
          completeNextPendingAgentAction(
            appendThreadEvents(current, selectedThreadId, [
              {
                id: `${selectedThreadId}-agent-commit-${pendingCommitAction.id}-${createdAt}`,
                kind: "plan",
                message:
                  settings.language === "zh-CN"
                    ? `已完成 Agent 提交动作: ${normalizedMessage}`
                    : `Completed agent commit action: ${normalizedMessage}`,
                createdAt
              }
            ]),
            selectedThreadId,
            "commit"
          )
        );
      }
    } catch (error) {
      setGitNotice(formatRuntimeError(settings.language, error));
    }
  }

  // 按路径读取项目文件并生成可阅读预览
  async function pushCurrentProjectBranch(): Promise<void> {
    if (!currentProject || !gitStatus?.isRepo) {
      return;
    }

    const targetBranch =
      commitBranch.trim() || gitStatus.currentBranch || gitStatus.branches[0] || undefined;
    const targetRemote = gitRemote.trim() || "origin";

    try {
      const result = await window.forge.git.push({
        projectRoot: currentProject.path,
        branch: targetBranch,
        remote: targetRemote
      });
      setGitStatus(result.status);
      setGitNotice(
        createGitOperationNotice(settings.language, {
          type: "push",
          branch: result.branch,
          remote: result.remote
        })
      );
    } catch (error) {
      setGitNotice(formatRuntimeError(settings.language, error));
    }
  }

  async function previewProjectFile(relativePath: string): Promise<ProjectTextFile | null> {
    if (!currentProject) {
      return null;
    }

    if (currentProjectMissing) {
      setTaskNotice(
        settings.language === "zh-CN"
          ? "当前项目路径不存在, 请重新选择项目后再预览文件。"
          : "The current project path no longer exists. Pick the project again before previewing files."
      );
      return null;
    }

    void loadProjectFileTreeParents(currentProject.path, relativePath);

    const projectFilePreview = await window.forge.files.preview({
      projectRoot: currentProject.path,
      relativePath
    });
    setFilePreview(projectFilePreview);

    if (projectFilePreview.kind !== "text") {
      setPreviewFile(null);
      setFormattedPreview(null);
      setFileFormatterMode("raw");
      return null;
    }

    const file: ProjectTextFile = {
      relativePath: projectFilePreview.relativePath,
      content: projectFilePreview.content,
      size: projectFilePreview.size
    };

    setPreviewFile(file);
    setFileFormatterMode(getDefaultCodeFormatterMode(file.relativePath));

    return file;
  }

  // 展示待应用文件变更的 diff, 让用户先审查再落盘
  async function previewProjectFileChange(relativePath: string, nextContent: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    const source = findFileChangePreviewSource(changePreviews, relativePath);
    const preview = await window.forge.files.previewTextUpdate({
      projectRoot: currentProject.path,
      relativePath,
      nextContent
    });
    setChangePreviews((current) =>
      upsertFileChangePreview(current, attachFileChangePreviewSource(preview, source))
    );
  }

  // 应用单个文件变更并更新待审查列表
  async function applyProjectFileChange(relativePath: string, nextContent: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    const pendingPreview = changePreviews.find((preview) => preview.relativePath === relativePath);
    const file = await window.forge.files.writeText({
      projectRoot: currentProject.path,
      relativePath,
      nextContent
    });
    setPreviewFile(file);
    setFilePreview(createTextFilePreview(file));
    setChangePreviews((current) => removeFileChangePreview(current, relativePath));
    void refreshProjectGitStatus();

    const eventThreadId = pendingPreview?.source?.threadId ?? selectedThreadId;

    if (!eventThreadId) {
      return;
    }

    const createdAt = new Date().toISOString();
    setThreads((current) => {
      const withEvent = appendThreadEvents(current, eventThreadId, [
        {
          id: `${eventThreadId}-file-write-${createdAt}`,
          kind: "file",
          message: `已应用文件修改: ${file.relativePath}`,
          createdAt,
          fileChange: pendingPreview
            ? {
                relativePath: pendingPreview.relativePath,
                changeKind: pendingPreview.changeKind
              }
            : undefined
        }
      ]);

      return updateThreadAgentActionFromFileChangePreview(withEvent, pendingPreview, "completed");
    });
  }

  // 丢弃单个待审查变更, 不触碰真实项目文件
  function discardProjectFileChange(relativePath: string): void {
    const pendingPreview = changePreviews.find((preview) => preview.relativePath === relativePath);

    setChangePreviews((current) => removeFileChangePreview(current, relativePath));

    const eventThreadId = pendingPreview?.source?.threadId ?? selectedThreadId;

    if (!eventThreadId) {
      return;
    }

    const actionBacked = Boolean(pendingPreview?.source?.actionId);
    const createdAt = new Date().toISOString();
    setThreads((current) => {
      const withEvent = appendThreadEvents(
        current,
        eventThreadId,
        [
          {
            id: `${eventThreadId}-file-discard-${createdAt}`,
            kind: actionBacked ? "error" : "file",
            message:
              settings.language === "zh-CN"
                ? actionBacked
                  ? `已丢弃文件修改, Agent 已暂停: ${relativePath}`
                  : `已丢弃文件修改 ${relativePath}`
                : actionBacked
                  ? `Discarded file change, Agent paused: ${relativePath}`
                  : `Discarded file change ${relativePath}`,
            createdAt
          }
        ],
        actionBacked ? "blocked" : undefined
      );

      return updateThreadAgentActionFromFileChangePreview(withEvent, pendingPreview, "failed");
    });
  }

  // 按顺序应用全部变更, 任一失败都停下并提示用户
  // 删除项目内文件并记录结构化 delete 事件, 让最终总结区分真实删除和空写入
  async function deleteProjectFile(relativePath: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        settings.language === "zh-CN"
          ? `确认删除 ${relativePath}？此操作会修改项目文件。`
          : `Delete ${relativePath}? This will modify project files.`
      );

    if (!confirmed) {
      return;
    }

    try {
      const result = await window.forge.files.delete({
        projectRoot: currentProject.path,
        relativePath
      });
      const nextScan = await window.forge.projects.scan(currentProject.path);
      const createdAt = new Date().toISOString();

      setProjectScanResult(nextScan);
      setPreviewFile((current) => (current?.relativePath === result.relativePath ? null : current));
      setFilePreview((current) => (current?.relativePath === result.relativePath ? null : current));
      setFormattedPreview(null);
      setChangePreviews((current) => removeFileChangePreview(current, result.relativePath));
      void refreshProjectGitStatus();

      if (!selectedThreadId) {
        return;
      }

      setThreads((current) =>
        appendThreadEvents(current, selectedThreadId, [
          {
            id: `${selectedThreadId}-file-delete-${createdAt}`,
            kind: "file",
            message:
              settings.language === "zh-CN"
                ? `已删除文件: ${result.relativePath}`
                : `Deleted file: ${result.relativePath}`,
            createdAt,
            fileChange: {
              relativePath: result.relativePath,
              changeKind: "delete"
            }
          }
        ])
      );
    } catch (error) {
      setTaskNotice(formatRuntimeError(settings.language, error));
    }
  }

  async function applyAllProjectFileChanges(): Promise<void> {
    if (!currentProject || changePreviews.length === 0) {
      return;
    }

    const appliedPreviews = [...changePreviews];
    let nextPreviewFile: ProjectTextFile | null = null;

    for (const preview of appliedPreviews) {
      const writtenFile = await window.forge.files.writeText({
        projectRoot: currentProject.path,
        relativePath: preview.relativePath,
        nextContent: preview.nextContent
      });

      if (previewFile?.relativePath === writtenFile.relativePath) {
        nextPreviewFile = writtenFile;
      }
    }

    if (nextPreviewFile) {
      setPreviewFile(nextPreviewFile);
      setFilePreview(createTextFilePreview(nextPreviewFile));
    }

    setChangePreviews([]);
    void refreshProjectGitStatus();

    for (const preview of appliedPreviews) {
      if (!preview.source?.threadId) {
        continue;
      }

      const previewSource = preview.source;
      const createdAt = new Date().toISOString();
      setThreads((current) => {
        const withEvent = appendThreadEvents(current, previewSource.threadId, [
          {
            id: `${previewSource.threadId}-file-write-${preview.relativePath}-${createdAt}`,
            kind: "file",
            message:
              settings.language === "zh-CN"
                ? `已应用文件修改: ${preview.relativePath}`
                : `Applied file change: ${preview.relativePath}`,
            createdAt,
            fileChange: {
              relativePath: preview.relativePath,
              changeKind: preview.changeKind
            }
          }
        ]);

        return updateThreadAgentActionFromFileChangePreview(withEvent, preview, "completed");
      });
    }

    const manualAppliedCount = appliedPreviews.filter((preview) => !preview.source?.threadId).length;

    if (!selectedThreadId || manualAppliedCount === 0) {
      return;
    }

    const createdAt = new Date().toISOString();
    setThreads((current) =>
      appendThreadEvents(current, selectedThreadId, [
        {
          id: `${selectedThreadId}-file-write-all-${createdAt}`,
          kind: "file",
          message: `已应用 ${manualAppliedCount} 个文件修改`,
          createdAt
        }
      ])
    );
  }

  // 清空全部待审查变更, 用于用户决定重做方案
  function discardAllProjectFileChanges(): void {
    const discardedPreviews = [...changePreviews];

    setChangePreviews([]);

    for (const preview of discardedPreviews) {
      if (!preview.source?.threadId) {
        continue;
      }

      const previewSource = preview.source;
      const createdAt = new Date().toISOString();
      setThreads((current) => {
        const withEvent = appendThreadEvents(
          current,
          previewSource.threadId,
          [
            {
              id: `${previewSource.threadId}-file-discard-${preview.relativePath}-${createdAt}`,
              kind: "error",
              message:
                settings.language === "zh-CN"
                  ? `已丢弃文件修改, Agent 已暂停: ${preview.relativePath}`
                  : `Discarded file change, Agent paused: ${preview.relativePath}`,
              createdAt
            }
          ],
          "blocked"
        );

        return updateThreadAgentActionFromFileChangePreview(withEvent, preview, "failed");
      });
    }
  }

  // 调用模型生成单文件修改预览, 结果只进入审查队列
  async function generateProjectFileChange(
    relativePath: string,
    currentContent: string,
    threadId?: string,
    options: {
      action?: AgentAction | null;
      autoApply?: boolean;
      source?: FileChangePreviewSource | null;
    } = {}
  ): Promise<boolean | undefined> {
    if (!currentProject) {
      return false;
    }

    const targetThreadId = threadId ?? selectedThreadId ?? undefined;
    const selectedThread =
      selectThreadById(threads, targetThreadId) ??
      threads[0] ??
      null;

    if (!selectedThread) {
      return false;
    }

    const model = settings.models.find((candidate) => candidate.id === selectedThread.modelId);
    const provider = model
      ? settings.providers.find((candidate) => candidate.id === model.providerId)
      : null;

    if (!model || !provider) {
      appendThreadError(selectedThread.id, "未找到当前模型或提供商配置");
      return;
    }

    const startedAt = new Date().toISOString();
    setThreads((current) =>
      appendThreadEvents(current, selectedThread.id, [
        {
          id: `${selectedThread.id}-agent-file-started-${startedAt}`,
          kind: "file",
          message: `正在让模型生成文件修改: ${relativePath}`,
          createdAt: startedAt
        }
      ])
    );

    try {
      const fileChangeTaskPrompt = createFileChangeTaskPrompt(
        selectedThread,
        relativePath,
        options.action,
        {
          toolResults: getRecentAgentToolResults(selectedThread.id)
        }
      );
      const { request, memories } = createAgentFileChangeRequestPayload({
        runtime: createAgentRequestRuntimeContext({
          threadId: selectedThread.id,
          model,
          provider,
          intelligence: selectedThread.intelligence,
          speed: selectedThread.speed
        }),
        agentMemories,
        memoryQuery: `${selectedThread.prompt} ${options.action?.label ?? ""} ${relativePath} ${currentContent.slice(0, 1200)}`,
        taskPrompt: fileChangeTaskPrompt,
        attachmentContexts: selectedThread.attachmentContexts,
        attachments: selectedThread.attachments,
        projectRoot: currentProject.path,
        projectScan: projectScanResult,
        relativePath,
        currentContent
      });

      setThreads((current) => attachThreadMemoryContext(current, selectedThread.id, memories));

      const result = await window.forge.agent.generateFileChange(request);
      const preview = await window.forge.files.previewTextUpdate({
        projectRoot: currentProject.path,
        relativePath,
        nextContent: result.nextContent
      });
      const sourcedPreview = attachFileChangePreviewSource(
        preview,
        options.source ?? { threadId: selectedThread.id }
      );

      recordUsageEvent({
        kind: "file-change",
        providerId: result.providerId,
        modelId: result.modelId,
        usage: result.usage,
        createdAt: result.createdAt
      });

      if (options.autoApply) {
        const writtenFile = await window.forge.files.writeText({
          projectRoot: currentProject.path,
          relativePath: sourcedPreview.relativePath,
          nextContent: sourcedPreview.nextContent
        });

        setPreviewFile(writtenFile);
        setFilePreview(createTextFilePreview(writtenFile));
        setChangePreviews((current) => removeFileChangePreview(current, sourcedPreview.relativePath));
        void refreshProjectGitStatus();
        setThreads((current) =>
          appendThreadEvents(current, selectedThread.id, [
            {
              id: `${selectedThread.id}-agent-file-applied-${result.createdAt}`,
              kind: "file",
              message: `已自动应用文件修改: ${writtenFile.relativePath}`,
              createdAt: result.createdAt,
              fileChange: {
                relativePath: sourcedPreview.relativePath,
                changeKind: sourcedPreview.changeKind
              }
            }
          ])
        );
        return true;
      }

      setChangePreviews((current) => upsertFileChangePreview(current, sourcedPreview));
      setThreads((current) =>
        appendThreadEvents(current, selectedThread.id, [
          {
            id: `${selectedThread.id}-agent-file-${result.createdAt}`,
            kind: "file",
            message: `已生成文件修改建议: ${relativePath}`,
            createdAt: result.createdAt
          }
        ])
      );
      return true;
    } catch (error) {
      appendThreadError(
        selectedThread.id,
        `模型文件修改失败: ${formatRemoteModelError(settings.language, error)}`
      );
      return false;
    }
  }

  // 针对用户选中文件逐个请求修改, 避免一次改动过大
  async function generateSelectedProjectFileChanges(relativePaths: string[]): Promise<void> {
    if (!currentProject) {
      return;
    }

    for (const relativePath of relativePaths) {
      const file = await window.forge.files.readText({
        projectRoot: currentProject.path,
        relativePath
      });

      await generateProjectFileChange(file.relativePath, file.content);
    }
  }

  // 创建或续写会话, 普通问答和项目任务统一进入同一线程
  function submitTask(
    prompt: string,
    attachments?: AgentImageAttachment[],
    attachmentContexts?: AgentAttachmentContext[]
  ): void {
    const activeThread = selectThreadById(threads, selectedThreadId);
    const submittedAttachments = resolveVisionAttachments(
      settings.models.find((model) => model.id === settings.currentModelId) ?? null,
      attachments
    );
    const route = createTaskSubmissionRoute({
      activeThread,
      agentProfile: activeAgentProfileContext,
      attachments: submittedAttachments,
      attachmentContexts,
      currentProjectPath: currentProject?.path ?? null,
      hasProjectScan: Boolean(projectScanResult),
      prompt,
      settings
    });

    const execution = createTaskSubmissionExecution({
      route,
      prompt,
      settings,
      submittedAttachments,
      currentProjectPath: currentProject?.path ?? null,
      projectScan: projectScanResult
    });

    if (execution.kind === "notice") {
      setTaskNotice(getTaskSubmissionNoticeMessage(execution.reason));
      return;
    }

    setTaskNotice(null);
    clearPausedAgentThread(execution.clearPausedThreadId);

    const threadMutation = execution.threadMutation;

    if (threadMutation.kind === "append-follow-up") {
      setThreads((current) =>
        appendThreadFollowUpPrompt(current, threadMutation.threadId, threadMutation.event)
      );
    } else {
      setThreads((current) => [threadMutation.thread, ...current]);

      if (threadMutation.selectThread) {
        setSelectedThreadId(threadMutation.thread.id);
      }
    }

    if (execution.remember) {
      rememberPromptIfNeeded(
        execution.remember.threadId,
        execution.remember.prompt,
        execution.remember.projectPath
      );
    }

    if (execution.modelExecution.kind === "missing-model") {
      appendThreadError(execution.modelExecution.threadId, "未找到当前模型或提供商配置");
      return;
    }

    if (execution.modelExecution.kind === "ask") {
      void generateAskResponse(execution.modelExecution);
      return;
    }

    void generateThreadPlan(execution.modelExecution);
  }

  function getTaskSubmissionNoticeMessage(reason: TaskSubmissionNoticeReason): string {
    switch (reason) {
      case "empty-prompt":
        return t("composer.emptyPrompt");
      case "missing-model":
        return t("composer.missingModel");
      case "project-required":
        return t("projects.required");
      case "project-scanning":
        return t("projects.scanning");
    }
  }

  // 为线程请求 Agent 计划, 生成动作队列前先注入当前记忆
  async function generateThreadPlan({
    threadId,
    taskPrompt,
    model,
    provider,
    attachments,
    attachmentContexts,
    projectScan
  }: {
    threadId: string;
    taskPrompt: string;
    model: ForgeModel;
    provider: ForgeProvider;
    attachments?: AgentImageAttachment[];
    attachmentContexts?: AgentAttachmentContext[];
    projectScan: ProjectScanResult;
  }): Promise<void> {
    const streamStartedAt = new Date().toISOString();
    const streamEventId = `${threadId}-plan-stream-${Date.now()}`;
    let unsubscribeStream: (() => void) | null = null;

    try {
      const { request, memories } = createAgentPlanRequestPayload({
        runtime: createAgentRequestRuntimeContext({
          threadId,
          model,
          provider,
          intelligence: settings.intelligence,
          speed: settings.speed
        }),
        agentMemories,
        taskPrompt,
        attachmentContexts,
        attachments,
        projectScan
      });
      let receivedDelta = false;

      setThreads((current) => attachThreadMemoryContext(current, threadId, memories));
      activePlanStreamRequestIdsRef.current.set(threadId, streamEventId);
      setThreads((current) =>
        appendThreadPlanDelta(current, threadId, {
          eventId: streamEventId,
          createdAt: streamStartedAt,
          delta:
            settings.language === "zh-CN"
              ? "Forge 正在准备执行计划..."
              : "Forge is preparing an execution plan...",
          done: false
        })
      );
      unsubscribeStream = window.forge.agent.onPlanStreamChunk((chunk) => {
        if (chunk.requestId !== streamEventId || chunk.type !== "delta") {
          return;
        }

        const replacePlaceholder = !receivedDelta;
        receivedDelta = true;
        setThreads((current) =>
          appendThreadPlanDelta(current, threadId, {
            eventId: streamEventId,
            createdAt: streamStartedAt,
            delta: chunk.delta,
            done: false,
            replace: replacePlaceholder
          })
        );
      });
      const plan = await window.forge.agent.generatePlanStream(streamEventId, request);
      unsubscribeStream();
      unsubscribeStream = null;

      if (cancelledThreadIdsRef.current.has(threadId)) {
        return;
      }

      setThreads((current) =>
        appendThreadPlanDelta(current, threadId, {
          eventId: streamEventId,
          createdAt: streamStartedAt,
          completedAt: plan.createdAt,
          delta: receivedDelta ? "" : plan.text,
          done: true,
          finalText: plan.text
        })
      );

      recordUsageEvent({
        kind: "plan",
        providerId: plan.providerId,
        modelId: plan.modelId,
        usage: plan.usage,
        createdAt: plan.createdAt
      });
      const planQuality = improveAgentPlanActions({
        actions: createAgentActionsFromPlanSteps(plan.steps ?? []),
        language: settings.language,
        projectScan,
        prompt: getLiveThread(threadId)?.prompt ?? taskPrompt
      });
      const agentActions = planQuality.actions;
      const runnableAgentActions = getRunnablePendingAgentActions(agentActions, {
        fullAccess: getThreadFullAccessMode(threadId),
        rules: generalPreferences.commandSafetyRules
      });
      const planMessage =
        runnableAgentActions.length > 0
          ? generalPreferences.autoRunSafeActions
            ? settings.language === "zh-CN"
              ? "已生成执行计划, Forge 正在准备自动执行安全步骤。"
              : "Execution plan created. Forge will auto-run safe steps."
            : settings.language === "zh-CN"
              ? "已生成执行计划, 等你确认继续运行安全步骤。"
              : "Execution plan created. Continue when you want Forge to run safe steps."
          : agentActions.length > 0
            ? settings.language === "zh-CN"
              ? "已生成执行计划, 但下一步需要你先确认。"
              : "Execution plan created, but the next step needs your review."
          : settings.language === "zh-CN"
            ? "已生成执行计划, 但没有可执行步骤。"
            : "Execution plan created, but no executable steps were found.";
      const planEvents = [
        {
          id: `${threadId}-plan-ready-${plan.createdAt}`,
          kind: "plan" as const,
          message: planMessage,
          createdAt: plan.createdAt
        },
        ...planQuality.notices.map((message, index) => ({
          id: `${threadId}-plan-quality-${index + 1}-${plan.createdAt}`,
          kind: "plan" as const,
          message,
          createdAt: plan.createdAt
        })),
        ...(agentActions.length === 0
          ? [
              {
                id: `${threadId}-plan-empty-summary-${plan.createdAt}`,
                kind: "result" as const,
                message: appendSourceUrlsToAgentSummary(
                  settings.language === "zh-CN"
                    ? "已完成分析, 但没有生成可执行步骤。具体模型输出已折叠在“已处理”里。"
                    : "Analysis finished, but no executable steps were generated. Model output is folded into Processed.",
                  extractSourceUrlsFromText(plan.text),
                  settings.language
                ),
                createdAt: plan.createdAt,
                completedAt: plan.createdAt
              }
            ]
          : [])
      ];
      setThreads((current) =>
        attachThreadAgentActions(
          appendThreadEvents(
            current,
            threadId,
            planEvents,
            runnableAgentActions.length > 0
              ? "planned"
              : agentActions.length > 0
                ? "blocked"
                : "completed"
          ),
          threadId,
          agentActions
        )
      );
    } catch (error) {
      if (cancelledThreadIdsRef.current.has(threadId)) {
        return;
      }

      appendThreadError(
        threadId,
        `模型计划生成失败: ${formatRemoteModelError(settings.language, error)}`
      );
    } finally {
      unsubscribeStream?.();
      activePlanStreamRequestIdsRef.current.delete(threadId);
    }
  }

  // 基于失败结果生成修复计划, 把错误上下文重新喂给模型
  async function generateFailureFixPlan(
    threadId: string,
    action: AgentAction,
    commandResultOverride: CommandRunResult | null = null,
    options: FailureFixPlanOptions = { source: "manual" }
  ): Promise<void> {
    const thread = selectThreadById(threads, threadId);

    if (!thread) {
      return;
    }

    if (!currentProject || !projectScanResult) {
      setTaskNotice(t("projects.required"));
      appendThreadError(
        threadId,
        settings.language === "zh-CN"
          ? "需要先打开并索引项目, 才能根据失败动作生成修复计划"
          : "Open and scan a project before generating a fix plan for a failed action."
      );
      return;
    }

    const model = settings.models.find((candidate) => candidate.id === thread.modelId);
    const provider = model
      ? settings.providers.find((candidate) => candidate.id === model.providerId)
      : null;

    if (!model || !provider) {
      appendThreadError(
        threadId,
        settings.language === "zh-CN"
          ? "未找到当前模型或提供商配置"
          : "Current model or provider configuration was not found."
      );
      return;
    }

    const createdAt = new Date().toISOString();
    const failureRecoveryAttempt: FailureRecoveryAttemptRecord = {
      actionId: action.id,
      label: action.label,
      source: options.source,
      ...(options.attempt === undefined ? {} : { attempt: options.attempt }),
      ...(options.limit === undefined ? {} : { limit: options.limit })
    };
    setTaskNotice(null);
    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [
          {
            id: `${threadId}-failure-fix-${action.id}-${createdAt}`,
            kind: "plan",
            message: formatFailureFixPlanStartMessage(
              settings.language,
              action,
              failureRecoveryAttempt
            ),
            createdAt,
            failureRecoveryAttempt
          }
        ],
        "running"
      )
    );

    await generateThreadPlan({
      threadId,
      taskPrompt: createFailureFixTaskPrompt(
        thread,
        action,
        commandResultOverride ?? findLatestCommandResultForAction(thread.events, action)
      ),
      model,
      provider,
      attachments: resolveVisionAttachments(model, thread.attachments),
      attachmentContexts: thread.attachmentContexts,
      projectScan: projectScanResult
    });
  }

  // 为失败命令生成修复动作, 让恢复循环沿用同一个线程
  async function generateCommandFixPlan(
    threadId: string,
    result: CommandRunResult
  ): Promise<void> {
    const action: AgentAction = {
      id: `command-history-${Date.now()}`,
      stepId: "command-history",
      kind: "run-command",
      label: `Run ${result.command}`,
      status: result.exitCode === 0 && !result.timedOut ? "completed" : "failed",
      command: result.command
    };

    await generateFailureFixPlan(threadId, action, result);
  }

  // 基于当前线程真实状态生成后续计划, 用于完成或跳过一批动作后的长任务续跑
  async function generateContinuationPlan(threadId: string): Promise<void> {
    const thread = selectThreadById(threads, threadId);

    if (!thread) {
      return;
    }

    if (!currentProject || !projectScanResult) {
      setTaskNotice(t("projects.required"));
      appendThreadError(
        threadId,
        settings.language === "zh-CN"
          ? "需要先打开并索引项目, 才能基于当前状态生成后续计划"
          : "Open and scan a project before generating a continuation plan."
      );
      return;
    }

    const model = settings.models.find((candidate) => candidate.id === thread.modelId);
    const provider = model
      ? settings.providers.find((candidate) => candidate.id === model.providerId)
      : null;

    if (!model || !provider) {
      appendThreadError(
        threadId,
        settings.language === "zh-CN"
          ? "未找到当前模型或提供商配置"
          : "Current model or provider configuration was not found."
      );
      return;
    }

    const createdAt = new Date().toISOString();
    setTaskNotice(null);
    clearPausedAgentThread(threadId);
    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [
          {
            id: `${threadId}-continuation-plan-${createdAt}`,
            kind: "plan",
            message:
              settings.language === "zh-CN"
                ? "正在基于当前线程状态生成后续计划"
                : "Generating a continuation plan from current thread state",
            createdAt
          }
        ],
        "running"
      )
    );

    await generateThreadPlan({
      threadId,
      taskPrompt: createContinuationPlanTaskPrompt(thread),
      model,
      provider,
      attachments: resolveVisionAttachments(model, thread.attachments),
      attachmentContexts: thread.attachmentContexts,
      projectScan: projectScanResult
    });
  }

  // 解析线程项目路径, 优先使用线程快照避免当前项目切换造成串线
  function getThreadProjectPath(threadId: string): string | null {
    const thread = selectThreadById(threads, threadId);

    return thread?.projectPath ?? currentProject?.path ?? null;
  }

  // 用户显式要求记住时写入长期记忆, 普通消息不保存
  function rememberPromptIfNeeded(
    threadId: string,
    prompt: string,
    projectPath: string | null
  ): void {
    const candidate = extractAgentMemoryCandidate(prompt, projectPath ?? getThreadProjectPath(threadId));

    if (!candidate) {
      return;
    }

    setAgentMemories((current) =>
      upsertAgentMemory(current, {
        ...candidate,
        sourceThreadId: threadId
      })
    );
  }

  // 为同一线程生成流式回答, 记忆和个性化提示在这里统一注入
  async function generateAskResponse({
    threadId,
    prompt,
    model,
    provider,
    attachments,
    attachmentContexts,
    projectScan,
    conversation
  }: {
    threadId: string;
    prompt: string;
    model: ForgeModel;
    provider: ForgeProvider;
    attachments?: AgentImageAttachment[];
    attachmentContexts?: AgentAttachmentContext[];
    projectScan?: ProjectScanResult | null;
    conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<void> {
    const { request, memories } = createAgentAskRequestPayload({
      runtime: createAgentRequestRuntimeContext({
        threadId,
        model,
        provider,
        intelligence: settings.intelligence,
        speed: settings.speed
      }),
      agentMemories,
      prompt,
      attachmentContexts,
      attachments,
      projectScan,
      conversation
    });
    const streamStartedAt = new Date().toISOString();
    const streamEventId = `${threadId}-ask-stream-${Date.now()}`;
    let unsubscribeStream: (() => void) | null = null;

    try {
      let receivedDelta = false;
      setThreads((current) => attachThreadMemoryContext(current, threadId, memories));
      activeAskStreamRequestIdsRef.current.set(threadId, streamEventId);
      unsubscribeStream = window.forge.agent.onAskStreamChunk((chunk) => {
        if (chunk.requestId !== streamEventId || chunk.type !== "delta") {
          return;
        }

        receivedDelta = true;
        setThreads((current) =>
          appendThreadResultDelta(current, threadId, {
            eventId: streamEventId,
            createdAt: streamStartedAt,
            delta: chunk.delta,
            done: false
          })
        );
      });
      const answer = await window.forge.agent.generateAskStream(streamEventId, request);
      unsubscribeStream();
      unsubscribeStream = null;

      if (cancelledThreadIdsRef.current.has(threadId)) {
        return;
      }

      recordUsageEvent({
        kind: "ask",
        providerId: answer.providerId,
        modelId: answer.modelId,
        usage: answer.usage,
        createdAt: answer.createdAt
      });
      rememberPromptIfNeeded(threadId, prompt, projectScan?.rootPath ?? null);
      setThreads((current) => {
        if (receivedDelta) {
          return appendThreadResultDelta(current, threadId, {
            eventId: streamEventId,
            createdAt: streamStartedAt,
            completedAt: answer.createdAt,
            delta: "",
            done: true,
            finalText: answer.text
          });
        }

        return appendThreadResultDelta(current, threadId, {
          eventId: streamEventId,
          createdAt: streamStartedAt,
          completedAt: answer.createdAt,
          delta: answer.text,
          done: true
        });
      });
    } catch (error) {
      unsubscribeStream?.();

      if (cancelledThreadIdsRef.current.has(threadId)) {
        return;
      }

      appendThreadError(
        threadId,
        `回答失败: ${formatRemoteModelError(settings.language, error)}`
      );
    } finally {
      activeAskStreamRequestIdsRef.current.delete(threadId);
    }
  }

  // 终止当前线程的活跃请求, UI 状态和 AbortController 一起清理
  function cancelActiveThread(): void {
    if (!selectedThreadId) {
      return;
    }

    const createdAt = new Date().toISOString();
    const activePlanStreamRequestId = activePlanStreamRequestIdsRef.current.get(selectedThreadId);
    const activeAskStreamRequestId = activeAskStreamRequestIdsRef.current.get(selectedThreadId);

    if (activePlanStreamRequestId) {
      void window.forge.agent.cancelPlanStream(activePlanStreamRequestId);
    }

    if (activeAskStreamRequestId) {
      void window.forge.agent.cancelAskStream(activeAskStreamRequestId);
    }

    pauseAgentThread(selectedThreadId);
    setThreads((current) =>
      cancelThread(current, selectedThreadId, {
        createdAt,
        message: settings.language === "zh-CN" ? "已终止" : "Stopped"
      })
    );
  }

  // 恢复被 Stop 暂停的 Agent 队列, 让自动执行器重新接管后续安全动作
  function resumeAgentThread(threadId: string): void {
    const createdAt = new Date().toISOString();

    clearPausedAgentThread(threadId);
    setTaskNotice(null);
    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [
          {
            id: `${threadId}-agent-resumed-${createdAt}`,
            kind: "plan",
            message: settings.language === "zh-CN" ? "已恢复 Agent 执行" : "Agent execution resumed",
            createdAt
          }
        ],
        "planned"
      )
    );
  }

  // 把模型或工具错误压成一行中文提示, 不让错误撑坏输入区
  function appendThreadError(threadId: string, message: string): void {
    const createdAt = new Date().toISOString();

    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [
          {
            id: `${threadId}-error-${createdAt}`,
            kind: "error",
            message,
            createdAt
          }
        ],
        "blocked"
      )
    );
  }

  // 记录模型用量和耗时, 后续统计页只读取这个事件流
  function recordUsageEvent({
    kind,
    providerId,
    modelId,
    usage,
    createdAt
  }: {
    kind: UsageEventKind;
    providerId: string;
    modelId: string;
    usage?: TokenUsage;
    createdAt: string;
  }): void {
    if (!generalPreferences.telemetry || !usage) {
      return;
    }

    setUsageEvents((current) =>
      appendUsageEvent(
        current,
        createUsageEvent({
          providerId,
          modelId,
          kind,
          usage,
          createdAt
        })
      )
    );
  }

  // 更新动作状态并保持线程列表和当前选中线程一致
  function updateAgentActionStatus(
    threadId: string,
    actionId: string,
    status: AgentAction["status"]
  ): void {
    setThreads((current) => updateThreadAgentActionStatus(current, threadId, actionId, status));
  }

  // Cache controlled tool results and expose them in the thread event list.
  function recordAgentToolResultEvent(
    threadId: string,
    action: AgentAction,
    toolKind: AgentToolResultEventKind,
    message: string,
    createdAt: string
  ): void {
    rememberAgentToolResult(threadId, message);
    setThreads((current) =>
      appendAgentToolResultEvent(current, {
        threadId,
        action,
        toolKind,
        message,
        createdAt
      })
    );
  }

  // Write action-level run records so thread details can show every step.
  function appendAgentActionRunEvent(
    threadId: string,
    action: AgentAction,
    record: Omit<AgentActionRunRecord, "actionId" | "label">
  ): void {
    setThreads((current) =>
      appendAgentActionRunRecord(current, {
        threadId,
        action,
        record,
        language: settings.language
      })
    );
  }

  // 根据动作执行结果写入完成, 失败, 等待和恢复建议记录, 供 UI 和后续计划复用
  function appendAgentActionOutcomeEvent(
    threadId: string,
    action: AgentAction,
    outcome: AgentActionRunOutcome,
    startedAt: string
  ): void {
    const agentProfile = getThreadAgentProfileContext(threadId);

    setThreads((current) =>
      appendAgentActionOutcomeRecord(current, {
        threadId,
        action,
        outcome,
        startedAt,
        agentProfile,
        language: settings.language
      })
    );
  }

  // 用户确认或跳过门禁时写入时间线, 让队列推进有可审计记录
  function setAgentActionDecisionStatus(
    threadId: string,
    action: AgentAction,
    status: Extract<AgentAction["status"], "completed" | "skipped">
  ): void {
    setThreads((current) =>
      applyAgentActionDecisionStatus(current, {
        threadId,
        action,
        status,
        language: settings.language
      })
    );
  }

  // 将人工门禁标记为完成, 后续安全动作会由自动执行器继续推进
  function completeAgentAction(threadId: string, action: AgentAction): void {
    setAgentActionDecisionStatus(threadId, action, "completed");
  }

  // 跳过用户明确放弃的动作, 用于越过被阻止或已过时的队列步骤
  function skipAgentAction(threadId: string, action: AgentAction): void {
    setAgentActionDecisionStatus(threadId, action, "skipped");
  }

  function completeFullAccessManualGateAction(
    threadId: string,
    action: AgentAction,
    createdAt: string
  ): AgentActionRunOutcome {
    updateAgentActionStatus(threadId, action.id, "completed");
    setThreads((current) =>
      appendThreadEvents(current, threadId, [
        {
          id: `${threadId}-full-access-gate-${action.id}-${createdAt}`,
          kind: "plan",
          message:
            settings.language === "zh-CN"
              ? `完全访问权限已自动接管: ${action.label}`
              : `Full access handled automatically: ${action.label}`,
          createdAt
        }
      ])
    );

    return "completed";
  }

  async function commitFullAccessAgentAction(
    threadId: string,
    action: AgentAction
  ): Promise<AgentActionRunOutcome> {
    const normalizedMessage = (formatAgentCommitMessageSuggestion(action) ?? action.label).trim();

    if (!normalizedMessage) {
      const message = t("projects.commitMessageRequired");

      setTaskNotice(message);
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(threadId, message);
      return "failed";
    }

    try {
      const commitResult = await createProjectCommit(normalizedMessage);
      const createdAt = new Date().toISOString();

      applyProjectCommitResult(commitResult);
      updateAgentActionStatus(threadId, action.id, "completed");
      setThreads((current) =>
        appendThreadEvents(current, threadId, [
          {
            id: `${threadId}-full-access-commit-${action.id}-${createdAt}`,
            kind: "plan",
            message:
              settings.language === "zh-CN"
                ? `完全访问权限已自动提交: ${normalizedMessage}`
                : `Full access committed automatically: ${normalizedMessage}`,
            createdAt
          }
        ])
      );

      return "completed";
    } catch (error) {
      const message = formatRuntimeError(settings.language, error);

      setGitNotice(message);
      setTaskNotice(message);
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(threadId, message);
      return "failed";
    }
  }

  // 执行单个 Agent 动作, 失败时保留可恢复的结果说明
  async function runAgentAction(
    threadId: string,
    action: AgentAction,
    options: { approvedCommand?: boolean; skipReservation?: boolean } = {}
  ): Promise<AgentActionRunOutcome> {
    if (!options.skipReservation) {
      if (hasReservedAgentAction(threadId, [action])) {
        return { status: "running", continueBatch: false };
      }

      const releaseReservation = reserveAgentActionBatch(threadId, [action]);

      try {
        return await runAgentAction(threadId, action, {
          ...options,
          skipReservation: true
        });
      } finally {
        releaseReservation();
      }
    }

    if (cancelledThreadIdsRef.current.has(threadId)) {
      return { status: "pending", continueBatch: false };
    }

    const activeAgentProfile = getThreadAgentProfileContext(threadId);
    const threadFullAccessMode = getThreadFullAccessMode(threadId);
    const runtimeDecision = resolveAgentRuntimePreflightDecision({
      action,
      liveAction: getLiveAgentAction(threadId, action.id),
      agentProfile: activeAgentProfile
    });

    if (runtimeDecision.kind === "reuse-status") {
      return runtimeDecision.outcome;
    }

    const actionToRun = runtimeDecision.action;

    if (runtimeDecision.kind === "permission-denied") {
      const createdAt = new Date().toISOString();
      const message = formatAgentPermissionDenied(
        settings.language,
        activeAgentProfile.name,
        runtimeDecision.permission.tool
      );

      updateAgentActionStatus(threadId, actionToRun.id, "failed");
      setTaskNotice(message);
      setThreads((current) =>
        appendThreadEvents(current, threadId, [
          {
            id: `${threadId}-permission-denied-${actionToRun.id}-${createdAt}`,
            kind: "error",
            message,
            createdAt
          }
        ], "blocked")
      );
      return "failed";
    }

    if (runtimeDecision.kind === "manual-gate") {
      const createdAt = new Date().toISOString();

      if (threadFullAccessMode) {
        appendAgentActionRunEvent(threadId, actionToRun, { status: "started", startedAt: createdAt });
        updateAgentActionStatus(threadId, actionToRun.id, "running");
        const outcome =
          runtimeDecision.execution.reason === "commit"
            ? await commitFullAccessAgentAction(threadId, actionToRun)
            : completeFullAccessManualGateAction(threadId, actionToRun, createdAt);

        appendAgentActionOutcomeEvent(threadId, actionToRun, outcome, createdAt);
        window.setTimeout(() => appendAgentCompletionSummaryIfDone(threadId), 0);
        return outcome;
      }

      setTaskNotice(
        settings.language === "zh-CN"
          ? "需要先完成审查门禁, Forge 不会自动越过人工确认"
          : "Manual review is required before Forge can continue."
      );
      setThreads((current) =>
        appendThreadEvents(current, threadId, [
          {
            id: `${threadId}-manual-gate-${actionToRun.id}-${createdAt}`,
            kind: "plan",
            message:
              settings.language === "zh-CN"
                ? `等待人工审查: ${actionToRun.label}`
                : `Waiting for manual review: ${actionToRun.label}`,
            createdAt
          }
        ])
      );
      return "pending";
    }

    const execution = runtimeDecision.execution;
    const startedAt = new Date().toISOString();
    appendAgentActionRunEvent(threadId, actionToRun, { status: "started", startedAt });
    updateAgentActionStatus(threadId, actionToRun.id, "running");

    let outcome: AgentActionRunOutcome;

    try {
      outcome = await runAgentRuntimeExecution({
        execution,
        commandPolicy: {
          fullAccess: threadFullAccessMode,
          rules: generalPreferences.commandSafetyRules
        },
        approvedCommand: options.approvedCommand,
        handlers: {
          openFile: (relativePath) => openAgentFileAction(threadId, actionToRun, relativePath),
          listDirectory: (relativePath) =>
            listAgentProjectDirectoryAction(threadId, actionToRun, relativePath),
          globProject: (pattern) => globAgentProjectAction(threadId, actionToRun, pattern),
          searchProject: (query) => searchAgentProjectAction(threadId, actionToRun, query),
          inspectGitStatus: () => inspectAgentGitStatusAction(threadId, actionToRun),
          generateFileChange: (relativePath) =>
            generateAgentFileChangeAction(threadId, actionToRun, relativePath),
          runCommand: (command) => runThreadCommand(threadId, command, actionToRun.id),
          blockCommandDenied: (reason) =>
            blockAgentCommandAction(
              threadId,
              actionToRun,
              formatAgentCommandDenied(
                settings.language,
                reason
              ),
              "failed"
            ),
          blockCommandApprovalRequired: (command, reason) =>
            blockAgentCommandAction(
              threadId,
              actionToRun,
              formatAgentCommandNeedsApproval(
                settings.language,
                command,
                reason
              ),
              "pending"
            ),
          blockInvalidTarget: (reason) =>
            blockAgentInvalidTargetAction(threadId, actionToRun, reason),
          completeAction: () => {
            updateAgentActionStatus(threadId, actionToRun.id, "completed");
            return "completed";
          }
        }
      });
    } catch (error) {
      updateAgentActionStatus(threadId, actionToRun.id, "failed");
      outcome = "failed";
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "agent",
          error instanceof Error ? error.message : String(error)
        )
      );
    }

    appendAgentActionOutcomeEvent(threadId, actionToRun, outcome, startedAt);
    window.setTimeout(() => appendAgentCompletionSummaryIfDone(threadId), 0);
    return outcome;
  }

  // 运行前再次校验文件/目录目标, 让旧线程里的坏 target 不会绕过新的计划解析规则
  function blockAgentInvalidTargetAction(
    threadId: string,
    action: AgentAction,
    reason: string
  ): AgentAction["status"] {
    const createdAt = new Date().toISOString();
    const candidates = collectInvalidTargetRecoveryCandidates(
      [action.label, action.target, reason].filter(Boolean).join("\n"),
      projectScanResult?.files ?? []
    );
    const message = formatInvalidTargetRecoveryMessage(settings.language, reason, candidates);

    updateAgentActionStatus(threadId, action.id, "failed");
    setTaskNotice(message);
    setThreads((current) =>
      appendThreadEvents(current, threadId, [
        {
          id: `${threadId}-invalid-action-target-${action.id}-${createdAt}`,
          kind: "error",
          message,
          createdAt
        }
      ], "blocked")
    );

    return "failed";
  }

  // 队列完成后只在正文留下简短总结, 具体执行细节继续折叠在“已处理”
  function appendAgentCompletionSummaryIfDone(threadId: string): void {
    setThreads((current) =>
      appendAgentCompletionSummaryIfDoneToThreads(current, {
        threadId,
        language: settings.language
      })
    );
  }

  // 阻止高风险命令继续执行, 并把原因写入线程时间线
  function blockAgentCommandAction(
    threadId: string,
    action: AgentAction,
    message: string,
    status: Extract<AgentAction["status"], "failed" | "pending">
  ): AgentAction["status"] {
    const createdAt = new Date().toISOString();

    updateAgentActionStatus(threadId, action.id, status);
    setTaskNotice(message);
    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [
          {
            id: `${threadId}-command-blocked-${action.id}-${createdAt}`,
            kind: status === "pending" ? "plan" : "error",
            message,
            createdAt
          }
        ],
        "blocked"
      )
    );

    return status;
  }

  // 只批准当前这一次命令动作, 不改变全局完全访问权限
  async function approveAgentCommandAction(threadId: string, action: AgentAction): Promise<void> {
    if (action.kind === "run-command" && action.command) {
      const command = action.command;
      const commandDecision = resolveAgentRuntimeCommandDecision({
        command,
        policy: {
          fullAccess: getThreadFullAccessMode(threadId),
          rules: generalPreferences.commandSafetyRules
        }
      });

      if (commandDecision.kind === "approval-required") {
        const createdAt = new Date().toISOString();

        setThreads((current) =>
          appendThreadEvents(
            current,
            threadId,
            [
              createCommandApprovalEvent({
                threadId,
                actionId: action.id,
                command,
                reason: commandDecision.risk.reason,
                createdAt
              })
            ],
            "running"
          )
        );
      }
    }

    await runAgentAction(threadId, action, { approvedCommand: true });
  }

  // 批量执行动作队列, 每一步都通过线程事件回写进度
  // 将本次命令审批沉淀成精确 allow 规则, 同时批准当前动作继续执行
  async function allowAgentCommandAction(threadId: string, action: AgentAction): Promise<void> {
    if (action.kind !== "run-command" || !action.command) {
      return;
    }

    const rule = createExactCommandAllowRule(action.command);

    if (!rule) {
      setTaskNotice(
        settings.language === "zh-CN"
          ? "该命令过长, 无法保存为精确允许规则, 已改为仅批准本次执行"
          : "This command is too long to save as an exact allow rule, so Forge approved it once."
      );
      await approveAgentCommandAction(threadId, action);
      return;
    }

    const createdAt = new Date().toISOString();
    setGeneralPreferences((current) => appendCommandSafetyRule(current, rule));
    setThreads((current) =>
      appendThreadEvents(current, threadId, [
        {
          id: `${threadId}-command-allow-rule-${action.id}-${createdAt}`,
          kind: "plan",
          message:
            settings.language === "zh-CN"
              ? `已允许后续自动运行精确命令: ${rule.pattern}`
              : `Allowed exact command for future agent runs: ${rule.pattern}`,
          createdAt
        }
      ])
    );

    await approveAgentCommandAction(threadId, action);
  }

  // 批量执行动作队列, 每一步都通过线程事件回写进度
  async function runAgentActions(threadId: string, actions: AgentAction[]): Promise<void> {
    if (actions.length === 0 || hasReservedAgentAction(threadId, actions)) {
      return;
    }

    const releaseReservation = reserveAgentActionBatch(threadId, actions);

    try {
      await runAgentActionBatch(actions, (action) => {
        if (cancelledThreadIdsRef.current.has(threadId)) {
          return { status: "pending", continueBatch: false };
        }

        return runAgentAction(threadId, action, { skipReservation: true });
      });
    } finally {
      releaseReservation();
    }
  }

  // 执行受控目录列表动作, 只返回一层目录条目和文件大小
  async function listAgentProjectDirectoryAction(
    threadId: string,
    action: AgentAction,
    relativePath: string
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, action.id, "failed");
      return "failed";
    }

    if (currentProjectMissing) {
      const message =
        settings.language === "zh-CN"
          ? "当前项目路径不存在, 请重新选择项目后再继续 Agent 任务。"
          : "The current project path no longer exists. Pick the project again before continuing the Agent task.";

      setTaskNotice(message);
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(threadId, message);
      return "failed";
    }

    try {
      const result = await window.forge.files.listDirectory({
        projectRoot: currentProject.path,
        relativePath
      });
      const createdAt = new Date().toISOString();
      const message = formatProjectDirectoryListResultMessage(settings.language, result);

      recordAgentToolResultEvent(threadId, action, "list-directory", message, createdAt);
      return "completed";
    } catch (error) {
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "file",
          error instanceof Error ? error.message : String(error)
        )
      );
      return "failed";
    }
  }

  // 执行受控 Git 状态动作, 复用主进程 Git IPC 而不是让 Agent 拼 shell
  async function inspectAgentGitStatusAction(
    threadId: string,
    action: AgentAction
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, action.id, "failed");
      return "failed";
    }

    try {
      const status = await window.forge.git.status({ projectRoot: currentProject.path });
      const createdAt = new Date().toISOString();
      const message = formatProjectGitStatusMessage(settings.language, status);

      setGitStatus(status);
      setGitNotice(null);
      recordAgentToolResultEvent(threadId, action, "git-status", message, createdAt);
      return "completed";
    } catch (error) {
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "file",
          error instanceof Error ? error.message : String(error)
        )
      );
      return "failed";
    }
  }

  // 执行受控项目 glob 动作, 只返回候选文件路径和大小
  async function globAgentProjectAction(
    threadId: string,
    action: AgentAction,
    pattern: string
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, action.id, "failed");
      return "failed";
    }

    try {
      const result = await window.forge.files.globFiles({
        projectRoot: currentProject.path,
        pattern
      });
      const createdAt = new Date().toISOString();
      const message = formatProjectGlobResultMessage(settings.language, result);

      recordAgentToolResultEvent(threadId, action, "glob", message, createdAt);
      return "completed";
    } catch (error) {
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "file",
          error instanceof Error ? error.message : String(error)
        )
      );
      return "failed";
    }
  }

  // 执行受控项目搜索动作, 不通过 shell 暴露额外能力
  async function searchAgentProjectAction(
    threadId: string,
    action: AgentAction,
    query: string
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, action.id, "failed");
      return "failed";
    }

    try {
      const result = await window.forge.files.searchText({
        projectRoot: currentProject.path,
        query,
        limit: 40
      });
      const createdAt = new Date().toISOString();
      const message = formatProjectSearchResultMessage(settings.language, result);

      recordAgentToolResultEvent(threadId, action, "search", message, createdAt);
      return "completed";
    } catch (error) {
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "file",
          error instanceof Error ? error.message : String(error)
        )
      );
      return "failed";
    }
  }

  // 执行文件修改动作时先生成预览, 用户审查后才写入磁盘
  async function generateAgentFileChangeAction(
    threadId: string,
    action: AgentAction,
    relativePath: string
  ): Promise<AgentActionRunOutcome> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, action.id, "failed");
      return "failed";
    }

    try {
      const currentSnapshot = await window.forge.files.previewTextUpdate({
        projectRoot: currentProject.path,
        relativePath,
        nextContent: ""
      });
      const file: ProjectTextFile = {
        relativePath: currentSnapshot.relativePath,
        content: currentSnapshot.currentContent,
        size: currentSnapshot.currentContent.length
      };

      setPreviewFile(file);
      setFilePreview(createTextFilePreview(file));
      setFileFormatterMode(getDefaultCodeFormatterMode(file.relativePath));
      const threadFullAccessMode = getThreadFullAccessMode(threadId);

      const generated = await generateProjectFileChange(file.relativePath, file.content, threadId, {
        action,
        autoApply: threadFullAccessMode,
        source: {
          threadId,
          actionId: action.id,
          actionLabel: action.label
        }
      });

      if (!generated) {
        updateAgentActionStatus(threadId, action.id, "failed");
        return "failed";
      }

      if (threadFullAccessMode) {
        updateAgentActionStatus(threadId, action.id, "completed");
        return "completed";
      }

      updateAgentActionStatus(threadId, action.id, "running");
      return { status: "running", continueBatch: false };
    } catch (error) {
      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "file",
          error instanceof Error ? error.message : String(error)
        )
      );
      return "failed";
    }
  }

  // 打开动作关联文件, 方便用户从计划直接跳到代码
  async function openAgentFileAction(
    threadId: string,
    action: AgentAction,
    relativePath: string
  ): Promise<AgentActionRunOutcome> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, action.id, "failed");
      return "failed";
    }

    try {
      const file = await previewProjectFile(relativePath);
      const createdAt = new Date().toISOString();
      const message = file ? formatProjectFileReadResultMessage(settings.language, file) : null;

      if (message) {
        recordAgentToolResultEvent(threadId, action, "read-file", message, createdAt);
      } else {
        updateAgentActionStatus(threadId, action.id, "completed");
      }
      return "completed";
    } catch (error) {
      const thread = getLiveThread(threadId);
      const missingInspectFallback =
        thread?.agentActions && isMissingProjectFileError(error)
          ? resolveMissingInspectFileFallback(action, thread.agentActions, thread.prompt)
          : null;

      if (missingInspectFallback === "continue-existing-edit") {
        const file = createEmptyProjectTextFile(relativePath);
        const createdAt = new Date().toISOString();

        setPreviewFile(file);
        setFilePreview(createTextFilePreview(file));
        setFileFormatterMode(getDefaultCodeFormatterMode(file.relativePath));
        updateAgentActionStatus(threadId, action.id, "completed");
        setThreads((current) =>
          appendThreadEvents(current, threadId, [
            {
              id: `${threadId}-missing-inspect-new-file-${action.id}-${createdAt}`,
              kind: "file",
              message:
                settings.language === "zh-CN"
                  ? `目标文件尚不存在, 将按新文件继续创建: ${file.relativePath}`
                  : `Target file does not exist yet; continuing as a new file: ${file.relativePath}`,
              createdAt
            }
          ])
        );
        return "completed";
      }

      if (missingInspectFallback === "generate-file-change") {
        const createdAt = new Date().toISOString();

        setThreads((current) =>
          appendThreadEvents(current, threadId, [
            {
              id: `${threadId}-missing-inspect-generate-file-${action.id}-${createdAt}`,
              kind: "file",
              message:
                settings.language === "zh-CN"
                  ? `目标文件尚不存在, 将按新文件直接生成: ${relativePath}`
                  : `Target file does not exist yet; generating it as a new file: ${relativePath}`,
              createdAt
            }
          ])
        );

        return generateAgentFileChangeAction(threadId, action, relativePath);
      }

      updateAgentActionStatus(threadId, action.id, "failed");
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "file",
          error instanceof Error ? error.message : String(error)
        )
      );
      return "failed";
    }
  }

  // 在项目目录运行命令并把实时输出绑定到线程事件
  async function runThreadCommand(
    threadId: string,
    command: string,
    actionId?: string
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      if (actionId) {
        updateAgentActionStatus(threadId, actionId, "failed");
      }
      return "failed";
    }

    setTaskNotice(null);
    const runId = createCommandRunId(threadId);
    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [createCommandStartedEvent({ threadId, command, runId, actionId })],
        "running"
      )
    );

    try {
      const result = await window.forge.commands.run({
        runId,
        projectRoot: currentProject.path,
        cwd: currentProject.path,
        command,
        timeoutMs: generalPreferences.commandTimeoutSeconds * 1000,
        runtime: generalPreferences.agentRuntime,
        shell: generalPreferences.terminalShell
      });

      const status =
        result.exitCode === 0 && !result.timedOut && !result.cancelled ? "completed" : "failed";

      if (actionId) {
        updateAgentActionStatus(threadId, actionId, status);
      }

      setThreads((current) =>
        appendThreadEvents(
          current,
          threadId,
          [createCommandFinishedEvent({ threadId, result, actionId })],
          status === "completed" ? "running" : "blocked"
        )
      );
      return status;
    } catch (error) {
      if (actionId) {
        updateAgentActionStatus(threadId, actionId, "failed");
      }
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "command",
          error instanceof Error ? error.message : String(error)
        )
      );
      return "failed";
    }
  }

  // 取消正在运行的命令, 结果事件标记为用户终止
  async function cancelThreadCommand(threadId: string, runId: string): Promise<void> {
    setTaskNotice(null);

    try {
      const result = await window.forge.commands.cancel({ runId });

      if (!result.ok) {
        appendThreadError(
          threadId,
          settings.language === "zh-CN"
            ? "命令取消失败: 该命令可能已经结束"
            : "Command cancellation failed: the command may have already finished"
        );
      }
    } catch (error) {
      appendThreadError(
        threadId,
        formatAgentRuntimeError(
          settings.language,
          "command",
          error instanceof Error ? error.message : String(error)
        )
      );
    }
  }

  // 根据当前项目状态选择空页面, 缺失提示或真实工作台
  function renderWorkspaceView(): ReactElement {
    if (!selectedThreadId) {
      return renderNewConversationView();
    }

    return (
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
        <div className="min-h-0 p-5">
          {currentProjectMissing ? <div className="mb-4">{renderProjectMissingNotice()}</div> : null}
          {renderThreadWorkspace()}
        </div>
        {renderTaskComposer("dock")}
      </div>
    );
  }

  // 渲染无会话首页, 保持 Forge 的轻量输入入口
  function renderNewConversationView(): ReactElement {
    return (
      <section className="flex h-full min-h-0 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[760px] -translate-y-[5vh]">
          <h1 className="mb-5 overflow-visible whitespace-nowrap pb-2 text-center text-[22px] font-medium leading-[1.28] tracking-normal text-[#202123] md:text-[24px]">
            <span
              key={heroPromptIndex}
              className="inline-block max-w-full animate-[forge-title-swap_900ms_ease-in-out] truncate align-baseline"
            >
              {activeHeroPrompt}
            </span>
          </h1>
          {currentProjectMissing ? (
            <div className="mx-auto mb-4 max-w-[680px]">
              {renderProjectMissingNotice()}
            </div>
          ) : taskNotice ? (
            <div className="mx-auto mb-4 max-w-[760px]">
              <Notice message={taskNotice} />
            </div>
          ) : null}
          {renderTaskComposer("hero")}
        </div>
      </section>
    );
  }

  // 渲染统一输入框, 权限, 附件和模型选择都从这里传入
  function renderTaskComposer(variant: "dock" | "hero"): ReactElement {
    const activeThread = selectThreadById(threads, selectedThreadId);

    return (
      <TaskComposer
        busy={activeThread?.status === "running"}
        settings={settings}
        generalPreferences={generalPreferences}
        focusSignal={composerFocusSignal}
        placeholder={variant === "hero" ? heroComposerPlaceholder : undefined}
        submitSignal={composerSubmitSignal}
        variant={variant}
        onCancelTask={cancelActiveThread}
        onOpenSettings={() => setActiveView("settings")}
        onPickProject={() => void pickProject()}
        onUpdateGeneralPreferences={setGeneralPreferences}
        onSelectModel={(modelId) => setSettings((current) => setCurrentModel(current, modelId))}
        onSelectIntelligence={(level) => setSettings((current) => setIntelligence(current, level))}
        onSelectSpeed={(speed) => setSettings((current) => setSpeed(current, speed))}
        onSubmitTask={submitTask}
      />
    );
  }

  // 渲染项目缺失提示, 引导用户重新选择本地目录
  function renderProjectMissingNotice(): ReactElement | null {
    if (!currentProject) {
      return null;
    }

    return (
      <ProjectMissingNotice
        language={settings.language}
        projectPath={currentProject.path}
        onRemove={() => removeProjectRecord(currentProject.path)}
      />
    );
  }

  // 渲染线程详情并连接执行, 取消和反馈按钮
  function renderThreadWorkspace(): ReactElement {
    const selectedThread = selectThreadById(threads, selectedThreadId);
    const workspaceProjectPath = selectedThread?.projectPath ?? currentProject?.path ?? null;
    const visibleWorkspaceThreads = selectVisibleWorkspaceThreads(threads, workspaceProjectPath);
    const selectedThreadFullAccess = selectedThread
      ? getThreadFullAccessMode(selectedThread.id)
      : fullAccessMode;
    const agentPaused =
      Boolean(selectedThread && pausedThreadIds.has(selectedThread.id)) &&
      hasContinuableAgentActions(selectedThread);

    return (
      <Suspense fallback={<LazyPanelFallback language={settings.language} />}>
        <LazyThreadWorkspace
          compact
          language={settings.language}
          hasProject={Boolean(currentProject) || Boolean(selectedThread)}
          selectedThreadId={selectedThreadId}
          threads={visibleWorkspaceThreads}
          commandSafetyRules={generalPreferences.commandSafetyRules}
          fullAccess={selectedThreadFullAccess}
          agentPaused={agentPaused}
          showActivityHeartbeat={generalPreferences.showActivityHeartbeat}
          showProcessedSummary={generalPreferences.showProcessedSummary}
          defaultExpandProcessedSummary={generalPreferences.expandProcessedSummary}
          projectScan={projectScanResult}
          previewFile={previewFile}
          changePreview={
            previewFile
              ? (changePreviews.find((preview) => preview.relativePath === previewFile.relativePath) ?? null)
              : null
          }
          changePreviews={changePreviews}
          onSelectThread={setSelectedThreadId}
          onPickProject={() => void pickProject()}
          onOpenRecentProject={openMostRecentProject}
          onRunAgentAction={(threadId, action) => void runAgentAction(threadId, action)}
          onRunAgentActions={(threadId, actions) => void runAgentActions(threadId, actions)}
          onApproveAgentCommand={(threadId, action) => void approveAgentCommandAction(threadId, action)}
          onAllowAgentCommand={(threadId, action) => void allowAgentCommandAction(threadId, action)}
          onGenerateCommandFix={(threadId, result) => void generateCommandFixPlan(threadId, result)}
          onGenerateContinuationPlan={(threadId) => void generateContinuationPlan(threadId)}
          onCompleteAgentAction={completeAgentAction}
          onSkipAgentAction={skipAgentAction}
          onResumeAgent={resumeAgentThread}
          onOpenSourceControl={() => setActiveView("source")}
          onOpenFiles={() => setActiveView("files")}
          onRunCommand={(threadId, command) => void runThreadCommand(threadId, command)}
          onCancelCommand={(threadId, runId) => void cancelThreadCommand(threadId, runId)}
          onPreviewFile={(relativePath) => void previewProjectFile(relativePath)}
          onPreviewChange={(relativePath, nextContent) =>
            void previewProjectFileChange(relativePath, nextContent)
          }
          onApplyChange={(relativePath, nextContent) =>
            void applyProjectFileChange(relativePath, nextContent)
          }
          onDiscardChange={discardProjectFileChange}
          onApplyAllChanges={() => void applyAllProjectFileChanges()}
          onDiscardAllChanges={discardAllProjectFileChanges}
          onGenerateFileChange={(relativePath, currentContent) =>
            void generateProjectFileChange(relativePath, currentContent)
          }
          onGenerateSelectedFileChanges={(relativePaths) =>
            void generateSelectedProjectFileChanges(relativePaths)
          }
          onDeleteFile={(relativePath) => void deleteProjectFile(relativePath)}
        />
      </Suspense>
    );
  }

  function renderFilesView(): ReactElement {
    const activeFilePreview = filePreview ?? (previewFile ? createTextFilePreview(previewFile) : null);
    const activeTextPreview = activeFilePreview?.kind === "text" ? activeFilePreview : null;
    const previewContent = activeTextPreview ? (formattedPreview?.content ?? activeTextPreview.content) : "";
    const formatterMessage =
      fileFormatterMode === "rendered"
        ? settings.language === "zh-CN"
          ? "Markdown 渲染预览"
          : "Rendered Markdown preview"
        : formatPreviewStatus(formattedPreview, settings.language);
    const previewStatusMessage = activeFilePreview
      ? activeFilePreview.kind === "text"
        ? formatterMessage
        : activeFilePreview.kind === "office"
          ? settings.language === "zh-CN"
            ? "文档文件"
            : "Document file"
          : activeFilePreview.mediaType
      : "";
    const formatterOptions: Array<{ value: CodeFormatterMode; label: string }> = activeTextPreview
      ? getAvailableCodeFormatterModes(activeTextPreview.relativePath).map((mode) => ({
          value: mode,
          label:
            mode === "prettier"
              ? "Prettier"
              : settings.language === "zh-CN"
                ? "渲染"
                : "Rendered"
        }))
      : [];

    return (
      <section className="m-5 h-[calc(100%-40px)] min-h-0 overflow-hidden rounded-[20px] border border-[#ececf1] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
        <ViewHeader title={t("files.title")} description={t("files.description")} />
        {!currentProject ? (
          <EmptyAction message={t("projects.required")} action={t("projects.pick")} onClick={() => void pickProject()} />
        ) : currentProjectMissing ? (
          <div className="p-5">{renderProjectMissingNotice()}</div>
        ) : (
          <div className="grid h-[calc(100%-86px)] min-h-0 grid-cols-[320px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-auto border-r border-[#ececf1] p-3">
              {fileTreeNotice ? (
                <div className="mb-2 rounded-[10px] border border-[#fdecc8] bg-[#fff7ed] px-3 py-2 text-[12px] text-[#b45309]">
                  {fileTreeNotice}
                </div>
              ) : null}
              {lazyFileTreeNodes.length > 0 ? (
                <>
                  <ProjectFileTree
                    expandedFolders={expandedFileTreeFolderSet}
                    hasMoreFolders={hasMoreFileTreeFolderSet}
                    loadingFolders={loadingFileTreeFolderSet}
                    loadingLabel={settings.language === "zh-CN" ? "正在加载" : "Loading..."}
                    loadMoreLabel={settings.language === "zh-CN" ? "加载更多" : "Load more"}
                    nodes={lazyFileTreeNodes}
                    selectedPath={filePreview?.relativePath ?? null}
                    truncatedFolders={truncatedFileTreeFolderSet}
                    truncatedLabel={settings.language === "zh-CN" ? "此目录结果已截断" : "Directory result truncated"}
                    onLoadMoreFolder={loadMoreProjectFileTreeDirectory}
                    onPreviewFile={(relativePath) => void previewProjectFile(relativePath)}
                    onToggleFolder={toggleProjectFileTreeFolder}
                  />
                  {hasMoreFileTreeFolderSet.has(".") ? (
                    <button
                      type="button"
                      disabled={loadingFileTreeFolderSet.has(".")}
                      className="mt-2 w-full rounded-[10px] px-3 py-2 text-left text-[12px] text-[#2563eb] hover:bg-[#eff6ff] disabled:text-[#8e8ea0]"
                      onClick={() => loadMoreProjectFileTreeDirectory(".")}
                    >
                      {loadingFileTreeFolderSet.has(".")
                        ? settings.language === "zh-CN"
                          ? "正在加载"
                          : "Loading..."
                        : settings.language === "zh-CN"
                          ? "加载更多"
                          : "Load more"}
                    </button>
                  ) : null}
                </>
              ) : loadingFileTreeFolderSet.has(".") ? (
                <div className="px-3 py-2 text-[12px] text-[#8e8ea0]">
                  {settings.language === "zh-CN" ? "正在加载项目文件" : "Loading project files..."}
                </div>
              ) : (
                <div className="px-3 py-2 text-[12px] text-[#8e8ea0]">{t("files.pickFile")}</div>
              )}
            </div>
            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-4">
              {activeFilePreview ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#f7f7f8]">
                        <ProjectFileIcon className="h-4 w-4 shrink-0" relativePath={activeFilePreview.relativePath} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-[#202123]">
                          {activeFilePreview.relativePath}
                        </span>
                        <span className="mt-1 block truncate text-[12px] text-[#8e8ea0]">
                          {previewStatusMessage}
                        </span>
                      </span>
                    </span>
                    {formatterOptions.length > 0 ? (
                      <label className="flex shrink-0 items-center gap-2 text-[12px] text-[#6e6e80]">
                        {settings.language === "zh-CN" ? "格式化" : "Formatter"}
                        {formatterOptions.length > 1 ? (
                          <InlineSelectMenu<CodeFormatterMode>
                            ariaLabel={settings.language === "zh-CN" ? "代码格式化" : "Code formatter"}
                            value={fileFormatterMode}
                            options={formatterOptions}
                            onChange={setFileFormatterMode}
                            triggerClassName="min-w-32 text-[12px]"
                            contentClassName="text-[12px]"
                          />
                        ) : (
                          <span className="inline-flex h-8 min-w-24 items-center justify-center rounded-[12px] border border-[#d9d9e3] bg-[#f7f7f8] px-3 text-[12px] text-[#565869]">
                            {formatterOptions[0].label}
                          </span>
                        )}
                      </label>
                    ) : null}
                  </div>
                  <Suspense fallback={<LazyPanelFallback language={settings.language} compact />}>
                    <LazyFilePreviewRenderer
                      content={previewContent}
                      filePreview={activeFilePreview}
                      mode={fileFormatterMode}
                      path={activeFilePreview.relativePath}
                    />
                  </Suspense>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#6e6e80]">
                  {t("files.pickFile")}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  // 渲染源代码管理视图, Git 选择和提交动作集中在这里
  function renderSourceView(): ReactElement {
    const changedFiles = gitStatus?.changedFiles ?? [];
    const changes = gitStatus?.changes ?? [];
    const selectedChange =
      changes.find((change) => change.path === selectedGitPath) ?? changes[0] ?? null;
    const selectedThread = selectThreadById(threads, selectedThreadId);
    const pendingCommitAction = findPendingAgentCommitAction(selectedThread);
    const agentCommitSuggestion = formatAgentCommitMessageSuggestion(pendingCommitAction);
    const agentCommitCopy =
      settings.language === "zh-CN"
        ? {
            title: "Agent 提交建议",
            body: "来自当前任务线程的 commit 步骤",
            use: "使用 Agent 提交建议"
          }
        : {
            title: "Agent commit suggestion",
            body: "From the current task thread commit step",
            use: "Use agent commit suggestion"
          };
    const gitOperationCopy =
      settings.language === "zh-CN"
        ? {
            currentBranch: "当前分支",
            detached: "detached HEAD",
            commitBranch: "提交分支",
            commitBranchHint: "选择已有分支，或输入新分支名",
            createBranch: "创建新分支后提交",
            remote: "远端",
            pushAfterCommit: "提交后推送",
            pushBranch: "推送分支"
          }
        : {
            currentBranch: "Current branch",
            detached: "detached HEAD",
            commitBranch: "Commit branch",
            commitBranchHint: "Choose an existing branch or type a new one",
            createBranch: "Create new branch before commit",
            remote: "Remote",
            pushAfterCommit: "Push after commit",
            pushBranch: "Push branch"
          };
    const branchOptions = gitStatus?.branches ?? [];
    const remoteOptions = gitStatus?.remotes ?? [];
    const selectedRemote = gitRemote.trim() || remoteOptions[0] || "origin";
    const targetBranch = commitBranch.trim() || gitStatus?.currentBranch || branchOptions[0] || "";
    const branchSelectOptions = branchOptions.map((branch) => ({ value: branch, label: branch }));
    const remoteSelectOptions = remoteOptions.map((remote) => ({ value: remote, label: remote }));

    return (
      <section className="m-5 h-[calc(100%-40px)] min-h-0 overflow-auto rounded-[20px] border border-[#ececf1] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
        <ViewHeader title={t("source.title")} description={t("source.description")} />
        {!currentProject ? (
          <EmptyAction message={t("projects.required")} action={t("projects.pick")} onClick={() => void pickProject()} />
        ) : currentProjectMissing ? (
          <div className="p-5">{renderProjectMissingNotice()}</div>
        ) : (
          <div className="grid h-[calc(100%-86px)] min-h-0 gap-3 p-4 xl:grid-cols-[minmax(260px,330px)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
              <div className="border-b border-[#ececf1] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <h2 className="text-sm font-semibold text-[#202123]">{t("source.changedFiles")}</h2>
                    <span className="mt-1 block truncate text-[10px] text-[#8e8ea0]">{currentProject.path}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void refreshProjectGitStatus()}
                    className="shrink-0 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 py-1.5 text-[10px] text-[#202123] hover:bg-[#f7f7f8]"
                  >
                    {t("projects.refreshGit")}
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-1.5">
                {gitStatus?.isRepo === false ? (
                  <p className="px-2 py-2 text-sm text-[#6e6e80]">{t("projects.gitNotRepo")}</p>
                ) : changedFiles.length > 0 ? (
                  <div className="space-y-0.5">
                    {changes.map((change) => (
                      <button
                        key={change.path}
                        type="button"
                        onClick={() => setSelectedGitPath(change.path)}
                        className={`grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[9px] px-1.5 py-1.5 text-left text-[11px] transition ${
                          selectedChange?.path === change.path
                            ? "bg-[#ececf1] text-[#202123]"
                            : "text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
                        }`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-[6px] border border-[#d9d9e3] bg-white font-mono text-[10px] text-[#6e6e80]">
                          {formatGitStatusLetter(change.status)}
                        </span>
                        <span className="min-w-0 truncate">{change.path}</span>
                        <span className="shrink-0 text-[11px] text-[#8e8ea0]">
                          {formatGitStatus(change.status, settings.language)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-2 text-sm text-[#6e6e80]">{t("projects.gitClean")}</p>
                )}
              </div>
              <div className="border-t border-[#ececf1] p-2.5">
                {agentCommitSuggestion ? (
                  <div className="mb-3 rounded-[14px] border border-[#d9d9e3] bg-[#f7f7f8] px-3 py-2">
                    <div className="text-[11px] font-semibold text-[#202123]">
                      {agentCommitCopy.title}
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-[#6e6e80]">
                      {agentCommitCopy.body}
                    </p>
                    <p className="mt-2 break-words font-mono text-[12px] leading-5 text-[#202123]">
                      {agentCommitSuggestion}
                    </p>
                    <button
                      type="button"
                      aria-label={agentCommitCopy.use}
                      onClick={() => setCommitMessage(agentCommitSuggestion)}
                      className="mt-2 h-8 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 text-[11px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                    >
                      {agentCommitCopy.use}
                    </button>
                  </div>
                ) : null}
                <label className="grid gap-2 text-sm text-[#6e6e80]">
                  {t("projects.commitMessage")}
                  <input
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.currentTarget.value)}
                    className="h-10 rounded-[14px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
                  />
                </label>
                <div className="mt-3 space-y-2 rounded-[14px] border border-[#ececf1] bg-[#fafafa] p-3">
                  <p className="text-[11px] text-[#6e6e80]">
                    {gitOperationCopy.currentBranch}:{" "}
                    <span className="font-mono text-[#202123]">
                      {gitStatus?.currentBranch ?? gitOperationCopy.detached}
                    </span>
                  </p>
                  <label className="grid gap-1.5 text-[12px] text-[#6e6e80]">
                    {gitOperationCopy.commitBranch}
                    {createCommitBranch || branchSelectOptions.length === 0 ? (
                      <input
                        value={commitBranch}
                        placeholder={gitOperationCopy.commitBranchHint}
                        onChange={(event) => setCommitBranch(event.currentTarget.value)}
                        className="h-9 rounded-[12px] border border-[#d9d9e3] bg-white px-2.5 font-mono text-[12px] text-[#202123] outline-none transition focus:border-[#202123]"
                      />
                    ) : (
                      <InlineSelectMenu
                        align="start"
                        ariaLabel={gitOperationCopy.commitBranch}
                        value={targetBranch}
                        options={branchSelectOptions}
                        onChange={setCommitBranch}
                        triggerClassName="w-full justify-between font-mono text-[12px]"
                        contentClassName="max-h-64 overflow-auto font-mono text-[12px]"
                      />
                    )}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="grid gap-1.5 text-[12px] text-[#6e6e80]">
                      {gitOperationCopy.remote}
                      {remoteSelectOptions.length > 0 ? (
                        <InlineSelectMenu
                          align="start"
                          ariaLabel={gitOperationCopy.remote}
                          value={selectedRemote}
                          options={remoteSelectOptions}
                          onChange={setGitRemote}
                          triggerClassName="w-full justify-between font-mono text-[12px]"
                          contentClassName="font-mono text-[12px]"
                        />
                      ) : (
                        <input
                          value={gitRemote}
                          onChange={(event) => setGitRemote(event.currentTarget.value)}
                          className="h-9 rounded-[12px] border border-[#d9d9e3] bg-white px-2.5 font-mono text-[12px] text-[#202123] outline-none transition focus:border-[#202123]"
                        />
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() => void pushCurrentProjectBranch()}
                      disabled={!gitStatus?.isRepo || !targetBranch}
                      className="h-9 self-end rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-[12px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] disabled:cursor-not-allowed disabled:bg-[#ececf1] disabled:text-[#8e8ea0]"
                    >
                      {gitOperationCopy.pushBranch}
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[12px] text-[#565869]">
                    <input
                      type="checkbox"
                      checked={createCommitBranch}
                      onChange={(event) => setCreateCommitBranch(event.currentTarget.checked)}
                      className="h-4 w-4 rounded border-[#d9d9e3]"
                    />
                    {gitOperationCopy.createBranch}
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-[#565869]">
                    <input
                      type="checkbox"
                      checked={pushAfterCommit}
                      onChange={(event) => setPushAfterCommit(event.currentTarget.checked)}
                      className="h-4 w-4 rounded border-[#d9d9e3]"
                    />
                    {gitOperationCopy.pushAfterCommit}{" "}
                    <span className="font-mono text-[#8e8ea0]">{selectedRemote}</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void commitCurrentProject(commitMessage)}
                  disabled={!gitStatus?.isRepo || changedFiles.length === 0}
                  className="mt-3 h-10 w-full rounded-[14px] bg-[#202123] text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#ececf1] disabled:text-[#8e8ea0]"
                >
                  {pushAfterCommit
                    ? settings.language === "zh-CN"
                      ? "提交并推送"
                      : "Commit and push"
                    : t("projects.commit")}
                </button>
                {gitNotice ? <p className="mt-3 text-sm text-[#b45309]">{gitNotice}</p> : null}
              </div>
            </div>

            <div className="min-h-[520px] overflow-hidden rounded-[16px] border border-[#ececf1] bg-white">
              <div className="border-b border-[#ececf1] px-4 py-3">
                <h2 className="text-sm font-semibold text-[#202123]">{t("source.diffPreview")}</h2>
                <p className="mt-1 truncate text-[10px] text-[#6e6e80]">
                  {selectedChange?.path ?? t("source.selectChangedFile")}
                </p>
              </div>
              {selectedChange && selectedChange.diff.trim() ? (
                <SourceDiffPreview diff={selectedChange.diff} />
              ) : (
                <div className="flex h-[calc(100%-58px)] min-h-[520px] items-center justify-center px-4 text-center text-sm text-[#6e6e80]">
                  {t("source.noDiffPreview")}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  // 渲染设置页并传入模型, API, Agent 和记忆配置
  function renderSettingsView(): ReactElement {
    return (
      <div className="h-full min-h-0 p-5">
        <Suspense fallback={<LazyPanelFallback language={settings.language} />}>
          <LazySettingsPanel
            settings={settings}
            agentMemories={agentMemories}
            agentProfiles={agentProfiles}
            generalPreferences={generalPreferences}
            keyStatuses={keyStatuses}
            archivedThreads={threads.filter((thread) => thread.archived)}
            localDataSummary={{
              apiKeyCount: Object.values(keyStatuses).filter((status) => status.hasKey).length,
              archivedThreadCount: threads.filter((thread) => thread.archived).length,
              commandRuleCount: generalPreferences.commandSafetyRules.length,
              conversationCount: threads.length,
              customProviderCount: settings.providers.filter((provider) => provider.custom).length,
              memoryCount: agentMemories.length,
              recentProjectCount: recentProjects.length,
              usageEventCount: usageEvents.length
            }}
            onClearAgentMemories={() => setAgentMemories([])}
            onClearAllLocalData={clearAllLocalData}
            onDeleteAgentMemory={(memoryId) =>
              setAgentMemories((current) => deleteAgentMemory(current, memoryId))
            }
            onSelectAgentProfile={(profileId) =>
              setAgentProfiles((current) => selectAgentProfile(current, profileId))
            }
            onUpdateAgentProfile={(profileId, patch) =>
              setAgentProfiles((current) => updateAgentProfile(current, profileId, patch))
            }
            onDeleteProviderKey={(providerId) => void deleteProviderKey(providerId)}
            onFetchModels={(providerId, apiKey) => void fetchModels(providerId, apiKey)}
            onAddManualModel={(providerId, modelName, apiKey) =>
              void addManualProviderModel(providerId, modelName, apiKey)
            }
            onAddProvider={(label, baseUrl) =>
              setSettings((current) => addCustomProvider(current, label, baseUrl))
            }
            onDeleteProvider={(providerId) => {
              setSettings((current) => deleteCustomProvider(current, providerId));
              void deleteProviderKey(providerId);
            }}
            onSaveProviderKey={(providerId, apiKey) => void saveProviderKey(providerId, apiKey)}
            onSetLanguage={setInterfaceLanguage}
            onUpdateGeneralPreferences={setGeneralPreferences}
            onToggleModelEnabled={(modelId, enabled) =>
              setSettings((current) => updateModelEnabled(current, modelId, enabled))
            }
            onSelectModel={(modelId) => setSettings((current) => setCurrentModel(current, modelId))}
            onUpdateProviderBaseUrl={(providerId, baseUrl) =>
              setSettings((current) => updateProviderBaseUrl(current, providerId, baseUrl))
            }
            onUpdateProviderLabel={(providerId, label) =>
              setSettings((current) => updateProviderLabel(current, providerId, label))
            }
            onDeleteArchivedThread={(threadId) => {
              setThreads((current) => deleteThread(current, threadId));
              if (selectedThreadId === threadId) {
                setSelectedThreadId(null);
              }
            }}
            onRestoreArchivedThread={(threadId) => {
              setThreads((current) => restoreThread(current, threadId));
              setSelectedThreadId(threadId);
              setActiveView("workspace");
            }}
            personalization={personalization}
            providerFetchStates={providerFetchStates}
            usageEvents={usageEvents}
            usageRates={usageRates}
            onClearUsage={() => setUsageEvents([])}
            onUpdatePersonalization={(nextPersonalization) => setPersonalization(nextPersonalization)}
            onUpdateUsageRate={(providerId, rate) =>
              setUsageRates((current) => ({
                ...current,
                [providerId]: { ...rate, source: "manual" }
              }))
            }
          />
        </Suspense>
      </div>
    );
  }

  // 根据侧边栏选中项决定主内容, 设置默认进入常规页
  function renderActiveView(): ReactElement {
    if (activeView === "settings") {
      return renderSettingsView();
    }

    if (activeView === "files") {
      return renderFilesView();
    }

    if (activeView === "source") {
      return renderSourceView();
    }

    return renderWorkspaceView();
  }

  return (
    <AppShell
      language={settings.language}
      activeView={activeView}
      currentProjectName={currentProject?.name}
      currentProjectPath={currentProject?.path}
      projects={recentProjects}
      threads={threads}
      onArchiveAllChats={() => {
        setThreads((current) => archiveAllThreads(current));
        setSelectedThreadId(null);
      }}
      onArchiveProjectChats={archiveProjectConversations}
      onArchiveThread={(threadId) => {
        setThreads((current) => archiveThread(current, threadId));
        if (selectedThreadId === threadId) {
          setSelectedThreadId(null);
        }
      }}
      onCreateProjectWorktree={createProjectWorktree}
      onDeleteThread={(threadId) => {
        setThreads((current) => deleteThread(current, threadId));
        if (selectedThreadId === threadId) {
          setSelectedThreadId(null);
        }
      }}
      onNavigate={setActiveView}
      onNewTask={() => {
        setActiveView("workspace");
        setSelectedThreadId(null);
        focusComposer();
      }}
      onNewProjectChat={(projectPath) => {
        selectProject(projectPath);
        setSelectedThreadId(null);
        focusComposer();
      }}
      onRun={() => {
        setActiveView("workspace");
        submitComposer();
      }}
      onMinimizeWindow={() => void window.forge.windowControls.minimize()}
      onToggleMaximizeWindow={() => void window.forge.windowControls.toggleMaximize()}
      onPickProject={() => void pickProject()}
      onRemoveProject={removeProjectRecord}
      onRenameProject={renameProject}
      onSelectProject={selectProject}
      onSelectThread={(threadId) => {
        const thread = selectThreadById(threads, threadId);

        if (thread?.projectPath) {
          const project = recentProjects.find((candidate) => candidate.path === thread.projectPath);

          if (project) {
            setCurrentProject(project);
            setRecentProjects((current) =>
              addRecentProject(current, { ...project, openedAt: new Date().toISOString() })
            );
          }
        }

        setSelectedThreadId(threadId);
        setActiveView("workspace");
      }}
      onTogglePinProject={togglePinnedProject}
      onTogglePinThread={(threadId) => setThreads((current) => toggleThreadPinned(current, threadId))}
      backgroundImageDataUrl={generalPreferences.backgroundImageDataUrl}
      backgroundOpacity={generalPreferences.backgroundOpacity}
    >
      {renderActiveView()}
    </AppShell>
  );
}

// 把运行时错误收敛成一行中文提示, 隐藏 HTML 响应噪音
function formatAgentRuntimeError(
  language: Language,
  kind: "file" | "command" | "agent",
  message: string
): string {
  const detail = formatRuntimeError(language, message);

  if (language === "zh-CN") {
    const prefix = kind === "file" ? "文件动作" : kind === "command" ? "命令执行" : "Agent 动作";

    return `${prefix}失败: ${detail}`;
  }

  const prefix = kind === "file" ? "File action" : kind === "command" ? "Command execution" : "Agent action";

  return `${prefix} failed: ${detail}`;
}

// 将工具权限拒绝转成用户可读提示, 执行层仍使用稳定英文工具名
function formatAgentPermissionDenied(
  language: Language,
  profileName: string,
  tool: "read" | "edit" | "command" | "git"
): string {
  if (language === "zh-CN") {
    const toolLabel = {
      read: "读取文件",
      edit: "编辑文件",
      command: "运行命令",
      git: "Git 操作"
    }[tool];

    return `智能体配置 ${profileName} 未允许${toolLabel}`;
  }

  return `Agent profile ${profileName} does not allow ${tool} actions`;
}

// 重复项目名加序号, 侧边栏展示时保持可区分
function makeUniqueProjectName(name: string, projects: ForgeProject[], projectPath: string): string {
  const existing = new Set(
    projects
      .filter((project) => project.path !== projectPath)
      .map((project) => project.name.trim().toLowerCase())
  );

  if (!existing.has(name.toLowerCase())) {
    return name;
  }

  let suffix = 2;
  let candidate = `${name} ${suffix}`;

  while (existing.has(candidate.toLowerCase())) {
    suffix += 1;
    candidate = `${name} ${suffix}`;
  }

  return candidate;
}

// 把文本 diff 渲染成逐行预览, 供文件页和审查面板复用
function createGitOperationNotice(
  language: Language,
  options: {
    type: "commit" | "commit-push" | "push";
    branch: string | null;
    remote: string;
  }
): string {
  const branch = options.branch || (language === "zh-CN" ? "当前分支" : "current branch");

  if (options.type === "commit-push") {
    return language === "zh-CN"
      ? `已创建 Git 提交并推送到 ${options.remote}/${branch}`
      : `Created Git commit and pushed to ${options.remote}/${branch}`;
  }

  if (options.type === "push") {
    return language === "zh-CN"
      ? `已推送分支 ${branch} 到 ${options.remote}`
      : `Pushed branch ${branch} to ${options.remote}`;
  }

  return language === "zh-CN" ? `已在 ${branch} 创建 Git 提交` : `Created Git commit on ${branch}`;
}

// 合并索引和工作区状态字母, 空状态用占位符对齐
function formatGitStatusLetter(status: string): string {
  if (status === "??") {
    return "U";
  }

  if (status.includes("D")) {
    return "D";
  }

  if (status.includes("R")) {
    return "R";
  }

  if (status.includes("A")) {
    return "A";
  }

  return "M";
}

// 识别项目路径缺失类错误, 用于切换到重新选择提示
function isMissingProjectError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /Project path does not exist|项目路径不存在|ENOENT|cannot find|no such file/i.test(message);
}

// Agent 新建文件时使用空快照进入 diff 审查流程
function createEmptyProjectTextFile(relativePath: string): ProjectTextFile {
  return {
    relativePath: relativePath.replace(/\\/g, "/"),
    content: "",
    size: 0
  };
}

// 识别单个目标文件不存在, 不把项目根目录缺失误判成新建文件
function isMissingProjectFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /\bENOENT\b|no such file or directory|cannot find the path|找不到指定/i.test(message);
}

// 把预览状态翻译成审查列表里的中文标签
function formatPreviewStatus(
  result: CodeFormatResult | null,
  language: Language
): string {
  if (!result) {
    return language === "zh-CN" ? "准备预览" : "Preparing preview";
  }

  if (result.status === "formatted") {
    return language === "zh-CN" ? "已使用 Prettier 格式化预览" : "Formatted with Prettier";
  }

  if (result.status === "unsupported") {
    return language === "zh-CN" ? "当前文件类型暂不支持格式化" : "No formatter for this file type";
  }

  if (result.status === "error") {
    return result.message
      ? formatRuntimeError(language, result.message)
      : language === "zh-CN"
        ? "格式化失败"
        : "Formatting failed";
  }

  return language === "zh-CN" ? "原始内容" : "Raw content";
}

// Read-only mode is enforced at runtime by narrowing writable agent permissions.
function applyGeneralPreferencesToAgentProfile(
  agentProfile: AgentProfileContext,
  generalPreferences: GeneralPreferences
): AgentProfileContext {
  if (generalPreferences.readOnly) {
    return {
      ...agentProfile,
      permissionMode: "auto",
      enabledTools: agentProfile.enabledTools.filter((tool) => tool === "read")
    };
  }

  if (generalPreferences.fullAccess) {
    return {
      ...agentProfile,
      permissionMode: "full",
      enabledTools: ["read", "edit", "command", "git"]
    };
  }

  return agentProfile;
}

// 渲染轻量提示条, 不把提示样式散落在多个视图
function Notice({ message }: { message: string }): ReactElement {
  return (
    <div className="mb-3 rounded-[14px] border border-[#f4c7ab] bg-[#fff7ed] px-3 py-2 text-[12px] text-[#b45309]">
      {message}
    </div>
  );
}

// 渲染页面标题和副标题, 保持文件页和设置页层级一致
function ViewHeader({
  title,
  description
}: {
  title: string;
  description: string;
}): ReactElement {
  return (
    <header className="border-b border-[#ececf1] px-5 py-4">
      <h1 className="text-lg font-semibold text-[#202123]">{title}</h1>
      <p className="mt-1 text-[12px] text-[#6e6e80]">{description}</p>
    </header>
  );
}

// 渲染空状态行动入口, 图标和文案由调用方决定
function EmptyAction({
  message,
  action,
  onClick
}: {
  message: string;
  action: string;
  onClick: () => void;
}): ReactElement {
  return (
    <div className="flex h-[calc(100%-86px)] items-center justify-center p-6">
      <div className="text-center">
        <p className="mb-4 text-[12px] text-[#6e6e80]">{message}</p>
        <button
          type="button"
          onClick={onClick}
          className="rounded-[14px] bg-[#202123] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-black"
        >
          {action}
        </button>
      </div>
    </div>
  );
}
