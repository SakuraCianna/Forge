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

    expect(wallpaper).toHaveStyle({ opacity: "0.22" });
    expect(wallpaper).toHaveStyle({
      backgroundImage: "url(data:image/png;base64,abc)"
    });
    expect(screen.getByRole("main", { name: "Forge workbench" })).toHaveClass("bg-transparent");
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

    render(
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

    await user.click(screen.getByRole("button", { name: "Project options" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive all chats" }));
    expect(onArchiveAllChats).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "New chat in Forge" }));
    expect(onNewProjectChat).toHaveBeenCalledWith("E:\\CodeHome\\Forge");

    await user.click(screen.getByRole("button", { name: "Project options Forge" }));
    await user.click(screen.getByRole("menuitem", { name: "Pin project" }));
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
});
