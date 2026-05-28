import type { ReactElement, ReactNode } from "react";
import { ChevronDown, Hammer } from "lucide-react";
import type { Language } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";

type AppShellProps = {
  language: Language;
  sidebar: ReactNode;
  children: ReactNode;
};

export function AppShell({ language, sidebar, children }: AppShellProps): ReactElement {
  const { t } = useI18n(language);

  return (
    <div className="grid h-screen min-h-screen grid-cols-[272px_minmax(0,1fr)] overflow-hidden bg-[#f6f8fb] text-[#202124]">
      <aside className="relative flex min-h-0 flex-col border-r border-[#dde3ea] bg-[#edf3fa] px-3 py-3">
        <div className="mb-4 flex h-10 items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#151719] text-white shadow-sm">
            <Hammer className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-4 text-[#1f2328]">{t("app.name")}</div>
            <div className="mt-0.5 truncate text-[11px] leading-3 text-[#6b7280]">{t("app.tagline")}</div>
          </div>
        </div>
        <nav
          aria-label="Forge navigation"
          className="space-y-1 text-sm font-medium text-[#4b5563]"
        >
          {sidebar}
        </nav>
        <div className="mt-auto rounded-md border border-[#d6dde6] bg-white/70 p-2.5 text-xs text-[#667085] shadow-sm">
          <div className="mb-1.5 flex items-center justify-between text-[#1f2328]">
            <span className="font-medium">{t("app.localAgent")}</span>
            <span className="h-2 w-2 rounded-full bg-[#25a55b]" />
          </div>
          <div className="leading-5">{t("app.keysLocal")}</div>
          <div className="mt-3 flex items-center justify-between border-t border-[#e2e7ee] pt-2 text-[#4b5563]">
            <span>Sakura_Cianna</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>
      </aside>
      <main
        aria-label="Forge workbench"
        className="min-h-0 min-w-0 overflow-hidden bg-[#fbfcfe]"
      >
        {children}
      </main>
    </div>
  );
}
