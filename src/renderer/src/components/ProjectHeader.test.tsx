// 本文件说明: 验证项目标题栏的 Git 摘要和操作按钮
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectHeader } from "./ProjectHeader";

describe("ProjectHeader", () => {
  it("shows an empty project state", () => {
    render(<ProjectHeader language="zh-CN" project={null} onPickProject={vi.fn()} />);

    expect(screen.getByText("未选择项目")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择项目" })).toBeInTheDocument();
  });

  it("shows the selected project and triggers the picker", async () => {
    const user = userEvent.setup();
    const onPickProject = vi.fn();

    render(
      <ProjectHeader
        language="zh-CN"
        project={{
          name: "Forge",
          path: "E:\\CodeHome\\Forge",
          openedAt: "2026-05-27T13:00:00.000Z"
        }}
        scanResult={{
          rootPath: "E:\\CodeHome\\Forge",
          files: [
            { relativePath: "package.json", size: 2 },
            { relativePath: "src/App.tsx", size: 12 }
          ],
          truncated: false
        }}
        onPickProject={onPickProject}
      />
    );

    expect(screen.getByText("Forge")).toBeInTheDocument();
    expect(screen.getByText("E:\\CodeHome\\Forge")).toBeInTheDocument();
    expect(screen.getByText("已索引 2 个文件")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择项目" }));

    expect(onPickProject).toHaveBeenCalledOnce();
  });

  it("shows Git status and submits an explicit commit message", async () => {
    const user = userEvent.setup();
    const onCommitProject = vi.fn();
    const onCommitMessageChange = vi.fn();

    render(
      <ProjectHeader
        language="en-US"
        project={{
          name: "Forge",
          path: "E:\\CodeHome\\Forge",
          openedAt: "2026-05-27T13:00:00.000Z"
        }}
        gitStatus={{
          isRepo: true,
          changedFiles: ["src/App.tsx", "src/main/index.ts"],
          changes: [
            { path: "src/App.tsx", status: "M", diff: "+changed\n" },
            { path: "src/main/index.ts", status: "M", diff: "+changed\n" }
          ],
          rawStatus: " M src/App.tsx\n M src/main/index.ts\n"
        }}
        commitMessage=""
        onCommitMessageChange={onCommitMessageChange}
        onCommitProject={onCommitProject}
        onPickProject={vi.fn()}
        onRefreshGitStatus={vi.fn()}
      />
    );

    expect(screen.getByText("Git: 2 changed files")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Commit message"), "update shell");
    await user.click(screen.getByRole("button", { name: "Commit" }));

    expect(onCommitMessageChange).toHaveBeenLastCalledWith("update shell");
    expect(onCommitProject).toHaveBeenCalledOnce();
  });
});
