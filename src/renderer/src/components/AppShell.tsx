import type { ComponentType, ReactElement, ReactNode } from "react";
import {
  Code2,
  FileCode2,
  GitBranch,
  Hammer,
  Maximize2,
  Minus,
  Play,
  Plus,
  Settings,
  Workflow,
  X
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
  onNewTask,
  onRun,
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
    <div className="grid h-screen min-h-screen grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-[#08111f] text-[#e5edf7]">
      <header className="drag-region grid h-12 grid-cols-[240px_minmax(0,1fr)_auto] border-b border-[rgba(148,163,184,0.16)] bg-[#0a1424]/92 backdrop-blur-xl">
        <div className="flex h-12 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ff6b3d] text-[#08111f] shadow-[0_0_30px_rgba(255,107,61,0.22)]">
            <Hammer className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-normal text-white">Forge</span>
        </div>

        <div className="flex min-w-0 items-center justify-center">
          <button
            type="button"
            onClick={() => onNavigate("workspace")}
            className="no-drag inline-flex h-8 max-w-[320px] items-center gap-2 rounded-xl border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a]/86 px-3 text-sm font-medium text-[#dbe7f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[rgba(148,163,184,0.32)] hover:bg-[#142238] active:scale-[0.99]"
          >
            <span className="h-2 w-2 rounded-full bg-[#37d67a]" />
            <span className="truncate">{t("workspace.agentWorkspace")}</span>
          </button>
        </div>

        <div className="flex h-12 items-center gap-2 pr-2">
          <button
            type="button"
            onClick={onNewTask}
            className="no-drag inline-flex h-8 items-center gap-2 rounded-xl border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a] px-3 text-sm font-medium text-[#dbe7f5] transition hover:border-[rgba(148,163,184,0.3)] hover:bg-[#16243a] active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            {t("titlebar.newTask")}
          </button>
          <button
            type="button"
            onClick={onRun}
            className="no-drag inline-flex h-8 items-center gap-2 rounded-xl bg-[#ff6b3d] px-3 text-sm font-semibold text-[#08111f] shadow-[0_8px_22px_rgba(255,107,61,0.22)] transition hover:bg-[#ff815a] active:scale-[0.99]"
          >
            <Play className="h-4 w-4 fill-current" />
            {t("titlebar.run")}
          </button>
          <button
            type="button"
            aria-label={t("titlebar.userSettings")}
            onClick={() => onNavigate("settings")}
            className="no-drag flex h-8 w-8 items-center justify-center rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a] text-[#cbd8e8] transition hover:bg-[#16243a] active:scale-[0.98]"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <WindowButton label={t("titlebar.minimize")} onClick={() => void window.forge.windowControls.minimize()}>
            <Minus className="h-4 w-4" />
          </WindowButton>
          <WindowButton
            label={t("titlebar.maximize")}
            onClick={() => void window.forge.windowControls.toggleMaximize()}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </WindowButton>
          <WindowButton label={t("titlebar.close")} danger onClick={() => void window.forge.windowControls.close()}>
            <X className="h-4 w-4" />
          </WindowButton>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[240px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(15,26,42,0.96),rgba(10,20,36,0.98))] p-3">
          <button
            type="button"
            onClick={onPickProject}
            className="mb-4 rounded-[16px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(79,124,255,0.08))] p-3 text-left shadow-[0_12px_40px_rgba(0,0,0,0.16)] transition hover:border-[rgba(255,107,61,0.36)] hover:bg-[#142238] active:scale-[0.99]"
          >
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#8ea0b8]">
              {t("sidebar.currentProject")}
            </div>
            <div className="truncate text-sm font-semibold text-white">
              {currentProjectName ?? t("projects.empty")}
            </div>
            <div className="mt-1 truncate text-xs text-[#8ea0b8]">
              {currentProjectPath ?? t("sidebar.pickProjectHint")}
            </div>
          </button>

          <nav aria-label="Forge navigation" className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                className={`flex h-10 w-full items-center gap-2 rounded-[14px] px-3 text-left text-sm transition active:scale-[0.99] ${
                  activeView === item.key
                    ? "bg-[#17243a] text-white shadow-[inset_3px_0_0_#4f7cff]"
                    : "text-[#9fb0c7] hover:bg-[#121f33] hover:text-[#edf5ff]"
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
          className="min-h-0 min-w-0 overflow-hidden bg-[radial-gradient(circle_at_30%_0%,rgba(79,124,255,0.14),transparent_34%),radial-gradient(circle_at_82%_12%,rgba(255,107,61,0.12),transparent_28%),#08111f]"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function WindowButton({
  label,
  danger = false,
  onClick,
  children
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`no-drag flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-[0.96] ${
        danger
          ? "text-[#cbd8e8] hover:bg-[#ff4d4f] hover:text-white"
          : "text-[#8ea0b8] hover:bg-[#16243a] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
