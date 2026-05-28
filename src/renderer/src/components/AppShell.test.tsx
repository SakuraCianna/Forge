import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

function mockWindowControls(): {
  minimize: ReturnType<typeof vi.fn>;
  toggleMaximize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const windowControls = {
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  };

  Object.defineProperty(window, "forge", {
    configurable: true,
    value: {
      appName: "Forge",
      windowControls
    }
  });

  return windowControls;
}

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

  it("routes custom window controls through the preload bridge", async () => {
    const user = userEvent.setup();
    const windowControls = mockWindowControls();

    render(
      <AppShell language="en-US" activeView="workspace" onNavigate={() => undefined}>
        <section>Workbench</section>
      </AppShell>
    );

    await user.click(screen.getByRole("button", { name: "Minimize" }));
    await user.click(screen.getByRole("button", { name: "Maximize" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(windowControls.minimize).toHaveBeenCalledOnce();
    expect(windowControls.toggleMaximize).toHaveBeenCalledOnce();
    expect(windowControls.close).toHaveBeenCalledOnce();
  });
});
