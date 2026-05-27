import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import type { Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import { AppShell } from "@/components/AppShell";
import { ProjectHeader } from "@/components/ProjectHeader";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TaskComposer } from "@/components/TaskComposer";
import { ThreadWorkspace } from "@/components/ThreadWorkspace";
import { createCommandFinishedEvent, createCommandStartedEvent } from "@/agent/commandEvents";
import { createInitialPlanEvents } from "@/agent/initialPlanner";
import { useI18n } from "@/i18n/useI18n";
import {
  createDefaultModelSettings,
  loadModelSettings,
  mergeFetchedModels,
  saveModelSettings,
  setCurrentModel,
  setIntelligence,
  setLanguage,
  setSpeed,
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
  const [changePreview, setChangePreview] = useState<ProjectFileChangePreview | null>(null);
  const [threads, setThreads] = useState<TaskThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const { t } = useI18n(settings.language);
  const sidebarItems = [t("nav.projects"), t("nav.threads"), t("nav.settings")];

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
      setChangePreview(null);
      return;
    }

    void scanProject(currentProject.path);
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
  }

  async function scanProject(projectPath: string): Promise<void> {
    const result = await window.forge.projects.scan(projectPath);
    setProjectScanResult(result);
    setPreviewFile(null);
    setChangePreview(null);
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
    setChangePreview(null);
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
    setChangePreview(preview);
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
    setChangePreview(null);

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

    setThreads((current) => [plannedThread, ...current]);
    setSelectedThreadId(result.thread.id);
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

  return (
    <AppShell
      language={settings.language}
      sidebar={sidebarItems.map((item) => (
        <button
          key={item}
          className="flex h-9 w-full items-center rounded-md px-3 text-left hover:bg-white/8"
          type="button"
        >
          {item}
        </button>
      ))}
    >
      <div className="flex flex-1 flex-col px-8 py-6">
        <ProjectHeader
          language={settings.language}
          project={currentProject}
          scanResult={projectScanResult}
          onPickProject={() => void pickProject()}
        />
        {taskNotice ? (
          <div className="mb-3 rounded-md border border-[#d7b56d]/40 bg-[#3a2e18] px-3 py-2 text-sm text-[#f4d58d]">
            {taskNotice}
          </div>
        ) : null}
        <ThreadWorkspace
          language={settings.language}
          selectedThreadId={selectedThreadId}
          threads={threads}
          projectScan={projectScanResult}
          previewFile={previewFile}
          changePreview={changePreview}
          onSelectThread={setSelectedThreadId}
          onRunCommand={(threadId, command) => void runThreadCommand(threadId, command)}
          onPreviewFile={(relativePath) => void previewProjectFile(relativePath)}
          onPreviewChange={(relativePath, nextContent) =>
            void previewProjectFileChange(relativePath, nextContent)
          }
          onApplyChange={(relativePath, nextContent) =>
            void applyProjectFileChange(relativePath, nextContent)
          }
        />
      </div>
      <SettingsPanel
        settings={settings}
        keyStatuses={keyStatuses}
        onDeleteProviderKey={(providerId) => void deleteProviderKey(providerId)}
        onFetchModels={(providerId) => void fetchModels(providerId)}
        onSaveProviderKey={(providerId, apiKey) => void saveProviderKey(providerId, apiKey)}
        onSetLanguage={setInterfaceLanguage}
        onToggleModel={(modelId, enabled) =>
          setSettings((current) => updateModelEnabled(current, modelId, enabled))
        }
      />
      <TaskComposer
        settings={settings}
        onSelectModel={(modelId) => setSettings((current) => setCurrentModel(current, modelId))}
        onSelectIntelligence={(level) => setSettings((current) => setIntelligence(current, level))}
        onSelectSpeed={(speed) => setSettings((current) => setSpeed(current, speed))}
        onSubmitTask={submitTask}
      />
    </AppShell>
  );
}
