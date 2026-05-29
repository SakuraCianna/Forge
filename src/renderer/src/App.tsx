import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import type { ProjectGitStatus } from "@shared/gitTypes";
import type { ForgeModel, ForgeProvider, Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import { AppShell, type WorkbenchView } from "@/components/AppShell";
import { ProjectMissingNotice } from "@/components/ProjectMissingNotice";
import { SettingsPanel, type ProviderFetchState } from "@/components/SettingsPanel";
import { TaskComposer, type ComposerContextMode } from "@/components/TaskComposer";
import { ThreadWorkspace } from "@/components/ThreadWorkspace";
import { createCommandFinishedEvent, createCommandStartedEvent } from "@/agent/commandEvents";
import { createInitialPlanEvents } from "@/agent/initialPlanner";
import { useI18n } from "@/i18n/useI18n";
import { removeFileChangePreview, upsertFileChangePreview } from "@/state/fileChanges";
import {
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
  appendThreadEvents,
  archiveAllThreads,
  archiveProjectThreads,
  archiveThread,
  createThreadFromSettings,
  restoreThread,
  toggleThreadPinned,
  type TaskThread
} from "@/state/taskThreads";
import {
  appendUsageEvent,
  createUsageEvent,
  loadUsageEvents,
  loadUsageRates,
  saveUsageEvents,
  saveUsageRates,
  type UsageRateMap
} from "@/state/usage";
import {
  formatCodePreview,
  type CodeFormatResult,
  type CodeFormatterMode
} from "@/state/codeFormatting";
import {
  createDefaultGeneralPreferences,
  loadGeneralPreferences,
  saveGeneralPreferences,
  type GeneralPreferences
} from "@/state/generalPreferences";
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
  const [composerContextMode, setComposerContextMode] = useState<ComposerContextMode>("project");
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
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [composerSubmitSignal, setComposerSubmitSignal] = useState(0);
  const [activeView, setActiveView] = useState<WorkbenchView>("workspace");
  const [heroPromptIndex, setHeroPromptIndex] = useState(0);
  const { t } = useI18n(settings.language);
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
          message: error instanceof Error ? error.message : String(error)
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
    setComposerContextMode("project");
  }

  function selectProject(projectPath: string): void {
    const project = recentProjects.find((candidate) => candidate.path === projectPath);

    if (!project) {
      return;
    }

    setMissingProjectPath(null);
    setCurrentProject(project);
    setRecentProjects((current) => addRecentProject(current, { ...project, openedAt: new Date().toISOString() }));
    setComposerContextMode("project");
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
    setComposerContextMode("project");
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
    currentContent: string
  ): Promise<void> {
    if (!currentProject) {
      return;
    }

    const selectedThread =
      threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;

    if (!selectedThread) {
      return;
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
    } catch (error) {
      appendThreadError(
        selectedThread.id,
        `模型文件修改失败: ${error instanceof Error ? error.message : String(error)}`
      );
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
    if (composerContextMode === "ask") {
      const result = createThreadFromSettings(settings, prompt);

      if (!result.ok) {
        setTaskNotice(
          result.reason === "empty-prompt" ? t("composer.emptyPrompt") : t("composer.missingModel")
        );
        return;
      }

      const askThread: TaskThread = {
        ...result.thread,
        mode: "ask",
        projectPath: null,
        status: "running",
        events: [
          {
            id: `${result.thread.id}-ask-started`,
            kind: "plan",
            message: settings.language === "zh-CN" ? "ASK 对话已创建, 正在生成回答" : "ASK chat created. Generating an answer.",
            createdAt: result.thread.createdAt
          }
        ]
      };
      const selectedModel = settings.models.find((model) => model.id === result.thread.modelId);
      const selectedProvider = selectedModel
        ? settings.providers.find((provider) => provider.id === selectedModel.providerId)
        : null;

      setTaskNotice(null);
      setThreads((current) => [askThread, ...current]);
      setSelectedThreadId(result.thread.id);

      if (!selectedModel || !selectedProvider) {
        appendThreadError(result.thread.id, "未找到当前模型或提供商配置");
        return;
      }

      void generateAskResponse({
        threadId: result.thread.id,
        prompt: result.thread.prompt,
        model: selectedModel,
        provider: selectedProvider
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

    const result = createThreadFromSettings(settings, prompt);

    if (!result.ok) {
      setTaskNotice(
        result.reason === "empty-prompt" ? t("composer.emptyPrompt") : t("composer.missingModel")
      );
      return;
    }

    setTaskNotice(null);
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
        personalization: createPersonalizationPrompt(personalization),
        speed: settings.speed,
        taskPrompt,
        projectScan
      });

      recordUsageEvent({
        kind: "plan",
        providerId: plan.providerId,
        modelId: plan.modelId,
        usage: plan.usage,
        createdAt: plan.createdAt
      });
      setThreads((current) =>
        appendThreadEvents(current, threadId, [
          {
            id: `${threadId}-agent-plan-${plan.createdAt}`,
            kind: "plan",
            message: plan.text,
            createdAt: plan.createdAt
          }
        ])
      );
    } catch (error) {
      appendThreadError(
        threadId,
        `模型计划生成失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function generateAskResponse({
    threadId,
    prompt,
    model,
    provider
  }: {
    threadId: string;
    prompt: string;
    model: ForgeModel;
    provider: ForgeProvider;
  }): Promise<void> {
    try {
      const answer = await window.forge.agent.generateAsk({
        provider,
        model,
        intelligence: settings.intelligence,
        personalization: createPersonalizationPrompt(personalization),
        speed: settings.speed,
        prompt
      });

      recordUsageEvent({
        kind: "ask",
        providerId: answer.providerId,
        modelId: answer.modelId,
        usage: answer.usage,
        createdAt: answer.createdAt
      });
      setThreads((current) =>
        appendThreadEvents(
          current,
          threadId,
          [
            {
              id: `${threadId}-ask-${answer.createdAt}`,
              kind: "result",
              message: answer.text,
              createdAt: answer.createdAt
            }
          ],
          "completed"
        )
      );
    } catch (error) {
      appendThreadError(
        threadId,
        `ASK 对话失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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

  async function runThreadCommand(threadId: string, command: string): Promise<void> {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
      return;
    }

    setTaskNotice(null);
    setThreads((current) =>
      appendThreadEvents(current, threadId, [createCommandStartedEvent({ threadId, command })], "running")
    );

    const result = await window.forge.commands.run({
      projectRoot: currentProject.path,
      cwd: currentProject.path,
      command,
      timeoutMs: 120000
    });

    setThreads((current) =>
      appendThreadEvents(
        current,
        threadId,
        [createCommandFinishedEvent({ threadId, result })],
        result.exitCode === 0 && !result.timedOut ? "running" : "blocked"
      )
    );
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
    return (
      <TaskComposer
        settings={settings}
        contextMode={composerContextMode}
        focusSignal={composerFocusSignal}
        placeholder={variant === "hero" ? t("composer.heroPlaceholder") : undefined}
        projectName={currentProject?.name}
        projectPath={currentProject?.path}
        projects={recentProjects}
        submitSignal={composerSubmitSignal}
        variant={variant}
        onOpenSettings={() => setActiveView("settings")}
        onPickProject={() => void pickProject()}
        onSelectContextMode={setComposerContextMode}
        onSelectProject={selectProject}
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
    return (
      <ThreadWorkspace
        language={settings.language}
        hasProject={Boolean(currentProject)}
        selectedThreadId={selectedThreadId}
        threads={threads.filter((thread) => !thread.archived)}
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
        onRunCommand={(threadId, command) => void runThreadCommand(threadId, command)}
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
    const formatterMessage = formatPreviewStatus(formattedPreview, settings.language);

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
                      <span className="block truncate text-[12px] font-semibold text-[#202123]">
                        {previewFile.relativePath}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-[#8e8ea0]">
                        {formatterMessage}
                      </span>
                    </span>
                    <label className="flex shrink-0 items-center gap-2 text-[10px] text-[#6e6e80]">
                      {settings.language === "zh-CN" ? "格式化" : "Formatter"}
                      <select
                        aria-label={settings.language === "zh-CN" ? "代码格式化" : "Code formatter"}
                        value={fileFormatterMode}
                        onChange={(event) =>
                          setFileFormatterMode(event.currentTarget.value as CodeFormatterMode)
                        }
                        className="h-9 rounded-[12px] border border-[#d9d9e3] bg-white px-3 text-[10px] text-[#202123] outline-none focus:border-[#202123]"
                      >
                        <option value="raw">{settings.language === "zh-CN" ? "原始" : "Raw"}</option>
                        <option value="prettier">Prettier</option>
                      </select>
                    </label>
                  </div>
                  <pre className="min-h-0 overflow-auto whitespace-pre-wrap rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] p-4 font-mono text-[10px] leading-5 text-[#202123]">
                    {previewContent}
                  </pre>
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
          generalPreferences={generalPreferences}
          keyStatuses={keyStatuses}
          archivedThreads={threads.filter((thread) => thread.archived)}
          onDeleteProviderKey={(providerId) => void deleteProviderKey(providerId)}
          onFetchModels={(providerId, apiKey) => void fetchModels(providerId, apiKey)}
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
        setComposerContextMode("project");
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
        setSelectedThreadId(threadId);
        setActiveView("workspace");
      }}
      onTogglePinProject={togglePinnedProject}
      onTogglePinThread={(threadId) => setThreads((current) => toggleThreadPinned(current, threadId))}
    >
      {renderActiveView()}
    </AppShell>
  );
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
