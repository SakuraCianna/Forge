import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import type { ProjectGitStatus } from "@shared/gitTypes";
import type { ForgeModel, ForgeProvider, Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import { AppShell, type WorkbenchView } from "@/components/AppShell";
import { ProjectHeader } from "@/components/ProjectHeader";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TaskComposer } from "@/components/TaskComposer";
import { ThreadWorkspace } from "@/components/ThreadWorkspace";
import { createCommandFinishedEvent, createCommandStartedEvent } from "@/agent/commandEvents";
import { createInitialPlanEvents } from "@/agent/initialPlanner";
import { useI18n } from "@/i18n/useI18n";
import { removeFileChangePreview, upsertFileChangePreview } from "@/state/fileChanges";
import {
  addManualModel,
  createDefaultModelSettings,
  loadModelSettings,
  mergeFetchedModels,
  saveModelSettings,
  setCurrentModel,
  setIntelligence,
  setLanguage,
  setSpeed,
  updateProviderBaseUrl,
  updateModelEnabled
} from "@/state/modelSettings";
import {
  addRecentProject,
  createProjectFromPath,
  loadRecentProjects,
  saveRecentProjects,
  type ForgeProject
} from "@/state/projects";
import {
  appendThreadEvents,
  createThreadFromSettings,
  type TaskThread
} from "@/state/taskThreads";

