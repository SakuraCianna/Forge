import type { ReactElement } from "react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useI18n } from "@/i18n/useI18n";
import { createDefaultModelSettings, updateModelEnabled } from "@/state/modelSettings";

export function App(): ReactElement {
  const [settings, setSettings] = useState(createDefaultModelSettings);
  const { t } = useI18n(settings.language);
  const sidebarItems = [t("nav.projects"), t("nav.threads"), t("nav.settings")];

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
        onToggleModel={(modelId, enabled) =>
          setSettings((current) => updateModelEnabled(current, modelId, enabled))
        }
      />
    </AppShell>
  );
}
