import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type { Language } from "@shared/modelTypes";
import { AppShell } from "@/components/AppShell";
import { ProjectHeader } from "@/components/ProjectHeader";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TaskComposer } from "@/components/TaskComposer";
import { ThreadWorkspace } from "@/components/ThreadWorkspace";
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
import { createThreadFromSettings, type TaskThread } from "@/state/taskThreads";

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

  function submitTask(prompt: string): void {
    if (!currentProject) {
      setTaskNotice(t("projects.required"));
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
    setThreads((current) => [result.thread, ...current]);
    setSelectedThreadId(result.thread.id);
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
          onSelectThread={setSelectedThreadId}
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