type ProviderKeyStatus = {
  hasKey: boolean;
  last4: string | null;
};

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
  const [changePreviews, setChangePreviews] = useState<ProjectFileChangePreview[]>([]);
  const [gitStatus, setGitStatus] = useState<ProjectGitStatus | null>(null);
  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [threads, setThreads] = useState<TaskThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [composerSubmitSignal, setComposerSubmitSignal] = useState(0);
  const [activeView, setActiveView] = useState<WorkbenchView>("workspace");
  const { t } = useI18n(settings.language);

  useEffect(() => {
    saveModelSettings(window.localStorage, settings);
  }, [settings]);

  useEffect(() => {
    saveRecentProjects(window.localStorage, recentProjects);
  }, [recentProjects]);

  useEffect(() => {
    if (!currentProject) {
      setProjectScanResult(null);
      setPreviewFile(null);
      setChangePreviews([]);
      setGitStatus(null);
      setGitNotice(null);
      return;
    }

    void scanProject(currentProject.path);
    void refreshProjectGitStatus(currentProject.path);
  }, [currentProject]);

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
    await refreshProviderKeyStatus(providerId);
  }

  async function fetchModels(providerId: string): Promise<void> {
    const provider = settings.providers.find((candidate) => candidate.id === providerId);

    if (!provider) {
      return;
    }

    const fetchedModels = await window.forge.models.fetchProviderModels(provider);
    setSettings((current) => mergeFetchedModels(current, fetchedModels));
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
    setCurrentProject(project);
    setRecentProjects((current) => addRecentProject(current, project));
    setActiveView("workspace");
  }

  function openMostRecentProject(): void {
    const recentProject = recentProjects[0];

    if (!recentProject) {
      void pickProject();
      return;
    }

    setCurrentProject(recentProject);
    setActiveView("workspace");
  }

  async function scanProject(projectPath: string): Promise<void> {
    const result = await window.forge.projects.scan(projectPath);
    setProjectScanResult(result);
    setPreviewFile(null);
    setChangePreviews([]);
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
    const planEvents = createInitialPlanEvents({
      threadId: result.thread.id,
      prompt: result.thread.prompt,
      speed: result.thread.speed,
      projectScan: projectScanResult
    });
    const plannedThread = appendThreadEvents([result.thread], result.thread.id, planEvents, "running")[0];
    const selectedModel = settings.models.find((model) => model.id === result.thread.modelId);
    const selectedProvider = selectedModel
      ? settings.providers.find((provider) => provider.id === selectedModel.providerId)
      : null;

    setThreads((current) => [plannedThread, ...current]);
    setSelectedThreadId(result.thread.id);

    if (!selectedModel || !selectedProvider) {
      appendThreadError(result.thread.id, "未找到当前模型或提供商配置");
      return;
    }

    void generateThreadPlan({
      threadId: result.thread.id,
      taskPrompt: result.thread.prompt,
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
        speed: settings.speed,
        taskPrompt,
        projectScan
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
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        {currentProject ? (
          <div className="px-5 pt-5">
            <ProjectHeader
              language={settings.language}
              project={currentProject}
              scanResult={projectScanResult}
              gitStatus={gitStatus}
              gitNotice={gitNotice}
              commitMessage={commitMessage}
              onCommitMessageChange={setCommitMessage}
              onCommitProject={(message) => void commitCurrentProject(message)}
              onPickProject={() => void pickProject()}
              onRefreshGitStatus={() => void refreshProjectGitStatus()}
            />
            {taskNotice ? <Notice message={taskNotice} /> : null}
          </div>
        ) : taskNotice ? (
          <div className="px-5 pt-5">
            <Notice message={taskNotice} />
          </div>
        ) : null}
        <div className={`min-h-0 px-5 pb-4 ${currentProject || taskNotice ? "" : "pt-5"}`}>
          {renderThreadWorkspace()}
        </div>
        <TaskComposer
          settings={settings}
          focusSignal={composerFocusSignal}
          submitSignal={composerSubmitSignal}
          onOpenSettings={() => setActiveView("settings")}
          onSelectModel={(modelId) => setSettings((current) => setCurrentModel(current, modelId))}
          onSelectIntelligence={(level) => setSettings((current) => setIntelligence(current, level))}
          onSelectSpeed={(speed) => setSettings((current) => setSpeed(current, speed))}
          onSubmitTask={submitTask}
        />
      </div>
    );
  }

  function renderThreadWorkspace(): ReactElement {
    return (
      <ThreadWorkspace
        language={settings.language}
        hasProject={Boolean(currentProject)}
        selectedThreadId={selectedThreadId}
        threads={threads}
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

  function renderTasksView(): ReactElement {
    return <div className="h-full min-h-0 p-5">{renderThreadWorkspace()}</div>;
  }

  function renderFilesView(): ReactElement {
    return (
      <section className="m-5 h-[calc(100%-40px)] min-h-0 overflow-hidden rounded-[20px] border border-[#ececf1] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
        <ViewHeader title={t("files.title")} description={t("files.description")} />
        {!currentProject ? (
          <EmptyAction message={t("projects.required")} action={t("projects.pick")} onClick={() => void pickProject()} />
        ) : (
          <div className="grid h-[calc(100%-86px)] min-h-0 grid-cols-[320px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-auto border-r border-[#ececf1] p-3">
              {(projectScanResult?.files ?? []).slice(0, 80).map((file) => (
                <button
                  key={file.relativePath}
                  type="button"
                  onClick={() => void previewProjectFile(file.relativePath)}
                  className={`block w-full truncate rounded-[12px] px-3 py-2 text-left text-sm ${
                    previewFile?.relativePath === file.relativePath
                      ? "bg-[#ececf1] text-[#202123]"
                      : "text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
                  }`}
                >
                  {file.relativePath}
                </button>
              ))}
            </div>
            <div className="min-h-0 overflow-auto p-4">
              {previewFile ? (
                <pre className="min-h-full whitespace-pre-wrap rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-4 font-mono text-xs leading-5 text-[#202123]">
                  {previewFile.content}
                </pre>
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

    return (
      <section className="m-5 h-[calc(100%-40px)] min-h-0 overflow-auto rounded-[20px] border border-[#ececf1] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
        <ViewHeader title={t("source.title")} description={t("source.description")} />
        {!currentProject ? (
          <EmptyAction message={t("projects.required")} action={t("projects.pick")} onClick={() => void pickProject()} />
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[18px] border border-[#ececf1] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#202123]">{t("source.changedFiles")}</h2>
                <button
                  type="button"
                  onClick={() => void refreshProjectGitStatus()}
                  className="rounded-[12px] border border-[#d9d9e3] bg-white px-3 py-1.5 text-xs text-[#202123] hover:bg-[#f7f7f8]"
                >
                  {t("projects.refreshGit")}
                </button>
              </div>
              {gitStatus?.isRepo === false ? (
                <p className="text-sm text-[#6e6e80]">{t("projects.gitNotRepo")}</p>
              ) : changedFiles.length > 0 ? (
                <div className="space-y-1">
                  {changedFiles.map((file) => (
                    <div
                      key={file}
                      className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f7f7f8] px-3 py-2 text-sm"
                    >
                      <span className="truncate text-[#202123]">{file}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#6e6e80]">{t("projects.gitClean")}</p>
              )}
            </div>
            <div className="rounded-[18px] border border-[#ececf1] bg-white p-4">
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
        )}
      </section>
    );
  }

  function renderSettingsView(): ReactElement {
    return (
      <div className="h-full min-h-0 p-5">
        <SettingsPanel
          settings={settings}
          keyStatuses={keyStatuses}
          onDeleteProviderKey={(providerId) => void deleteProviderKey(providerId)}
          onFetchModels={(providerId) => void fetchModels(providerId)}
          onAddManualModel={(providerId, modelName) =>
            setSettings((current) => addManualModel(current, providerId, modelName))
          }
          onSaveProviderKey={(providerId, apiKey) => void saveProviderKey(providerId, apiKey)}
          onSetLanguage={setInterfaceLanguage}
          onToggleModel={(modelId, enabled) =>
            setSettings((current) => updateModelEnabled(current, modelId, enabled))
          }
          onUpdateProviderBaseUrl={(providerId, baseUrl) =>
            setSettings((current) => updateProviderBaseUrl(current, providerId, baseUrl))
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

    if (activeView === "tasks") {
      return renderTasksView();
    }

    return renderWorkspaceView();
  }

  return (
    <AppShell
      language={settings.language}
      activeView={activeView}
      currentProjectName={currentProject?.name}
      currentProjectPath={currentProject?.path}
      onNavigate={setActiveView}
      onNewTask={() => {
        setActiveView("workspace");
        setComposerFocusSignal((current) => current + 1);
      }}
      onRun={() => {
        setActiveView("workspace");
        setComposerSubmitSignal((current) => current + 1);
      }}
      onPickProject={() => void pickProject()}
    >
      {renderActiveView()}
    </AppShell>
  );
}

function Notice({ message }: { message: string }): ReactElement {
  return (
    <div className="mb-3 rounded-[14px] border border-[#f4c7ab] bg-[#fff7ed] px-3 py-2 text-sm text-[#b45309]">
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
      <h1 className="text-xl font-semibold text-[#202123]">{title}</h1>
      <p className="mt-1 text-sm text-[#6e6e80]">{description}</p>
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
        <p className="mb-4 text-sm text-[#6e6e80]">{message}</p>
        <button
          type="button"
          onClick={onClick}
          className="rounded-[14px] bg-[#202123] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          {action}
        </button>
      </div>
    </div>
  );
}
