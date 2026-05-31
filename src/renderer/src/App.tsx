// 本文件说明: 协调 Forge 渲染层的项目, 对话, 设置和 Agent 执行入口
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import type { ProjectGitStatus } from "@shared/gitTypes";
import type { ForgeModel, ForgeProvider, Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import { createAgentActionsFromPlanSteps, type AgentAction } from "@shared/agentExecutionPlan";
import { AppShell, type WorkbenchView } from "@/components/AppShell";
import { FilePreviewRenderer } from "@/components/FilePreviewRenderer";
import { InlineSelectMenu } from "@/components/InlineSelectMenu";
import { ProjectMissingNotice } from "@/components/ProjectMissingNotice";
import { SettingsPanel, type ProviderFetchState } from "@/components/SettingsPanel";
import { TaskComposer } from "@/components/TaskComposer";
import { ThreadWorkspace } from "@/components/ThreadWorkspace";
import {
  resolveAgentCommandRisk,
  resolveAgentActionPermission,
  resolveAgentActionExecution,
  getRunnablePendingAgentActions,
  runAgentActionBatch,
  shouldTreatMissingInspectAsNewFile,
  type AgentActionRunOutcome
} from "@/agent/agentActionExecutor";
import { createCommandFinishedEvent, createCommandStartedEvent } from "@/agent/commandEvents";
import {
  createFailureFixTaskPrompt,
  findLatestCommandResultForAction
} from "@/agent/failureFixPrompt";
import { createFileChangeTaskPrompt } from "@/agent/fileChangeTaskPrompt";
import { formatAgentCommandRiskReason } from "@/i18n/agentMessages";
import { formatRemoteModelError, formatRuntimeError } from "@/i18n/runtimeErrors";
import { useI18n } from "@/i18n/useI18n";
import {
  attachFileChangePreviewSource,
  findFileChangePreviewSource,
  listFileChangePreviewSources,
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
  appendThreadResultDelta,
  archiveAllThreads,
  archiveProjectThreads,
  archiveThread,
  cancelThread,
  completeNextPendingAgentAction,
  createCommandApprovalEvent,
  createThreadFromSettings,
  restoreThread,
  toggleThreadPinned,
  updateThreadAgentActionStatus,
  type CommandRunResult,
  type TaskThread
} from "@/state/taskThreads";
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
import { isDirectAnswerPrompt } from "@/state/conversationRouting";
import {
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
  selectRelevantAgentMemories,
  upsertAgentMemory,
  type AgentMemoryEntry
} from "@/state/agentMemory";
import {
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

const zhHeroPrompts = [
  "我们该做什么？",
  "要修复哪个问题？",
  "想实现什么功能？",
  "需要解释哪段代码？",
  "今天要锻造哪个想法？",
  "要把哪个报错处理掉？",
  "想让 Forge 先读哪里？",
  "需要补哪一组测试？",
  "要重构哪个模块？",
  "想检查哪次变更？",
  "要生成什么实现计划？",
  "想优化哪个页面？",
  "要排查哪个接口？",
  "需要整理哪段逻辑？",
  "想让代码更清晰吗？",
  "要给项目加什么能力？",
  "今天从哪个文件开始？",
  "想验证哪个命令？",
  "要修复构建还是类型？",
  "需要写一份变更说明吗？",
  "想比较哪两种方案？",
  "要找出性能瓶颈吗？",
  "需要生成提交信息吗？",
  "要检查 Git 改动吗？",
  "想让 Forge 先规划吗？",
  "要把需求拆小吗？",
  "需要补充文档吗？",
  "想处理哪个 TODO？",
  "要让界面更顺手吗？",
  "准备锻造下一步了吗？"
];

const enHeroPrompts = [
  "What should we build?",
  "What should we fix?",
  "What feature is next?",
  "What code should we explain?",
  "What idea should we forge today?",
  "Which error should we clear?",
  "Where should Forge read first?",
  "Which tests should we add?",
  "Which module needs refactoring?",
  "Which change should we review?",
  "What plan should we generate?",
  "Which screen should we improve?",
  "Which API should we debug?",
  "Which logic needs cleanup?",
  "Should we make this code clearer?",
  "What capability should this project gain?",
  "Which file should we start with?",
  "Which command should we verify?",
  "Build issue or type issue?",
  "Need a change summary?",
  "Which two approaches should we compare?",
  "Should we look for a performance bottleneck?",
  "Need a commit message?",
  "Should we inspect Git changes?",
  "Should Forge plan first?",
  "Should we break this down?",
  "Need documentation updates?",
  "Which TODO should we handle?",
  "Should we make the UI smoother?",
  "Ready to forge the next step?"
];

const heroSwapAnimationMs = 900;
const heroSwapIdleMs = 1500;

// 根组件集中持有持久化状态和跨视图动作, 子组件只接收明确回调
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
  const [currentProject, setCurrentProject] = useState<ForgeProject | null>(
    () => recentProjects[0] ?? null
  );
  const [projectScanResult, setProjectScanResult] = useState<ProjectScanResult | null>(null);
  const [previewFile, setPreviewFile] = useState<ProjectTextFile | null>(null);
  const [fileFormatterMode, setFileFormatterMode] = useState<CodeFormatterMode>("raw");
  const [formattedPreview, setFormattedPreview] = useState<CodeFormatResult | null>(null);
  const [missingProjectPath, setMissingProjectPath] = useState<string | null>(null);
  const [changePreviews, setChangePreviews] = useState<ProjectFileChangePreview[]>([]);
  const [gitStatus, setGitStatus] = useState<ProjectGitStatus | null>(null);
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
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
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [composerSubmitSignal, setComposerSubmitSignal] = useState(0);
  const [activeView, setActiveView] = useState<WorkbenchView>("workspace");
  const [heroPromptIndex, setHeroPromptIndex] = useState(0);
  const { t } = useI18n(settings.language);
  const cancelledThreadIdsRef = useRef<Set<string>>(new Set());
  const activeAskStreamRequestIdsRef = useRef<Map<string, string>>(new Map());
  const activeAgentAutoRunKeysRef = useRef<Set<string>>(new Set());
  const activeHeroPrompts = settings.language === "zh-CN" ? zhHeroPrompts : enHeroPrompts;
  const currentProjectMissing =
    Boolean(currentProject) && missingProjectPath === currentProject?.path;
  const activeAgentProfileContext = getActiveAgentProfileContext(agentProfiles);
  const fullAccessMode =
    generalPreferences.fullAccess || activeAgentProfileContext.permissionMode === "full";

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
    return window.forge.commands.onOutput((chunk) => {
      setThreads((current) => appendCommandRunOutput(current, chunk));
    });
  }, []);

  useEffect(() => {
    if (changePreviews.length > 0) {
      return;
    }

    const nextThread = threads.find((thread) => {
      if (thread.archived || cancelledThreadIdsRef.current.has(thread.id)) {
        return false;
      }

      const runnableActions = getRunnablePendingAgentActions(thread.agentActions ?? [], {
        fullAccess: fullAccessMode,
        rules: generalPreferences.commandSafetyRules
      });

      return runnableActions.length > 0;
    });

    if (!nextThread) {
      return;
    }

    const runnableActions = getRunnablePendingAgentActions(nextThread.agentActions ?? [], {
      fullAccess: fullAccessMode,
      rules: generalPreferences.commandSafetyRules
    });
    const runKey = `${nextThread.id}:${runnableActions.map((action) => action.id).join(",")}`;

    if (activeAgentAutoRunKeysRef.current.has(runKey)) {
      return;
    }

    activeAgentAutoRunKeysRef.current.add(runKey);
    void runAgentActions(nextThread.id, runnableActions).finally(() => {
      activeAgentAutoRunKeysRef.current.delete(runKey);
    });
  }, [changePreviews.length, fullAccessMode, generalPreferences.commandSafetyRules, threads]);

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

    setCurrentProject(recentProject);
    setMissingProjectPath(null);
    setActiveView("workspace");
  }

  // 读取项目文件索引, 供文件页和 Agent 上下文共用
  async function scanProject(projectPath: string): Promise<boolean> {
    try {
      const result = await window.forge.projects.scan(projectPath);
      setProjectScanResult(result);
      setPreviewFile(null);
      setFormattedPreview(null);
      setMissingProjectPath(null);
      setChangePreviews([]);
      return true;
    } catch (error) {
      setProjectScanResult(null);
      setPreviewFile(null);
      setFormattedPreview(null);
      setChangePreviews([]);
      setGitStatus(null);

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
  async function commitCurrentProject(message: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    if (!message.trim()) {
      setGitNotice(t("projects.commitMessageRequired"));
      return;
    }

    try {
      const result = await window.forge.git.commit({
        projectRoot: currentProject.path,
        message
      });
      setGitStatus(result.status);
      setCommitMessage("");
      setGitNotice(t("projects.commitDone"));
      if (selectedThreadId) {
        setThreads((current) => completeNextPendingAgentAction(current, selectedThreadId, "commit"));
      }
    } catch (error) {
      setGitNotice(formatRuntimeError(settings.language, error));
    }
  }

  // 按路径读取项目文件并生成可阅读预览
  async function previewProjectFile(relativePath: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    const file = await window.forge.files.readText({
      projectRoot: currentProject.path,
      relativePath
    });
    setPreviewFile(file);
    setFileFormatterMode(getDefaultCodeFormatterMode(file.relativePath));
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

    const reviewedPreview = changePreviews.find((preview) => preview.relativePath === relativePath);
    const file = await window.forge.files.writeText({
      projectRoot: currentProject.path,
      relativePath,
      nextContent
    });
    setPreviewFile(file);
    setChangePreviews((current) => removeFileChangePreview(current, relativePath));
    void refreshProjectGitStatus();

    if (reviewedPreview?.source) {
      markFileChangeSourceApplied(reviewedPreview.source, file.relativePath);
      return;
    }

    if (!selectedThreadId) {
      return;
    }

    const createdAt = new Date().toISOString();
    setThreads((current) =>
      appendThreadEvents(current, selectedThreadId, [
        {
          id: `${selectedThreadId}-file-write-${createdAt}`,
          kind: "file",
          message: `已应用文件修改: ${file.relativePath}`,
          createdAt
        }
      ])
    );
  }

  // 丢弃单个待审查变更, 不触碰真实项目文件
  function discardProjectFileChange(relativePath: string): void {
    const reviewedPreview = changePreviews.find((preview) => preview.relativePath === relativePath);
    setChangePreviews((current) => removeFileChangePreview(current, relativePath));

    if (!reviewedPreview) {
      return;
    }

    if (reviewedPreview.source) {
      markFileChangeSourceDiscarded(reviewedPreview.source, relativePath);
      return;
    }

    if (!selectedThreadId) {
      return;
    }

    const createdAt = new Date().toISOString();

    setThreads((current) =>
      appendThreadEvents(current, selectedThreadId, [
        {
          id: `${selectedThreadId}-file-discard-${createdAt}`,
          kind: "file",
          message:
            settings.language === "zh-CN"
              ? `已丢弃文件修改 ${relativePath}`
              : `Discarded file change ${relativePath}`,
          createdAt
        }
      ])
    );
  }

  // 按顺序应用全部变更, 任一失败都停下并提示用户
  async function applyAllProjectFileChanges(): Promise<void> {
    if (!currentProject || changePreviews.length === 0) {
      return;
    }

    const appliedPreviews = [...changePreviews];
    const appliedSources = listFileChangePreviewSources(appliedPreviews);
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
    }

    setChangePreviews([]);
    void refreshProjectGitStatus();

    if (appliedSources.length > 0) {
      for (const source of appliedSources) {
        markFileChangeSourceApplied(source, source.actionLabel);
      }
    }

    if (!selectedThreadId) {
      return;
    }

    const createdAt = new Date().toISOString();
    setThreads((current) =>
      appendThreadEvents(current, selectedThreadId, [
        {
          id: `${selectedThreadId}-file-write-all-${createdAt}`,
          kind: "file",
          message: `已应用 ${appliedPreviews.length} 个文件修改`,
          createdAt
        }
      ])
    );
  }

  // 清空全部待审查变更, 用于用户决定重做方案
  function discardAllProjectFileChanges(): void {
    const discardedSources = listFileChangePreviewSources(changePreviews);

    setChangePreviews([]);

    for (const source of discardedSources) {
      markFileChangeSourceDiscarded(source, source.actionLabel);
    }
  }

  // 应用待审查变更后把来源 Agent 动作标记完成, 让后续安全步骤继续推进
  function markFileChangeSourceApplied(source: FileChangePreviewSource, subject: string): void {
    const createdAt = new Date().toISOString();

    setThreads((current) =>
      updateThreadAgentActionStatus(
        appendThreadEvents(current, source.threadId, [
          {
            id: `${source.threadId}-file-source-applied-${source.actionId}-${createdAt}`,
            kind: "file",
            message: `已应用 Agent 文件修改: ${subject}`,
            createdAt
          }
        ]),
        source.threadId,
        source.actionId,
        "completed"
      )
    );
  }

  // 丢弃整份待审查变更时阻塞来源动作, 避免后续验证在没有落盘修改时继续跑
  function markFileChangeSourceDiscarded(source: FileChangePreviewSource, subject: string): void {
    const createdAt = new Date().toISOString();

    setThreads((current) =>
      updateThreadAgentActionStatus(
        appendThreadEvents(
          current,
          source.threadId,
          [
            {
              id: `${source.threadId}-file-source-discarded-${source.actionId}-${createdAt}`,
              kind: "error",
              message: `已丢弃 Agent 文件修改: ${subject}`,
              createdAt
            }
          ],
          "blocked"
        ),
        source.threadId,
        source.actionId,
        "failed"
      )
    );
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
      (targetThreadId ? threads.find((thread) => thread.id === targetThreadId) : null) ??
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
      const memories = selectRelevantAgentMemories(
        agentMemories,
        currentProject.path,
        8,
        `${selectedThread.prompt} ${options.action?.label ?? ""} ${relativePath} ${currentContent.slice(0, 1200)}`
      );

      setThreads((current) => attachThreadMemoryContext(current, selectedThread.id, memories));

      const result = await window.forge.agent.generateFileChange({
        provider,
        model,
        intelligence: selectedThread.intelligence,
        agentProfile: getActiveAgentProfileContext(agentProfiles),
        memories,
        personalization: createPersonalizationPrompt(personalization),
        projectScan: projectScanResult,
        speed: selectedThread.speed,
        taskPrompt: createFileChangeTaskPrompt(selectedThread, relativePath, options.action),
        relativePath,
        currentContent
      });
      const preview = await window.forge.files.previewTextUpdate({
        projectRoot: currentProject.path,
        relativePath,
        nextContent: result.nextContent
      });
      const sourcedPreview = attachFileChangePreviewSource(preview, options.source ?? null);

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
        setChangePreviews((current) => removeFileChangePreview(current, sourcedPreview.relativePath));
        void refreshProjectGitStatus();
        setThreads((current) =>
          appendThreadEvents(current, selectedThread.id, [
            {
              id: `${selectedThread.id}-agent-file-applied-${result.createdAt}`,
              kind: "file",
              message: `已自动应用文件修改: ${writtenFile.relativePath}`,
              createdAt: result.createdAt
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
  function submitTask(prompt: string): void {
    const activeThread = selectedThreadId
      ? (threads.find((thread) => thread.id === selectedThreadId) ?? null)
      : null;

    if (isDirectAnswerPrompt(prompt)) {
      const result = createThreadFromSettings(settings, prompt);

      if (!result.ok) {
        setTaskNotice(
          result.reason === "empty-prompt" ? t("composer.emptyPrompt") : t("composer.missingModel")
        );
        return;
      }

      if (activeThread && activeThread.status !== "running") {
        const selectedModel = settings.models.find((model) => model.id === result.thread.modelId);
        const selectedProvider = selectedModel
          ? settings.providers.find((provider) => provider.id === selectedModel.providerId)
          : null;
        const createdAt = new Date().toISOString();

        setTaskNotice(null);
        cancelledThreadIdsRef.current.delete(activeThread.id);
        setThreads((current) =>
          appendThreadFollowUpPrompt(
            current,
            activeThread.id,
            {
              id: `${activeThread.id}-user-${createdAt}`,
              message: prompt,
              createdAt
            }
          )
        );
        rememberPromptIfNeeded(
          activeThread.id,
          prompt,
          getProjectScanForThread(activeThread)?.rootPath ?? activeThread.projectPath ?? null
        );

        if (!selectedModel || !selectedProvider) {
          appendThreadError(activeThread.id, "未找到当前模型或提供商配置");
          return;
        }

        void generateAskResponse({
          threadId: activeThread.id,
          prompt,
          model: selectedModel,
          provider: selectedProvider,
          projectScan: getProjectScanForThread(activeThread),
          conversation: createThreadConversation(activeThread)
        });
        return;
      }

      const askThread: TaskThread = {
        ...result.thread,
        projectPath: currentProject?.path ?? null,
        status: "running",
        events: []
      };
      const selectedModel = settings.models.find((model) => model.id === result.thread.modelId);
      const selectedProvider = selectedModel
        ? settings.providers.find((provider) => provider.id === selectedModel.providerId)
        : null;

      setTaskNotice(null);
      cancelledThreadIdsRef.current.delete(result.thread.id);
      setThreads((current) => [askThread, ...current]);
      setSelectedThreadId(result.thread.id);
      rememberPromptIfNeeded(result.thread.id, prompt, currentProject?.path ?? null);

      if (!selectedModel || !selectedProvider) {
        appendThreadError(result.thread.id, "未找到当前模型或提供商配置");
        return;
      }

      void generateAskResponse({
        threadId: result.thread.id,
        prompt: result.thread.prompt,
        model: selectedModel,
        provider: selectedProvider,
        projectScan: currentProject ? projectScanResult : null
      });
      return;
    }

    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      return;
    }

    if (!projectScanResult) {
      setTaskNotice(t("projects.scanning"));
      return;
    }

    const activeProjectThread =
      activeThread && activeThread.status !== "running" && activeThread.projectPath === currentProject.path
        ? activeThread
        : null;

    const result = createThreadFromSettings(settings, prompt);

    if (!result.ok) {
      setTaskNotice(
        result.reason === "empty-prompt" ? t("composer.emptyPrompt") : t("composer.missingModel")
      );
      return;
    }

    if (activeProjectThread) {
      const selectedModel = settings.models.find((model) => model.id === result.thread.modelId);
      const selectedProvider = selectedModel
        ? settings.providers.find((provider) => provider.id === selectedModel.providerId)
        : null;
      const createdAt = new Date().toISOString();

      setTaskNotice(null);
      cancelledThreadIdsRef.current.delete(activeProjectThread.id);
      setThreads((current) =>
        appendThreadFollowUpPrompt(current, activeProjectThread.id, {
          id: `${activeProjectThread.id}-user-${createdAt}`,
          message: prompt,
          createdAt
        })
      );

      if (!selectedModel || !selectedProvider) {
        appendThreadError(activeProjectThread.id, "未找到当前模型或提供商配置");
        return;
      }

      void generateThreadPlan({
        threadId: activeProjectThread.id,
        taskPrompt: prompt,
        model: selectedModel,
        provider: selectedProvider,
        projectScan: projectScanResult
      });
      return;
    }

    setTaskNotice(null);
    cancelledThreadIdsRef.current.delete(result.thread.id);
    const projectThread: TaskThread = {
      ...result.thread,
      // 项目任务直接等待真实模型输出, 不再插入静态计划模板
      status: "running",
      projectPath: currentProject.path
    };
    const selectedModel = settings.models.find((model) => model.id === projectThread.modelId);
    const selectedProvider = selectedModel
      ? settings.providers.find((provider) => provider.id === selectedModel.providerId)
      : null;

    setThreads((current) => [projectThread, ...current]);
    setSelectedThreadId(projectThread.id);

    if (!selectedModel || !selectedProvider) {
      appendThreadError(projectThread.id, "未找到当前模型或提供商配置");
      return;
    }

    void generateThreadPlan({
      threadId: projectThread.id,
      taskPrompt: projectThread.prompt,
      model: selectedModel,
      provider: selectedProvider,
      projectScan: projectScanResult
    });
  }

  // 为线程请求 Agent 计划, 生成动作队列前先注入当前记忆
  async function generateThreadPlan({
    threadId,
    taskPrompt,
    model,
    provider,
    projectScan
  }: {
    threadId: string;
    taskPrompt: string;
    model: ForgeModel;
    provider: ForgeProvider;
    projectScan: ProjectScanResult;
  }): Promise<void> {
    try {
      const memories = selectRelevantAgentMemories(agentMemories, projectScan.rootPath, 8, taskPrompt);

      setThreads((current) => attachThreadMemoryContext(current, threadId, memories));

      const plan = await window.forge.agent.generatePlan({
        provider,
        model,
        intelligence: settings.intelligence,
        agentProfile: getActiveAgentProfileContext(agentProfiles),
        memories,
        personalization: createPersonalizationPrompt(personalization),
        speed: settings.speed,
        taskPrompt,
        projectScan
      });

      if (cancelledThreadIdsRef.current.has(threadId)) {
        return;
      }

      recordUsageEvent({
        kind: "plan",
        providerId: plan.providerId,
        modelId: plan.modelId,
        usage: plan.usage,
        createdAt: plan.createdAt
      });
      const agentActions = createAgentActionsFromPlanSteps(plan.steps ?? []);
      const runnableAgentActions = getRunnablePendingAgentActions(agentActions, {
        fullAccess: fullAccessMode,
        rules: generalPreferences.commandSafetyRules
      });
      const planMessage =
        runnableAgentActions.length > 0
          ? settings.language === "zh-CN"
            ? "已生成执行计划, Forge 正在准备自动执行安全步骤。"
            : "Execution plan created. Forge will auto-run safe steps."
          : agentActions.length > 0
            ? settings.language === "zh-CN"
              ? "已生成执行计划, 但下一步需要你先确认。"
              : "Execution plan created, but the next step needs your review."
          : settings.language === "zh-CN"
            ? "已生成执行计划, 但没有可执行步骤。"
            : "Execution plan created, but no executable steps were found.";
      setThreads((current) =>
        attachThreadAgentActions(
          appendThreadEvents(
            current,
            threadId,
            [
              {
                id: `${threadId}-plan-ready-${plan.createdAt}`,
                kind: "plan",
                message: planMessage,
                createdAt: plan.createdAt
              }
            ],
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
    }
  }

  // 基于失败结果生成修复计划, 把错误上下文重新喂给模型
  async function generateFailureFixPlan(
    threadId: string,
    action: AgentAction,
    commandResultOverride: CommandRunResult | null = null
  ): Promise<void> {
    const thread = threads.find((candidate) => candidate.id === threadId);

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
    setTaskNotice(null);
    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [
          {
            id: `${threadId}-failure-fix-${action.id}-${createdAt}`,
            kind: "plan",
            message:
              settings.language === "zh-CN"
                ? `正在根据失败动作生成修复计划: ${action.label}`
                : `Generating a fix plan for failed action: ${action.label}`,
            createdAt
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

  // 按线程所属项目取得扫描结果, 缺失时回退到当前项目扫描
  function getProjectScanForThread(thread: TaskThread): ProjectScanResult | null {
    if (!currentProject || !projectScanResult) {
      return null;
    }

    if (!thread.projectPath || thread.projectPath === currentProject.path) {
      return projectScanResult;
    }

    return null;
  }

  // 解析线程项目路径, 优先使用线程快照避免当前项目切换造成串线
  function getThreadProjectPath(threadId: string): string | null {
    const thread = threads.find((candidate) => candidate.id === threadId) ?? null;

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
    projectScan,
    conversation
  }: {
    threadId: string;
    prompt: string;
    model: ForgeModel;
    provider: ForgeProvider;
    projectScan?: ProjectScanResult | null;
    conversation?: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<void> {
    const memories = selectRelevantAgentMemories(agentMemories, projectScan?.rootPath ?? null, 8, prompt);
    const request = {
      provider,
      model,
      intelligence: settings.intelligence,
      agentProfile: getActiveAgentProfileContext(agentProfiles),
      memories,
      personalization: createPersonalizationPrompt(personalization),
      conversation,
      projectScan,
      speed: settings.speed,
      prompt
    };
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
    const activeAskStreamRequestId = activeAskStreamRequestIdsRef.current.get(selectedThreadId);

    if (activeAskStreamRequestId) {
      void window.forge.agent.cancelAskStream(activeAskStreamRequestId);
    }

    cancelledThreadIdsRef.current.add(selectedThreadId);
    setThreads((current) =>
      cancelThread(current, selectedThreadId, {
        createdAt,
        message: settings.language === "zh-CN" ? "已终止" : "Stopped"
      })
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
    if (!usage) {
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

  // 执行单个 Agent 动作, 失败时保留可恢复的结果说明
  async function runAgentAction(
    threadId: string,
    action: AgentAction,
    options: { approvedCommand?: boolean } = {}
  ): Promise<AgentActionRunOutcome> {
    const activeAgentProfile = activeAgentProfileContext;
    const permission = resolveAgentActionPermission(action, activeAgentProfile);

    if (!permission.ok) {
      const createdAt = new Date().toISOString();
      const message = formatAgentPermissionDenied(
        settings.language,
        activeAgentProfile.name,
        permission.tool
      );

      updateAgentActionStatus(threadId, action.id, "failed");
      setTaskNotice(message);
      setThreads((current) =>
        appendThreadEvents(current, threadId, [
          {
            id: `${threadId}-permission-denied-${action.id}-${createdAt}`,
            kind: "error",
            message,
            createdAt
          }
        ], "blocked")
      );
      return "failed";
    }

    const execution = resolveAgentActionExecution(action);

    if (execution.kind === "manual-gate") {
      const createdAt = new Date().toISOString();
      setTaskNotice(
        settings.language === "zh-CN"
          ? "需要先完成审查门禁, Forge 不会自动越过人工确认"
          : "Manual review is required before Forge can continue."
      );
      setThreads((current) =>
        appendThreadEvents(current, threadId, [
          {
            id: `${threadId}-manual-gate-${action.id}-${createdAt}`,
            kind: "plan",
            message:
              settings.language === "zh-CN"
                ? `等待人工审查: ${action.label}`
                : `Waiting for manual review: ${action.label}`,
            createdAt
          }
        ])
      );
      return "pending";
    }

    updateAgentActionStatus(threadId, action.id, "running");

    if (execution.kind === "open-file") {
      return await openAgentFileAction(threadId, action, execution.relativePath);
    } else if (execution.kind === "generate-file-change") {
      return await generateAgentFileChangeAction(threadId, action, execution.relativePath);
    } else if (execution.kind === "run-command") {
      const commandRisk = resolveAgentCommandRisk(execution.command, {
        fullAccess: fullAccessMode,
        rules: generalPreferences.commandSafetyRules
      });

      if (commandRisk.level === "deny") {
        return blockAgentCommandAction(
          threadId,
          action,
          formatAgentCommandDenied(
            settings.language,
            formatAgentCommandRiskReason(settings.language, commandRisk.reason)
          ),
          "failed"
        );
      }

      if (commandRisk.level === "ask" && !fullAccessMode && !options.approvedCommand) {
        return blockAgentCommandAction(
          threadId,
          action,
          formatAgentCommandNeedsApproval(
            settings.language,
            execution.command,
            formatAgentCommandRiskReason(settings.language, commandRisk.reason)
          ),
          "pending"
        );
      }

      return await runThreadCommand(threadId, execution.command, action.id);
    }

    updateAgentActionStatus(threadId, action.id, "completed");
    return "completed";
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
      const commandRisk = resolveAgentCommandRisk(command, {
        fullAccess: fullAccessMode,
        rules: generalPreferences.commandSafetyRules
      });

      if (commandRisk.level === "ask") {
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
                reason: commandRisk.reason,
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
  async function runAgentActions(threadId: string, actions: AgentAction[]): Promise<void> {
    await runAgentActionBatch(actions, (action) => runAgentAction(threadId, action));
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
      let file: ProjectTextFile;

      try {
        file = await window.forge.files.readText({
          projectRoot: currentProject.path,
          relativePath
        });
      } catch (error) {
        if (!isMissingProjectFileError(error)) {
          throw error;
        }

        file = createEmptyProjectTextFile(relativePath);
      }

      setPreviewFile(file);
      setFileFormatterMode(getDefaultCodeFormatterMode(file.relativePath));

      const generated = await generateProjectFileChange(file.relativePath, file.content, threadId, {
        action,
        autoApply: fullAccessMode,
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

      if (fullAccessMode) {
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
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, action.id, "failed");
      return "failed";
    }

    try {
      await previewProjectFile(relativePath);
      updateAgentActionStatus(threadId, action.id, "completed");
      return "completed";
    } catch (error) {
      const thread = threads.find((candidate) => candidate.id === threadId) ?? null;

      if (
        thread?.agentActions &&
        isMissingProjectFileError(error) &&
        shouldTreatMissingInspectAsNewFile(action, thread.agentActions)
      ) {
        const file = createEmptyProjectTextFile(relativePath);
        const createdAt = new Date().toISOString();

        setPreviewFile(file);
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
        [createCommandStartedEvent({ threadId, command, runId })],
        "running"
      )
    );

    try {
      const result = await window.forge.commands.run({
        runId,
        projectRoot: currentProject.path,
        cwd: currentProject.path,
        command,
        timeoutMs: 120000
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
          [createCommandFinishedEvent({ threadId, result })],
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

  // 渲染无会话首页, 保持 Codex 风格的轻量输入入口
  function renderNewConversationView(): ReactElement {
    return (
      <section className="flex h-full min-h-0 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[760px] -translate-y-[5vh]">
          <h1 className="mb-5 overflow-visible whitespace-nowrap pb-2 text-center text-[22px] font-medium leading-[1.28] tracking-normal text-[#202123] md:text-[24px]">
            <span key={heroPromptIndex} className="inline-block max-w-full animate-[forge-title-swap_900ms_ease-in-out] truncate align-baseline">
              {activeHeroPrompts[heroPromptIndex]}
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
    const activeThread = selectedThreadId
      ? (threads.find((thread) => thread.id === selectedThreadId) ?? null)
      : null;

    return (
      <TaskComposer
        busy={activeThread?.status === "running"}
        settings={settings}
        generalPreferences={generalPreferences}
        focusSignal={composerFocusSignal}
        placeholder={variant === "hero" ? t("composer.heroPlaceholder") : undefined}
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
    const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
    const workspaceProjectPath = selectedThread?.projectPath ?? currentProject?.path ?? null;
    const visibleWorkspaceThreads = threads.filter(
      (thread) =>
        !thread.archived &&
        (workspaceProjectPath ? thread.projectPath === workspaceProjectPath : !thread.projectPath)
    );

    return (
      <ThreadWorkspace
        compact
        language={settings.language}
        hasProject={Boolean(currentProject) || Boolean(selectedThread)}
        selectedThreadId={selectedThreadId}
        threads={visibleWorkspaceThreads}
        commandSafetyRules={generalPreferences.commandSafetyRules}
        fullAccess={fullAccessMode}
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
        onGenerateFailureFix={(threadId, action) => void generateFailureFixPlan(threadId, action)}
        onGenerateCommandFix={(threadId, result) => void generateCommandFixPlan(threadId, result)}
        onCompleteAgentAction={(threadId, action) =>
          updateAgentActionStatus(threadId, action.id, "completed")
        }
        onOpenSourceControl={() => setActiveView("source")}
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
      />
    );
  }

  // 渲染项目文件阅读页, 只有一种格式化模式时禁用下拉
  function renderFilesView(): ReactElement {
    const previewContent = formattedPreview?.content ?? previewFile?.content ?? "";
    const formatterMessage =
      fileFormatterMode === "rendered"
        ? settings.language === "zh-CN"
          ? "Markdown 渲染预览"
          : "Rendered Markdown preview"
        : formatPreviewStatus(formattedPreview, settings.language);
    const formatterOptions: Array<{ value: CodeFormatterMode; label: string }> = previewFile
      ? getAvailableCodeFormatterModes(previewFile.relativePath).map((mode) => ({
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
              {(projectScanResult?.files ?? []).slice(0, 80).map((file) => (
                <button
                  key={file.relativePath}
                  type="button"
                  onClick={() => void previewProjectFile(file.relativePath)}
                  className={`block w-full truncate rounded-[12px] px-3 py-2 text-left text-[12px] ${
                    previewFile?.relativePath === file.relativePath
                      ? "bg-[#ececf1] text-[#202123]"
                      : "text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
                  }`}
                >
                  {file.relativePath}
                </button>
              ))}
            </div>
            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-4">
              {previewFile ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-[#202123]">
                        {previewFile.relativePath}
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-[#8e8ea0]">
                        {formatterMessage}
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
                  <FilePreviewRenderer
                    content={previewContent}
                    mode={fileFormatterMode}
                    path={previewFile.relativePath}
                  />
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
                <label className="grid gap-2 text-sm text-[#6e6e80]">
                  {t("projects.commitMessage")}
                  <input
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.currentTarget.value)}
                    className="h-10 rounded-[14px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition focus:border-[#202123]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void commitCurrentProject(commitMessage)}
                  disabled={!gitStatus?.isRepo || changedFiles.length === 0}
                  className="mt-3 h-10 w-full rounded-[14px] bg-[#202123] text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#ececf1] disabled:text-[#8e8ea0]"
                >
                  {t("projects.commit")}
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
                <pre className="h-[calc(100%-58px)] min-h-[520px] overflow-auto bg-[#fafafa] p-4 font-mono text-[10px] leading-5 text-[#202123]">
                  {renderDiffPreview(selectedChange.diff)}
                </pre>
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
        <SettingsPanel
          settings={settings}
          agentMemories={agentMemories}
          agentProfiles={agentProfiles}
          generalPreferences={generalPreferences}
          keyStatuses={keyStatuses}
          archivedThreads={threads.filter((thread) => thread.archived)}
          onClearAgentMemories={() => setAgentMemories([])}
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
            setUsageRates((current) => ({ ...current, [providerId]: rate }))
          }
        />
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
      onNavigate={setActiveView}
      onNewTask={() => {
        setActiveView("workspace");
        setSelectedThreadId(null);
        setComposerFocusSignal((current) => current + 1);
      }}
      onNewProjectChat={(projectPath) => {
        selectProject(projectPath);
        setSelectedThreadId(null);
        setComposerFocusSignal((current) => current + 1);
      }}
      onRun={() => {
        setActiveView("workspace");
        setComposerSubmitSignal((current) => current + 1);
      }}
      onMinimizeWindow={() => void window.forge.windowControls.minimize()}
      onToggleMaximizeWindow={() => void window.forge.windowControls.toggleMaximize()}
      onPickProject={() => void pickProject()}
      onRemoveProject={removeProjectRecord}
      onRenameProject={renameProject}
      onSelectProject={selectProject}
      onSelectThread={(threadId) => {
        const thread = threads.find((candidate) => candidate.id === threadId);

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

// 把当前线程历史压成模型对话, 用户和输出事件按顺序保留
function createThreadConversation(
  thread: TaskThread
): Array<{ role: "user" | "assistant"; content: string }> {
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: thread.prompt }
  ];

  for (const event of thread.events) {
    if (event.kind === "user") {
      turns.push({ role: "user", content: event.message });
    } else if (event.kind === "result") {
      turns.push({ role: "assistant", content: event.message });
    }
  }

  return turns;
}

// 把运行时错误收敛成一行中文提示, 隐藏 HTML 响应噪音
function formatAgentRuntimeError(
  language: Language,
  kind: "file" | "command",
  message: string
): string {
  const detail = formatRuntimeError(language, message);

  if (language === "zh-CN") {
    return `${kind === "file" ? "文件动作" : "命令执行"}失败: ${detail}`;
  }

  return `${kind === "file" ? "File action" : "Command execution"} failed: ${detail}`;
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

    return `Agent 配置 ${profileName} 未允许${toolLabel}`;
  }

  return `Agent profile ${profileName} does not allow ${tool} actions`;
}

// 将命令风险提示转成用户可读文案
function formatAgentCommandDenied(language: Language, reason: string): string {
  if (language === "zh-CN") {
    return `命令已被安全策略拒绝: ${reason}`;
  }

  return `Command denied by safety policy: ${reason}`;
}

// 将需要确认的命令提示转成用户可读文案
function formatAgentCommandNeedsApproval(
  language: Language,
  command: string,
  reason: string
): string {
  if (language === "zh-CN") {
    return `命令需要完全访问权限确认: ${command} (${reason})`;
  }

  return `Command requires full access confirmation: ${command} (${reason})`;
}

// 用时间和随机数生成命令运行 id, 避免并发命令串流
function createCommandRunId(threadId: string): string {
  return `${threadId}-command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
function renderDiffPreview(diff: string): ReactElement[] {
  const lines = diff.split(/\r?\n/);
  const visibleLines = lines.slice(0, 600);
  const truncated = lines.length > visibleLines.length;
  const renderedLines = visibleLines.map((line, index) => (
    <span key={`${index}-${line}`} className={`block whitespace-pre ${getDiffLineClass(line)}`}>
      {line || " "}
    </span>
  ));

  if (truncated) {
    renderedLines.push(
      <span key="diff-truncated" className="block whitespace-pre text-[#8e8ea0]">
        ... diff truncated
      </span>
    );
  }

  return renderedLines;
}

// 根据 diff 前缀返回行样式, 不在渲染处散落判断
function getDiffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-[#eefaf3] text-[#087443]";
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return "bg-[#fff1f2] text-[#b42318]";
  }

  if (line.startsWith("@@")) {
    return "bg-[#f0f5ff] text-[#3451b2]";
  }

  if (line.startsWith("diff --git")) {
    return "font-semibold text-[#202123]";
  }

  return "text-[#565869]";
}

// 把 Git 状态字母翻译成中文状态
function formatGitStatus(status: string, language: Language): string {
  if (status === "??") {
    return language === "zh-CN" ? "未跟踪" : "new";
  }

  if (status.includes("D")) {
    return language === "zh-CN" ? "已删除" : "deleted";
  }

  if (status.includes("R")) {
    return language === "zh-CN" ? "已重命名" : "renamed";
  }

  if (status.includes("A")) {
    return language === "zh-CN" ? "已新增" : "added";
  }

  return language === "zh-CN" ? "已修改" : "modified";
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
