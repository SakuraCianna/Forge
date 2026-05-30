import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import type { ProjectGitStatus } from "@shared/gitTypes";
import type { ForgeModel, ForgeProvider, Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { AgentPlanStep } from "@shared/agentTypes";
import { createAgentActionsFromPlanSteps, type AgentAction } from "@shared/agentExecutionPlan";
import { AppShell, type WorkbenchView } from "@/components/AppShell";
import { FilePreviewRenderer } from "@/components/FilePreviewRenderer";
import { InlineSelectMenu } from "@/components/InlineSelectMenu";
import { ProjectMissingNotice } from "@/components/ProjectMissingNotice";
import { SettingsPanel, type ProviderFetchState } from "@/components/SettingsPanel";
import { TaskComposer } from "@/components/TaskComposer";
import { ThreadWorkspace } from "@/components/ThreadWorkspace";
import {
  resolveAgentActionExecution,
  runAgentActionBatch,
  type AgentActionRunOutcome
} from "@/agent/agentActionExecutor";
import { createCommandFinishedEvent, createCommandStartedEvent } from "@/agent/commandEvents";
import {
  createFailureFixTaskPrompt,
  findLatestCommandResultForAction
} from "@/agent/failureFixPrompt";
import { createInitialPlanEvents } from "@/agent/initialPlanner";
import { useI18n } from "@/i18n/useI18n";
import { removeFileChangePreview, upsertFileChangePreview } from "@/state/fileChanges";
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
  appendThreadEvents,
  appendThreadFollowUpPrompt,
  appendCommandRunOutput,
  appendThreadResultDelta,
  archiveAllThreads,
  archiveProjectThreads,
  archiveThread,
  cancelThread,
  completeNextPendingAgentAction,
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
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [composerSubmitSignal, setComposerSubmitSignal] = useState(0);
  const [activeView, setActiveView] = useState<WorkbenchView>("workspace");
  const [heroPromptIndex, setHeroPromptIndex] = useState(0);
  const { t } = useI18n(settings.language);
  const cancelledThreadIdsRef = useRef<Set<string>>(new Set());
  const activeHeroPrompts = settings.language === "zh-CN" ? zhHeroPrompts : enHeroPrompts;
  const currentProjectMissing =
    Boolean(currentProject) && missingProjectPath === currentProject?.path;

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
    return window.forge.commands.onOutput((chunk) => {
      setThreads((current) => appendCommandRunOutput(current, chunk));
    });
  }, []);

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

  async function refreshProviderKeyStatus(providerId: string): Promise<void> {
    const status = await window.forge.secrets.getProviderKeyStatus(providerId);
    setKeyStatuses((current) => ({ ...current, [providerId]: status }));
  }

  async function saveProviderKey(providerId: string, apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      return;
    }

    await window.forge.secrets.saveProviderKey(providerId, apiKey.trim());
    await refreshProviderKeyStatus(providerId);
  }

  async function deleteProviderKey(providerId: string): Promise<void> {
    await window.forge.secrets.deleteProviderKey(providerId);
    setSettings((current) => removeProviderModels(current, providerId));
    await refreshProviderKeyStatus(providerId);
  }

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

  function setInterfaceLanguage(language: Language): void {
    setSettings((current) => setLanguage(current, language));
  }

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

  function removeProjectRecord(projectPath: string): void {
    setRecentProjects((current) => removeRecentProjectRecord(current, projectPath));

    if (currentProject?.path === projectPath) {
      setMissingProjectPath(null);
      setCurrentProject(null);
    }
  }

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

  function archiveProjectConversations(projectPath: string): void {
    setThreads((current) => archiveProjectThreads(current, projectPath));
  }

  function createProjectWorktree(projectPath: string): void {
    selectProject(projectPath);
    setTaskNotice(
      settings.language === "zh-CN"
        ? "永久工作树入口已记录, 后续会接入 Git worktree 自动创建"
        : "Permanent worktree action recorded. Git worktree creation will be wired next."
    );
  }

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

      setTaskNotice(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function refreshProjectGitStatus(projectPath = currentProject?.path): Promise<void> {
    if (!projectPath) {
      return;
    }

    try {
      const status = await window.forge.git.status({ projectRoot: projectPath });
      setGitStatus(status);
      setGitNotice(null);
    } catch (error) {
      setGitNotice(error instanceof Error ? error.message : String(error));
    }
  }

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
      setGitNotice(error instanceof Error ? error.message : String(error));
    }
  }

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

  async function previewProjectFileChange(relativePath: string, nextContent: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    const preview = await window.forge.files.previewTextUpdate({
      projectRoot: currentProject.path,
      relativePath,
      nextContent
    });
    setChangePreviews((current) => upsertFileChangePreview(current, preview));
  }

  async function applyProjectFileChange(relativePath: string, nextContent: string): Promise<void> {
    if (!currentProject) {
      return;
    }

    const file = await window.forge.files.writeText({
      projectRoot: currentProject.path,
      relativePath,
      nextContent
    });
    setPreviewFile(file);
    setChangePreviews((current) => removeFileChangePreview(current, relativePath));
    void refreshProjectGitStatus();

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

  function discardProjectFileChange(relativePath: string): void {
    setChangePreviews((current) => removeFileChangePreview(current, relativePath));
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
    }

    setChangePreviews([]);
    void refreshProjectGitStatus();

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

  function discardAllProjectFileChanges(): void {
    setChangePreviews([]);
  }

  async function generateProjectFileChange(
    relativePath: string,
    currentContent: string,
    threadId?: string
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
      const result = await window.forge.agent.generateFileChange({
        provider,
        model,
        intelligence: selectedThread.intelligence,
        memories: selectRelevantAgentMemories(agentMemories, currentProject.path),
        personalization: createPersonalizationPrompt(personalization),
        speed: selectedThread.speed,
        taskPrompt: selectedThread.prompt,
        relativePath,
        currentContent
      });
      const preview = await window.forge.files.previewTextUpdate({
        projectRoot: currentProject.path,
        relativePath,
        nextContent: result.nextContent
      });

      setChangePreviews((current) => upsertFileChangePreview(current, preview));
      recordUsageEvent({
        kind: "file-change",
        providerId: result.providerId,
        modelId: result.modelId,
        usage: result.usage,
        createdAt: result.createdAt
      });
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
        `模型文件修改失败: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

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
        mode: currentProject ? "project" : undefined,
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
      const planEvents = createInitialPlanEvents({
        threadId: activeProjectThread.id,
        prompt,
        speed: settings.speed,
        projectScan: projectScanResult
      });

      setTaskNotice(null);
      cancelledThreadIdsRef.current.delete(activeProjectThread.id);
      setThreads((current) =>
        appendThreadEvents(
          appendThreadFollowUpPrompt(current, activeProjectThread.id, {
            id: `${activeProjectThread.id}-user-${createdAt}`,
            message: prompt,
            createdAt
          }),
          activeProjectThread.id,
          planEvents,
          "running"
        )
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
      mode: "project",
      projectPath: currentProject.path
    };
    const planEvents = createInitialPlanEvents({
      threadId: projectThread.id,
      prompt: projectThread.prompt,
      speed: projectThread.speed,
      projectScan: projectScanResult
    });
    const plannedThread = appendThreadEvents([projectThread], projectThread.id, planEvents, "running")[0];
    const selectedModel = settings.models.find((model) => model.id === projectThread.modelId);
    const selectedProvider = selectedModel
      ? settings.providers.find((provider) => provider.id === selectedModel.providerId)
      : null;

    setThreads((current) => [plannedThread, ...current]);
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
    const startedAt = new Date().toISOString();
    setThreads((current) =>
      appendThreadEvents(current, threadId, [
        {
          id: `${threadId}-agent-plan-started-${startedAt}`,
          kind: "plan",
          message: "正在调用模型生成执行计划",
          createdAt: startedAt
        }
      ])
    );

    try {
      const plan = await window.forge.agent.generatePlan({
        provider,
        model,
        intelligence: settings.intelligence,
        memories: selectRelevantAgentMemories(agentMemories, projectScan.rootPath),
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
      setThreads((current) =>
        attachThreadAgentActions(
          appendThreadEvents(
            current,
            threadId,
            [...createAgentPlanResultEvents(threadId, plan.text, plan.steps, plan.createdAt)],
            agentActions.length > 0 ? "planned" : "completed"
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

  function getProjectScanForThread(thread: TaskThread): ProjectScanResult | null {
    if (!currentProject || !projectScanResult) {
      return null;
    }

    if (!thread.projectPath || thread.projectPath === currentProject.path) {
      return projectScanResult;
    }

    return null;
  }

  function getThreadProjectPath(threadId: string): string | null {
    const thread = threads.find((candidate) => candidate.id === threadId) ?? null;

    return thread?.projectPath ?? currentProject?.path ?? null;
  }

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
    const request = {
      provider,
      model,
      intelligence: settings.intelligence,
      memories: selectRelevantAgentMemories(agentMemories, projectScan?.rootPath ?? null),
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
    }
  }

  function cancelActiveThread(): void {
    if (!selectedThreadId) {
      return;
    }

    const createdAt = new Date().toISOString();
    cancelledThreadIdsRef.current.add(selectedThreadId);
    setThreads((current) =>
      cancelThread(current, selectedThreadId, {
        createdAt,
        message: settings.language === "zh-CN" ? "已终止" : "Stopped"
      })
    );
  }

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

  function updateAgentActionStatus(
    threadId: string,
    actionId: string,
    status: AgentAction["status"]
  ): void {
    setThreads((current) => updateThreadAgentActionStatus(current, threadId, actionId, status));
  }

  async function runAgentAction(
    threadId: string,
    action: AgentAction
  ): Promise<AgentActionRunOutcome> {
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
      return await openAgentFileAction(threadId, action.id, execution.relativePath);
    } else if (execution.kind === "generate-file-change") {
      const status = await generateAgentFileChangeAction(threadId, action.id, execution.relativePath);

      return {
        status,
        continueBatch: status !== "completed"
      };
    } else if (execution.kind === "run-command") {
      return await runThreadCommand(threadId, execution.command, action.id);
    }

    updateAgentActionStatus(threadId, action.id, "completed");
    return "completed";
  }

  async function runAgentActions(threadId: string, actions: AgentAction[]): Promise<void> {
    await runAgentActionBatch(actions, (action) => runAgentAction(threadId, action));
  }

  async function generateAgentFileChangeAction(
    threadId: string,
    actionId: string,
    relativePath: string
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, actionId, "failed");
      return "failed";
    }

    try {
      const file = await window.forge.files.readText({
        projectRoot: currentProject.path,
        relativePath
      });
      setPreviewFile(file);
      setFileFormatterMode(getDefaultCodeFormatterMode(file.relativePath));

      const generated = await generateProjectFileChange(file.relativePath, file.content, threadId);
      const status = generated ? "completed" : "failed";
      updateAgentActionStatus(threadId, actionId, status);
      return status;
    } catch (error) {
      updateAgentActionStatus(threadId, actionId, "failed");
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

  async function openAgentFileAction(
    threadId: string,
    actionId: string,
    relativePath: string
  ): Promise<AgentAction["status"]> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      updateAgentActionStatus(threadId, actionId, "failed");
      return "failed";
    }

    try {
      await previewProjectFile(relativePath);
      updateAgentActionStatus(threadId, actionId, "completed");
      return "completed";
    } catch (error) {
      updateAgentActionStatus(threadId, actionId, "failed");
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
                          {formatGitStatus(change.status)}
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

  function renderSettingsView(): ReactElement {
    return (
      <div className="h-full min-h-0 p-5">
        <SettingsPanel
          settings={settings}
          agentMemories={agentMemories}
          generalPreferences={generalPreferences}
          keyStatuses={keyStatuses}
          archivedThreads={threads.filter((thread) => thread.archived)}
          onClearAgentMemories={() => setAgentMemories([])}
          onDeleteAgentMemory={(memoryId) =>
            setAgentMemories((current) => deleteAgentMemory(current, memoryId))
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

function createAgentPlanResultEvents(
  threadId: string,
  text: string,
  steps: AgentPlanStep[] | undefined,
  createdAt: string
): Array<{ id: string; kind: "plan"; message: string; createdAt: string }> {
  if (!steps?.length) {
    return [
      {
        id: `${threadId}-agent-plan-${createdAt}`,
        kind: "plan",
        message: text,
        createdAt
      }
    ];
  }

  return steps.map((step, index) => ({
    id: `${threadId}-agent-plan-${createdAt}-${step.id}`,
    kind: "plan",
    message: `${index + 1}. ${getAgentStepKindLabel(step.kind)}: ${step.description}`,
    createdAt
  }));
}

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

function getAgentStepKindLabel(kind: AgentPlanStep["kind"]): string {
  if (kind === "inspect") {
    return "检查";
  }

  if (kind === "edit") {
    return "修改";
  }

  if (kind === "verify") {
    return "验证";
  }

  if (kind === "commit") {
    return "提交";
  }

  return "计划";
}

function formatAgentRuntimeError(
  language: Language,
  kind: "file" | "command",
  message: string
): string {
  if (language === "zh-CN") {
    return `${kind === "file" ? "文件动作" : "命令执行"}失败: ${message}`;
  }

  return `${kind === "file" ? "File action" : "Command execution"} failed: ${message}`;
}

function createCommandRunId(threadId: string): string {
  return `${threadId}-command-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function formatGitStatus(status: string): string {
  if (status === "??") {
    return "new";
  }

  if (status.includes("D")) {
    return "deleted";
  }

  if (status.includes("R")) {
    return "renamed";
  }

  if (status.includes("A")) {
    return "added";
  }

  return "modified";
}

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

function isMissingProjectError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /Project path does not exist|ENOENT|cannot find|no such file/i.test(message);
}

function formatRemoteModelError(language: Language, error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.replace(/^Error invoking remote method '[^']+':\s*/u, "");

  if (/Unexpected token '<'|<!doctype|not valid JSON|returned HTML|invalid JSON/i.test(message)) {
    return language === "zh-CN"
      ? "API 返回了 HTML 而不是 JSON, 请检查 Base URL 是否指向兼容的 /v1 接口, 以及模型 ID 是否正确"
      : "API returned HTML instead of JSON. Check the Base URL, compatible /v1 endpoint, and model ID.";
  }

  return message;
}

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
    return result.message ?? (language === "zh-CN" ? "格式化失败" : "Formatting failed");
  }

  return language === "zh-CN" ? "原始内容" : "Raw content";
}

function Notice({ message }: { message: string }): ReactElement {
  return (
    <div className="mb-3 rounded-[14px] border border-[#f4c7ab] bg-[#fff7ed] px-3 py-2 text-[12px] text-[#b45309]">
      {message}
    </div>
  );
}

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
