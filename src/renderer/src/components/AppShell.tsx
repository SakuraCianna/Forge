import type { ReactElement, ReactNode } from "react";
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
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-[#101114] text-[#f5f4ef]">
      <aside className="border-r border-white/10 bg-[#15161a] px-4 py-5">
        <div className="mb-8">
          <div className="text-lg font-semibold tracking-normal">{t("app.name")}</div>
          <div className="mt-1 text-xs text-[#a8a29a]">{t("app.tagline")}</div>
        </div>
        <nav className="space-y-1 text-sm text-[#d7d3ca]">{sidebar}</nav>
      </aside>
      <section className="flex min-w-0 flex-col">{children}</section>
    </div>
  );
}
