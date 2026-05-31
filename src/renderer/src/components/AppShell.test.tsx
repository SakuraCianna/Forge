// 本文件说明: 验证桌面工作台侧边栏项目和会话交互
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("exposes a navigable desktop workbench structure", () => {
    render(
      <AppShell
        language="en-US"
        activeView="workspace"
        currentProjectName="Forge"
        currentProjectPath="E:\\CodeHome\\Forge"
        onNavigate={() => undefined}
      >
        <section>Workbench</section>
      </AppShell>
    );

    expect(screen.getByRole("navigation", { name: "Forge navigation" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Forge workbench" })).toHaveTextContent(
      "Workbench"
    );
    expect(screen.getAllByText("Forge")[0]).toHaveClass("text-[12px]");
    expect(screen.queryByRole("button", { name: "Threads" })).not.toBeInTheDocument();
  });

  it("renders an optional wallpaper background with the configured opacity", () => {
    render(
      <AppShell
        language="en-US"
        activeView="workspace"
        backgroundImageDataUrl="data:image/png;base64,abc"
        backgroundOpacity={0.22}
        onNavigate={() => undefined}
      >
        <section>Workbench</section>
      </AppShell>
    );

    const wallpaper = screen.getByTestId("app-wallpaper");
    const scrim = screen.getByTestId("app-wallpaper-scrim");

    expect(wallpaper).toHaveStyle({
      backgroundImage: "url(data:image/png;base64,abc)"
    });
    expect(scrim).toHaveStyle({ opacity: "0.78" });
    expect(screen.getByTestId("app-sidebar")).toHaveClass("bg-white/58");
    expect(screen.getByRole("main", { name: "Forge workbench" })).toHaveClass("bg-white/58");
    expect(screen.getByRole("main", { name: "Forge workbench" })).not.toHaveClass("bg-white/80");
  });

  it("routes sidebar buttons to real workbench views", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppShell language="zh-CN" activeView="workspace" onNavigate={onNavigate}>
        <section>Workbench</section>
      </AppShell>
    );

    const navigation = screen.getByRole("navigation", { name: "Forge navigation" });

    await user.click(within(navigation).getByRole("button", { name: "文件" }));
    await user.click(screen.getByRole("button", { name: "设置" }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "files");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "settings");
  });

  it("adds Codex-style title bar menus with real workbench actions", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onNewTask = vi.fn();
    const onPickProject = vi.fn();
    const onRun = vi.fn();

    render(
      <AppShell
        language="zh-CN"
        activeView="workspace"
        currentProjectName="Forge"
        currentProjectPath="E:\\CodeHome\\Forge"
        onNavigate={onNavigate}
        onNewTask={onNewTask}
        onPickProject={onPickProject}
        onRun={onRun}
      >
        <section>Workbench</section>
      </AppShell>
    );

    const titleMenus = screen.getByRole("navigation", { name: "Forge 标题栏菜单" });

    await user.click(within(titleMenus).getByRole("button", { name: "文件" }));
    await user.click(screen.getByRole("menuitem", { name: "新对话" }));
    expect(onNewTask).toHaveBeenCalledOnce();

    await user.click(within(titleMenus).getByRole("button", { name: "文件" }));
    await user.click(screen.getByRole("menuitem", { name: "打开项目" }));
    expect(onPickProject).toHaveBeenCalledOnce();

    await user.click(within(titleMenus).getByRole("button", { name: "查看" }));
    await user.click(screen.getByRole("menuitem", { name: "源代码管理" }));
    expect(onNavigate).toHaveBeenCalledWith("source");

    await user.click(within(titleMenus).getByRole("button", { name: "文件" }));
    await user.click(screen.getByRole("menuitem", { name: "运行当前输入" }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("keeps title bar menus left aligned and avoids duplicate Settings under Edit", async () => {
    const user = userEvent.setup();
    const onArchiveProjectChats = vi.fn();
    const onCreateProjectWorktree = vi.fn();
    const onNavigate = vi.fn();
    const onNewProjectChat = vi.fn();
    const onRenameProject = vi.fn();
    const onTogglePinProject = vi.fn();
    const projectPath = "E:\\CodeHome\\Forge";

    render(
      <AppShell
        language="en-US"
        activeView="workspace"
        currentProjectName="Forge"
        currentProjectPath={projectPath}
        onArchiveProjectChats={onArchiveProjectChats}
        onCreateProjectWorktree={onCreateProjectWorktree}
        onNavigate={onNavigate}
        onNewProjectChat={onNewProjectChat}
        onRenameProject={onRenameProject}
        onTogglePinProject={onTogglePinProject}
      >
        <section>Workbench</section>
      </AppShell>
    );

    const titleMenus = screen.getByRole("navigation", { name: "Forge title bar menus" });
    expect(titleMenus).toHaveClass("ml-4", "gap-3");

    await user.click(within(titleMenus).getByRole("button", { name: "File" }));
    await user.click(screen.getByRole("menuitem", { name: "New chat in current project" }));
    expect(onNewProjectChat).toHaveBeenCalledWith(projectPath);

    await user.click(within(titleMenus).getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Rename project" }));
    expect(onRenameProject).toHaveBeenCalledWith(projectPath);

    await user.click(within(titleMenus).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("menuitem", { name: "Pin current project" }));
    expect(onTogglePinProject).toHaveBeenCalledWith(projectPath);

    await user.click(within(titleMenus).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("menuitem", { name: "Create permanent worktree" }));
    expect(onCreateProjectWorktree).toHaveBeenCalledWith(projectPath);

    await user.click(within(titleMenus).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive current project chats" }));
    expect(onArchiveProjectChats).toHaveBeenCalledWith(projectPath);

    await user.click(within(titleMenus).getByRole("button", { name: "View" }));
    expect(screen.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Source control" }));
    expect(onNavigate).toHaveBeenCalledWith("source");

    await user.click(within(titleMenus).getByRole("button", { name: "Window" }));
    await user.click(screen.getByRole("menuitem", { name: "Show settings" }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });


  it("offers project actions and conversation archive controls from the sidebar", async () => {
    const user = userEvent.setup();
    const onPickProject = vi.fn();
    const onArchiveAllChats = vi.fn();
    const onArchiveProjectChats = vi.fn();
    const onNewProjectChat = vi.fn();
    const onArchiveThread = vi.fn();
    const onCreateProjectWorktree = vi.fn();
    const onTogglePinProject = vi.fn();

    const { container } = render(
      <AppShell
        language="en-US"
        activeView="workspace"
        projects={[{ name: "Forge", path: "E:\\CodeHome\\Forge", openedAt: "2026-05-27T13:00:00.000Z" }]}
        threads={[
          {
            id: "thread-1",
            title: "Build Forge",
            prompt: "Build Forge",
            status: "planned",
            modelId: "openai:gpt-5.5",
            intelligence: "high",
            speed: "balanced",
            createdAt: "2026-05-27T13:00:00.000Z",
            events: []
          }
        ]}
        onArchiveAllChats={onArchiveAllChats}
        onArchiveProjectChats={onArchiveProjectChats}
        onArchiveThread={onArchiveThread}
        onCreateProjectWorktree={onCreateProjectWorktree}
        onNavigate={() => undefined}
        onNewProjectChat={onNewProjectChat}
        onPickProject={onPickProject}
        onTogglePinProject={onTogglePinProject}
      >
        <section>Workbench</section>
      </AppShell>
    );

    await user.click(screen.getByRole("button", { name: "Add project" }));
    expect(onPickProject).toHaveBeenCalled();
    expect(container.querySelector("button[title]")).toBeNull();
    expect(screen.getByRole("tooltip", { name: "Add project" })).toHaveClass("forge-tooltip");
    expect(screen.getByRole("tooltip", { name: "Add project" })).toHaveClass(
      "forge-tooltip-align-end"
    );
    expect(screen.getByRole("tooltip", { name: "Project options" })).toHaveClass("forge-tooltip");
    expect(screen.getByRole("tooltip", { name: "Project options" })).toHaveClass(
      "forge-tooltip-align-end"
    );
    expect(screen.getByRole("button", { name: "New chat in Forge" })).toHaveClass(
      "hover:bg-[#f7f7f8]"
    );

    await user.click(screen.getByRole("button", { name: "Project options" }));
    const archiveAllItem = screen.getByRole("menuitem", { name: "Archive all chats" });
    expect(archiveAllItem.closest("[role='menu']")).toHaveClass("text-[12px]");
    await user.click(archiveAllItem);
    expect(onArchiveAllChats).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "New chat in Forge" }));
    expect(onNewProjectChat).toHaveBeenCalledWith("E:\\CodeHome\\Forge");

    await user.click(screen.getByRole("button", { name: "Project options Forge" }));
    const pinProjectItem = screen.getByRole("menuitem", { name: "Pin project" });
    expect(pinProjectItem.closest("[role='menu']")).toHaveClass("text-[12px]");
    await user.click(pinProjectItem);
    expect(onTogglePinProject).toHaveBeenCalledWith("E:\\CodeHome\\Forge");

    await user.click(screen.getByRole("button", { name: "Project options Forge" }));
    await user.click(screen.getByRole("menuitem", { name: "Create permanent worktree" }));
    expect(onCreateProjectWorktree).toHaveBeenCalledWith("E:\\CodeHome\\Forge");

    await user.click(screen.getByRole("button", { name: "Project options Forge" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive conversations" }));
    expect(onArchiveProjectChats).toHaveBeenCalledWith("E:\\CodeHome\\Forge");

    await user.click(screen.getByRole("button", { name: "Conversation options Build Forge" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive conversation" }));
    expect(onArchiveThread).toHaveBeenCalledWith("thread-1");
  });

  it("keeps project conversations nested under their project instead of the global chat list", () => {
    render(
      <AppShell
        language="en-US"
        activeView="workspace"
        currentProjectPath="E:\\CodeHome\\Forge"
        projects={[{ name: "Forge", path: "E:\\CodeHome\\Forge", openedAt: "2026-05-27T13:00:00.000Z" }]}
        threads={[
          {
            id: "project-thread",
            title: "Project task",
            prompt: "Project task",
            status: "running",
            modelId: "openai:gpt-5.5",
            intelligence: "high",
            speed: "balanced",
            createdAt: "2026-05-27T13:00:00.000Z",
            projectPath: "E:\\CodeHome\\Forge",
            events: []
          },
          {
            id: "ask-thread",
            title: "Ask only",
            prompt: "Ask only",
            status: "completed",
            modelId: "openai:gpt-5.5",
            intelligence: "high",
            speed: "balanced",
            createdAt: "2026-05-27T14:00:00.000Z",
            projectPath: null,
            events: []
          }
        ]}
        onNavigate={() => undefined}
      >
        <section>Workbench</section>
      </AppShell>
    );

    expect(screen.getByRole("group", { name: "Forge conversations" })).toHaveTextContent(
      "Project task"
    );
    expect(screen.getByRole("group", { name: "Global conversations" })).toHaveTextContent(
      "Ask only"
    );
  });

  it("uses compact Codex-style sidebar rows for projects and conversations", () => {
    render(
      <AppShell
        language="en-US"
        activeView="workspace"
        currentProjectPath="E:\\CodeHome\\Forge"
        projects={[{ name: "Forge", path: "E:\\CodeHome\\Forge", openedAt: "2026-05-27T13:00:00.000Z" }]}
        threads={[
          {
            id: "project-thread",
            title: "Project task",
            prompt: "Project task",
            status: "running",
            modelId: "openai:gpt-5.5",
            intelligence: "high",
            speed: "balanced",
            createdAt: "2026-05-27T13:00:00.000Z",
            projectPath: "E:\\CodeHome\\Forge",
            events: []
          }
        ]}
        onNavigate={() => undefined}
      >
        <section>Workbench</section>
      </AppShell>
    );

    expect(screen.getByTestId("sidebar-project-row-E:\\CodeHome\\Forge")).toHaveClass("h-8");
    expect(screen.getByTestId("sidebar-thread-row-project-thread")).toHaveClass("h-7");
  });

  it("keeps long project and conversation names inside the sidebar bounds", () => {
    const longProjectName = "Werewolf with a very long product name that should never cross the divider";
    const longThreadTitle = "你写一份项目说明书.md 告诉我这个项目怎么用以及后续还需要怎么继续打磨";

    render(
      <AppShell
        language="zh-CN"
        activeView="workspace"
        currentProjectPath="E:\\CodeHome\\Werewolf"
        projects={[
          {
            name: longProjectName,
            path: "E:\\CodeHome\\Werewolf",
            openedAt: "2026-05-30T13:00:00.000Z"
          }
        ]}
        threads={[
          {
            id: "long-project-thread",
            title: longThreadTitle,
            prompt: longThreadTitle,
            status: "planned",
            modelId: "deepseek:deepseek-v4-flash",
            intelligence: "low",
            speed: "balanced",
            createdAt: "2026-05-30T13:00:00.000Z",
            projectPath: "E:\\CodeHome\\Werewolf",
            events: []
          }
        ]}
        onNavigate={() => undefined}
      >
        <section>Workbench</section>
      </AppShell>
    );

    const projectRow = screen.getByTestId("sidebar-project-row-E:\\CodeHome\\Werewolf");
    const projectName = screen.getByText(longProjectName);
    const threadRow = screen.getByTestId("sidebar-thread-row-long-project-thread");
    const threadTitle = screen.getByText(longThreadTitle);

    expect(projectRow).toHaveClass("w-full", "overflow-hidden");
    expect(projectName).toHaveClass("min-w-0", "flex-1", "truncate");
    expect(threadRow).toHaveClass("w-full", "overflow-hidden");
    expect(threadTitle).toHaveClass("min-w-0", "flex-1", "truncate");
  });
});
