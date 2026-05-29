import type { ComponentType, CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Archive,
  Edit3,
  Ellipsis,
  FileCode2,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Hammer,
  MessageSquare,
  Pin,
  Plus,
  Settings,
  SquarePen,
  Trash2
} from "lucide-react";
import type { Language } from "@shared/modelTypes";
import { useI18n } from "@/i18n/useI18n";
import type { ForgeProject } from "@/state/projects";
import { getProjectDisplayName } from "@/state/projects";
import type { TaskThread } from "@/state/taskThreads";

type AppShellProps = {
  language: Language;
  activeView: WorkbenchView;
  currentProjectName?: string | null;
  currentProjectPath?: string | null;
  projects?: ForgeProject[];
  threads?: TaskThread[];
  onArchiveAllChats?: () => void;
  onArchiveProjectChats?: (projectPath: string) => void;
  onArchiveThread?: (threadId: string) => void;
  onCreateProjectWorktree?: (projectPath: string) => void;
  onNavigate: (view: WorkbenchView) => void;
  onNewTask?: () => void;
  onNewProjectChat?: (projectPath: string) => void;
  onPickProject?: () => void;
  onRun?: () => void;
  onRemoveProject?: (projectPath: string) => void;
  onRenameProject?: (projectPath: string) => void;
  onSelectProject?: (projectPath: string) => void;
  onSelectThread?: (threadId: string) => void;
  onTogglePinProject?: (projectPath: string) => void;
  onTogglePinThread?: (threadId: string) => void;
  backgroundImageDataUrl?: string | null;
  backgroundOpacity?: number;
  children: ReactNode;
};

export type WorkbenchView = "workspace" | "files" | "source" | "settings";

