import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import type { Language } from "@shared/modelTypes";
import { AppShell } from "@/components/AppShell";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TaskComposer } from "@/components/TaskComposer";
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
  const { t } = useI18n(settings.language);
  const sidebarItems = [t("nav.projects"), t("nav.threads"), t("nav.settings")];

  useEffect(() => {
    saveModelSettings(window.localStorage, settings);
  }, [settings]);

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
        <div className="flex-1 rounded-md border border-white/10 bg-[#15161a] p-6">
          <p className="text-sm text-[#a8a29a]">{t("app.tagline")}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">{t("app.name")}</h1>
        </div>
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
      />
    </AppShell>
  );
}
