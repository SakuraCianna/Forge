import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskThread } from "@/state/taskThreads";
import { ThreadWorkspace } from "./ThreadWorkspace";

const thread: TaskThread = {
  id: "thread-1",
  title: "实现设置持久化",
  prompt: "实现设置持久化",
  status: "planned",
  modelId: "openai:gpt-5.5",
  intelligence: "high",
  speed: "balanced",
  createdAt: "2026-05-27T13:00:00.000Z",
  events: [
    {
      id: "event-1",
      kind: "plan",
      message: "任务已创建, 等待 Forge 生成执行计划",
      createdAt: "2026-05-27T13:00:00.000Z"
    }
  ]
};

describe("ThreadWorkspace", () => {
  it("shows an empty state when there are no task threads", () => {
    render(
      <ThreadWorkspace
        language="zh-CN"
        selectedThreadId={null}
        threads={[]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
      />
    );

    expect(screen.getByText("还没有任务线程")).toBeInTheDocument();
  });

  it("shows the selected task thread and its events", () => {
    render(
      <ThreadWorkspace
        language="zh-CN"
        selectedThreadId="thread-1"
        threads={[thread]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
      />
    );

    expect(screen.getAllByText("实现设置持久化")).toHaveLength(2);
    expect(screen.getByText(/openai:gpt-5.5/)).toBeInTheDocument();
    expect(screen.getByText("任务已创建, 等待 Forge 生成执行计划")).toBeInTheDocument();
  });

  it("submits a command for the selected thread", async () => {
    const user = userEvent.setup();
    const onRunCommand = vi.fn();

    render(
      <ThreadWorkspace
        language="zh-CN"
        selectedThreadId="thread-1"
        threads={[thread]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={onRunCommand}
        onPreviewFile={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText("命令"), "npm test");
    await user.click(screen.getByRole("button", { name: "运行命令" }));

    expect(onRunCommand).toHaveBeenCalledWith("thread-1", "npm test");
    expect(screen.getByLabelText("命令")).toHaveValue("");
  });

  it("shows scanned project files and previews selected content", async () => {
    const user = userEvent.setup();
    const onPreviewFile = vi.fn();

    render(
      <ThreadWorkspace
        language="zh-CN"
        selectedThreadId="thread-1"
        threads={[thread]}
        projectScan={{
          rootPath: "E:\\CodeHome\\Forge",
          files: [{ relativePath: "src/App.tsx", size: 42 }],
          truncated: false
        }}
        previewFile={{
          relativePath: "src/App.tsx",
          content: "export const App = () => null;",
          size: 30
        }}
        changePreview={{
          relativePath: "src/App.tsx",
          currentContent: "old",
          nextContent: "new",
          diff: [
            { kind: "remove", oldLineNumber: 1, text: "old" },
            { kind: "add", newLineNumber: 1, text: "new" }
          ]
        }}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={onPreviewFile}
        onPreviewChange={vi.fn()}
        onApplyChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "src/App.tsx" }));

    expect(onPreviewFile).toHaveBeenCalledWith("src/App.tsx");
    expect(screen.getByText("export const App = () => null;")).toBeInTheDocument();
    expect(screen.getByText("- old")).toBeInTheDocument();
    expect(screen.getByText("+ new")).toBeInTheDocument();
  });

  it("requests diff preview and applies a file change", async () => {
    const user = userEvent.setup();
    const onPreviewChange = vi.fn();
    const onApplyChange = vi.fn();

    render(
      <ThreadWorkspace
        language="zh-CN"
        selectedThreadId="thread-1"
        threads={[thread]}
        projectScan={{
          rootPath: "E:\\CodeHome\\Forge",
          files: [{ relativePath: "src/App.tsx", size: 42 }],
          truncated: false
        }}
        previewFile={{
          relativePath: "src/App.tsx",
          content: "old",
          size: 3
        }}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
        onPreviewChange={onPreviewChange}
        onApplyChange={onApplyChange}
      />
    );

    await user.clear(screen.getByLabelText("编辑内容"));
    await user.type(screen.getByLabelText("编辑内容"), "new");
    await user.click(screen.getByRole("button", { name: "生成 diff" }));
    await user.click(screen.getByRole("button", { name: "应用修改" }));

    expect(onPreviewChange).toHaveBeenCalledWith("src/App.tsx", "new");
    expect(onApplyChange).toHaveBeenCalledWith("src/App.tsx", "new");
  });
});
