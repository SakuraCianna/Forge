import { render, screen } from "@testing-library/react";
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

    await user.click(screen.getByRole("button", { name: "文件" }));
    await user.click(screen.getByRole("button", { name: "设置" }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "files");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "settings");
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
    expect(screen.getByRole("tooltip", { name: "Project options" })).toHaveClass("forge-tooltip");

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
});
