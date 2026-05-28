import type { ComponentType, ReactElement, ReactNode } from "react";
import {
  FileCode2,
  FolderOpen,
  GitBranch,
  Hammer,
  Plus,
  Settings
} from "lucide-react";
import type { Language } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";

type AppShellProps = {
  language: Language;
  activeView: WorkbenchView;
  currentProjectName?: string | null;
  currentProjectPath?: string | null;
  onNavigate: (view: WorkbenchView) => void;
  onNewTask?: () => void;
  onRun?: () => void;
  onPickProject?: () => void;
  children: ReactNode;
};

export type WorkbenchView = "workspace" | "files" | "source" | "settings";

type NavItem = {
  key: WorkbenchView;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function AppShell({
  language,
  activeView,
  currentProjectName,
  currentProjectPath,
  onNavigate,
  onNewTask,
  onPickProject,
  children
}: AppShellProps): ReactElement {
  const { t } = useI18n(language);
  const navItems: NavItem[] = [
    { key: "files", label: t("nav.files"), icon: FileCode2 },
    { key: "source", label: t("nav.sourceControl"), icon: GitBranch }
  ];

  return (
    <div className="grid h-screen min-h-screen grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-white text-[#202123]">
      <header className="grid h-12 grid-cols-[220px_minmax(0,1fr)_138px] border-b border-[#ececf1] bg-white">
        <div className="drag-region flex h-12 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#ececf1] bg-white text-[#202123] shadow-sm">
            <Hammer className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-normal text-[#202123]">Forge</span>
        </div>

        <div className="drag-region h-12" aria-hidden="true" />
        <div className="drag-region h-12" aria-hidden="true" />
      </header>

      <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[#ececf1] bg-[#f7f7f8] p-3">
          <button
            type="button"
            onClick={() => {
              if (onNewTask) {
                onNewTask();
              } else {
                onNavigate("workspace");
              }
            }}
            className="mb-2 flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm text-[#202123] transition hover:bg-[#ececf1] active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            <span className="truncate">{t("nav.newChat")}</span>
          </button>

          <nav aria-label="Forge navigation" className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                className={`flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm transition active:scale-[0.99] ${
                  activeView === item.key
                    ? "bg-[#ececf1] text-[#202123]"
                    : "text-[#565869] hover:bg-[#ececf1] hover:text-[#202123]"
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-5 px-3 text-xs text-[#8e8ea0]">{t("nav.projects")}</div>
          <button
            type="button"
            onClick={onPickProject}
            className="mt-2 flex h-11 items-center gap-2 rounded-[12px] px-3 text-left text-sm text-[#565869] transition hover:bg-[#ececf1] hover:text-[#202123] active:scale-[0.99]"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-[#202123]">
                {currentProjectName ?? t("projects.empty")}
              </span>
              <span className="block truncate text-xs text-[#8e8ea0]">
                {currentProjectPath ?? t("sidebar.pickProjectHint")}
              </span>
            </span>
          </button>

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              className={`flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm transition active:scale-[0.99] ${
                activeView === "settings"
                  ? "bg-[#ececf1] text-[#202123]"
                  : "text-[#565869] hover:bg-[#ececf1] hover:text-[#202123]"
              }`}
            >
              <Settings className="h-4 w-4" />
              <span className="truncate">{t("nav.settings")}</span>
            </button>
          </div>
        </aside>

        <main
          aria-label="Forge workbench"
          className="min-h-0 min-w-0 overflow-hidden bg-white"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