type NavItem = {
  key: WorkbenchView;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type ShellCopy = {
  addProject: string;
  archiveAllChats: string;
  archiveConversation: string;
  archiveProjectChats: string;
  conversations: string;
  createWorktree: string;
  newProjectChat: (name: string) => string;
  openInSource: string;
  pinConversation: string;
  pinProject: string;
  projectOptions: string;
  removeProject: string;
  renameProject: string;
  threadOptions: (title: string) => string;
  unpinProject: string;
};

export function AppShell({
  language,
  activeView,
  currentProjectName,
  currentProjectPath,
  projects = [],
  threads = [],
  onArchiveAllChats,
  onArchiveProjectChats,
  onArchiveThread,
  onCreateProjectWorktree,
  onNavigate,
  onNewTask,
  onNewProjectChat,
  onPickProject,
  onRemoveProject,
  onRenameProject,
  onSelectProject,
  onSelectThread,
  onTogglePinProject,
  onTogglePinThread,
  backgroundImageDataUrl,
  backgroundOpacity = 0.18,
  children
}: AppShellProps): ReactElement {
  const { t } = useI18n(language);
  const copy = getShellCopy(language);
  const [sidebarWidth, setSidebarWidth] = useState(() => getInitialSidebarWidth());
  const navItems: NavItem[] = [
    { key: "files", label: t("nav.files"), icon: FileCode2 },
    { key: "source", label: t("nav.sourceControl"), icon: GitBranch }
  ];
  const visibleThreads = useMemo(
    () =>
      threads
        .filter((thread) => !thread.archived)
        .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))),
    [threads]
  );
  const layoutStyle = {
    "--forge-sidebar-width": `${sidebarWidth}px`
  } as CSSProperties;
  const wallpaperOpacity = clampWallpaperOpacity(backgroundOpacity);
  const hasWallpaper = Boolean(backgroundImageDataUrl);

  useEffect(() => {
    function syncSidebarWidth(): void {
      const maxWidth = getSidebarMaxWidth();
      setSidebarWidth((current) => clampSidebarWidth(current, maxWidth));
    }

    syncSidebarWidth();
    window.addEventListener("resize", syncSidebarWidth);

    return () => window.removeEventListener("resize", syncSidebarWidth);
  }, []);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    const maxWidth = getSidebarMaxWidth();

    function moveSidebar(pointerEvent: PointerEvent): void {
      setSidebarWidth(clampSidebarWidth(pointerEvent.clientX, maxWidth));
    }

    function stopResize(): void {
      window.removeEventListener("pointermove", moveSidebar);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", moveSidebar);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  return (
    <div
      style={layoutStyle}
      className={`relative h-screen min-h-screen overflow-hidden text-[#202123] ${
        hasWallpaper ? "bg-[#f7f7f8]" : "bg-white"
      }`}
    >
      {backgroundImageDataUrl ? (
        <div
          data-testid="app-wallpaper"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${backgroundImageDataUrl})`,
            opacity: wallpaperOpacity
          }}
        />
      ) : null}
      <div className="relative z-10 grid h-full min-h-0 grid-rows-[48px_minmax(0,1fr)] overflow-hidden">
      <header
        className={`grid h-12 grid-cols-[var(--forge-sidebar-width)_minmax(0,1fr)_138px] border-b border-[#ececf1] ${
          hasWallpaper ? "bg-white/72" : "bg-white/90 backdrop-blur"
        }`}
      >
        <div className="drag-region flex h-12 items-center gap-2 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#ececf1] bg-white text-[#202123] shadow-sm">
            <Hammer className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-semibold tracking-normal text-[#202123]">Forge</span>
        </div>

        <div className="drag-region h-12" aria-hidden="true" />
        <div className="drag-region h-12" aria-hidden="true" />
      </header>

      <div className="grid min-h-0 grid-cols-[var(--forge-sidebar-width)_minmax(0,1fr)] overflow-hidden">
        <aside
          className={`relative flex min-h-0 flex-col border-r border-[#ececf1] p-3 ${
            hasWallpaper ? "bg-[#f7f7f8]/74" : "bg-[#f7f7f8]/90 backdrop-blur"
          }`}
        >
          <button
            type="button"
            title={t("nav.newChat")}
            onClick={() => {
              if (onNewTask) {
                onNewTask();
              } else {
                onNavigate("workspace");
              }
            }}
            className="mb-2 flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-[10px] text-[#202123] transition hover:bg-[#ececf1] active:scale-[0.99]"
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
                className={`flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-[10px] transition active:scale-[0.99] ${
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

          {renderProjects()}
          {renderConversations()}

          <div className="mt-auto pt-4">
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              title={t("nav.settings")}
              className={`flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-[10px] transition active:scale-[0.99] ${
                activeView === "settings"
                  ? "bg-[#ececf1] text-[#202123]"
                  : "text-[#565869] hover:bg-[#ececf1] hover:text-[#202123]"
              }`}
            >
              <Settings className="h-4 w-4" />
              <span className="truncate">{t("nav.settings")}</span>
            </button>
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={beginResize}
            className="absolute right-[-3px] top-0 z-10 h-full w-1.5 cursor-col-resize rounded-full transition hover:bg-[#d9d9e3]"
          />
        </aside>

        <main
          aria-label="Forge workbench"
          // 背景图需要穿透到工作台主层, 否则白色面板会抵消透明度
          className={`min-h-0 min-w-0 overflow-hidden ${
            hasWallpaper ? "bg-transparent" : "bg-white/80 backdrop-blur-[1px]"
          }`}
        >
          {children}
        </main>
      </div>
      </div>
    </div>
  );

  function renderProjects(): ReactElement {
    const projectsToRender =
      projects.length > 0
        ? projects
        : currentProjectName && currentProjectPath
          ? [{ name: currentProjectName, path: currentProjectPath, openedAt: "" }]
          : [];

    return (
      <section className="mt-5 min-w-0">
        <div className="mb-1 flex h-8 items-center justify-between px-3">
          <span className="text-[10px] text-[#8e8ea0]">{t("nav.projects")}</span>
          <span className="flex items-center gap-1">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={copy.projectOptions}
                  title={language === "zh-CN" ? "更多" : "More"}
                  className="flex h-7 w-7 items-center justify-center rounded-[10px] text-[#6e6e80] transition hover:bg-[#ececf1] hover:text-[#202123]"
                >
                  <Ellipsis className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => onArchiveAllChats?.()}>
                  <Archive className="h-4 w-4" />
                  {copy.archiveAllChats}
                </MenuItem>
              </MenuContent>
            </DropdownMenu.Root>
            <button
              type="button"
              aria-label={copy.addProject}
              title={copy.addProject}
              onClick={onPickProject}
              className="flex h-7 w-7 items-center justify-center rounded-[10px] text-[#6e6e80] transition hover:bg-[#ececf1] hover:text-[#202123]"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </span>
        </div>

        <div className="space-y-1">
          {projectsToRender.map((project) => {
            const displayName = getProjectDisplayName(project, projectsToRender);
            const selected = project.path === currentProjectPath;

            return (
              <div
                key={project.path}
                className={`group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-[12px] pr-1 transition ${
                  selected ? "bg-[#ececf1]" : "hover:bg-[#ececf1]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectProject?.(project.path)}
                  className="flex min-w-0 items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[10px] text-[#565869]"
                >
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5 text-[#202123]">
                      {project.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-[#6e6e80]" /> : null}
                      <span className="truncate">{displayName}</span>
                    </span>
                    <span className="block truncate text-[10px] text-[#8e8ea0]">{project.path}</span>
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={copy.newProjectChat(displayName)}
                  title={t("nav.newChat")}
                  onClick={() => onNewProjectChat?.(project.path)}
                  className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[#6e6e80] opacity-100 transition hover:bg-white hover:text-[#202123] md:opacity-0 md:group-hover:opacity-100"
                >
                  <SquarePen className="h-4 w-4" />
                </button>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      aria-label={`${copy.projectOptions} ${displayName}`}
                      title={language === "zh-CN" ? "更多" : "More"}
                      className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[#6e6e80] opacity-100 transition hover:bg-white hover:text-[#202123] md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Ellipsis className="h-4 w-4" />
                    </button>
                  </DropdownMenu.Trigger>
                  <MenuContent align="start" sideOffset={6}>
                    <MenuItem onSelect={() => onTogglePinProject?.(project.path)}>
                      <Pin className="h-4 w-4" />
                      {project.pinned ? copy.unpinProject : copy.pinProject}
                    </MenuItem>
                    <MenuItem
                      onSelect={() => {
                        onSelectProject?.(project.path);
                        onNavigate("source");
                      }}
                    >
                      <GitBranch className="h-4 w-4" />
                      {copy.openInSource}
                    </MenuItem>
                    <MenuItem onSelect={() => onCreateProjectWorktree?.(project.path)}>
                      <FolderPlus className="h-4 w-4" />
                      {copy.createWorktree}
                    </MenuItem>
                    <MenuItem onSelect={() => onRenameProject?.(project.path)}>
                      <Edit3 className="h-4 w-4" />
                      {copy.renameProject}
                    </MenuItem>
                    <MenuItem onSelect={() => onArchiveProjectChats?.(project.path)}>
                      <Archive className="h-4 w-4" />
                      {copy.archiveProjectChats}
                    </MenuItem>
                    <MenuItem onSelect={() => onRemoveProject?.(project.path)} variant="danger">
                      <Trash2 className="h-4 w-4" />
                      {copy.removeProject}
                    </MenuItem>
                  </MenuContent>
                </DropdownMenu.Root>
              </div>
            );
          })}

          {projectsToRender.length === 0 ? (
            <button
              type="button"
              onClick={onPickProject}
              className="flex h-11 w-full items-center gap-2 rounded-[12px] px-3 text-left text-[10px] text-[#565869] transition hover:bg-[#ececf1] hover:text-[#202123] active:scale-[0.99]"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-[#202123]">{t("projects.empty")}</span>
                <span className="block truncate text-[10px] text-[#8e8ea0]">
                  {t("sidebar.pickProjectHint")}
                </span>
              </span>
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  function renderConversations(): ReactElement | null {
    if (visibleThreads.length === 0) {
      return null;
    }

    return (
      <section className="mt-5 min-w-0">
        <div className="mb-1 px-3 text-[10px] text-[#8e8ea0]">{copy.conversations}</div>
        <div className="space-y-1">
          {visibleThreads.map((thread) => (
            <div
              key={thread.id}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[12px] pr-1 transition hover:bg-[#ececf1]"
            >
              <button
                type="button"
                onClick={() => onSelectThread?.(thread.id)}
                className="flex min-w-0 items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[10px] text-[#565869]"
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="truncate text-[#202123]">{thread.title}</span>
                {thread.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-[#6e6e80]" /> : null}
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={copy.threadOptions(thread.title)}
                    title={language === "zh-CN" ? "更多" : "More"}
                    className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[#6e6e80] opacity-100 transition hover:bg-white hover:text-[#202123] md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Ellipsis className="h-4 w-4" />
                  </button>
                </DropdownMenu.Trigger>
                <MenuContent align="start" sideOffset={6}>
                  <MenuItem onSelect={() => onTogglePinThread?.(thread.id)}>
                    <Pin className="h-4 w-4" />
                    {copy.pinConversation}
                  </MenuItem>
                  <MenuItem onSelect={() => onArchiveThread?.(thread.id)}>
                    <Archive className="h-4 w-4" />
                    {copy.archiveConversation}
                  </MenuItem>
                </MenuContent>
              </DropdownMenu.Root>
            </div>
          ))}
        </div>
      </section>
    );
  }
}

function MenuContent({
  align = "start",
  children,
  sideOffset = 8
}: {
  align?: "start" | "center" | "end";
  children: ReactNode;
  sideOffset?: number;
}): ReactElement {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className="forge-dropdown-content z-50 min-w-52 rounded-[16px] border border-[#ececf1] bg-white p-1.5 text-[10px] text-[#202123] shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

function MenuItem({
  children,
  onSelect,
  variant = "default"
}: {
  children: ReactNode;
  onSelect?: () => void;
  variant?: "default" | "danger";
}): ReactElement {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex h-9 cursor-default select-none items-center gap-2 rounded-[10px] px-2.5 outline-none transition data-[highlighted]:bg-[#f7f7f8] ${
        variant === "danger" ? "text-[#b42318]" : "text-[#202123]"
      }`}
    >
      {children}
    </DropdownMenu.Item>
  );
}

function getInitialSidebarWidth(): number {
  return getSidebarMaxWidth();
}

function getSidebarMaxWidth(): number {
  if (typeof window === "undefined") {
    return 220;
  }

  const screenWidth = window.screen?.width || window.innerWidth || 1760;
  const screenMaxWidth = Math.floor(screenWidth / 6);
  const viewportMaxWidth = Math.floor((window.innerWidth || screenWidth) * 0.34);

  return Math.max(148, Math.min(screenMaxWidth, viewportMaxWidth));
}

function clampSidebarWidth(width: number, maxWidth: number): number {
  const minWidth = Math.min(176, maxWidth);

  return Math.min(Math.max(width, minWidth), maxWidth);
}

function clampWallpaperOpacity(value: number): number {
  return Math.min(Math.max(value, 0), 0.6);
}

function getShellCopy(language: Language): ShellCopy {
  if (language === "zh-CN") {
    return {
      addProject: "新增项目",
      archiveAllChats: "归档所有聊天",
      archiveConversation: "归档对话",
      archiveProjectChats: "归档对话",
      conversations: "对话",
      createWorktree: "创建永久工作树",
      newProjectChat: (name) => `在 ${name} 开启新对话`,
      openInSource: "在源代码管理中打开",
      pinConversation: "置顶对话",
      pinProject: "置顶项目",
      projectOptions: "项目更多选项",
      removeProject: "移除",
      renameProject: "重命名项目",
      threadOptions: (title) => `对话更多选项 ${title}`,
      unpinProject: "取消置顶项目"
    };
  }

  return {
    addProject: "Add project",
    archiveAllChats: "Archive all chats",
    archiveConversation: "Archive conversation",
    archiveProjectChats: "Archive conversations",
    conversations: "Conversations",
    createWorktree: "Create permanent worktree",
    newProjectChat: (name) => `New chat in ${name}`,
    openInSource: "Open in source control",
    pinConversation: "Pin conversation",
    pinProject: "Pin project",
    projectOptions: "Project options",
    removeProject: "Remove",
    renameProject: "Rename project",
    threadOptions: (title) => `Conversation options ${title}`,
    unpinProject: "Unpin project"
  };
}
