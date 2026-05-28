import type { ComponentType, ReactElement, ReactNode } from "react";
import {
  Code2,
  FileCode2,
  FolderOpen,
  GitBranch,
  Hammer,
  Settings,
  Workflow
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

export type WorkbenchView = "workspace" | "tasks" | "files" | "source" | "settings";

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
  onPickProject,
  children
}: AppShellProps): ReactElement {
  const { t } = useI18n(language);
  const navItems: NavItem[] = [
    { key: "workspace", label: t("nav.workspace"), icon: Workflow },
    { key: "tasks", label: t("nav.threads"), icon: Code2 },
    { key: "files", label: t("nav.files"), icon: FileCode2 },
    { key: "source", label: t("nav.sourceControl"), icon: GitBranch },
    { key: "settings", label: t("nav.settings"), icon: Settings }
  ];

  return (
    <div className="grid h-screen min-h-screen grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-white text-[#202123]">
      <header className="grid h-12 grid-cols-[220px_minmax(0,1fr)_138px] border-b border-[#e5e5e5] bg-white">
        <div className="drag-region flex h-12 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#e5e5e5] bg-[#f7f7f8] text-[#202123]">
            <Hammer className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-normal text-[#202123]">Forge</span>
        </div>

        <div className="drag-region flex min-w-0 items-center justify-center px-3">
          <button
            type="button"
            onClick={() => onNavigate("workspace")}
            onPointerDown={(event) => event.stopPropagation()}
            className="no-drag inline-flex h-8 max-w-[320px] items-center gap-2 rounded-[12px] border border-[#e5e5e5] bg-[#f7f7f8] px-3 text-sm font-medium text-[#202123] transition hover:bg-[#ececf1] active:scale-[0.99]"
          >
            <span className="h-2 w-2 rounded-full bg-[#10a37f]" />
            <span className="truncate">{t("workspace.agentWorkspace")}</span>
          </button>
        </div>

        <div className="drag-region h-12" aria-hidden="true" />
      </header>

      <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[#e5e5e5] bg-[#f7f7f8] p-3">
          <button
            type="button"
            onClick={onPickProject}
            className="mb-4 flex h-12 items-center gap-2.5 rounded-[14px] border border-[#e5e5e5] bg-white px-3 text-left transition hover:bg-[#ececf1] active:scale-[0.99]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f1f1f1] text-[#565869]">
              <FolderOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#202123]">
                {currentProjectName ?? t("projects.empty")}
              </div>
              <div className="truncate text-xs text-[#6e6e80]">
                {currentProjectPath ?? t("sidebar.pickProjectHint")}
              </div>
            </div>
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
