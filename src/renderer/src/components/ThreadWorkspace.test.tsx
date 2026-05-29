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
    expect(screen.getAllByText("任务已创建, 等待 Forge 生成执行计划").length).toBeGreaterThan(0);
  });

  it("shows the generated agent action queue on the plan tab", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Implement agent queue",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "inspect-file",
                label: "Inspect src/App.tsx",
                status: "pending",
                target: "src/App.tsx"
              },
              {
                id: "action-2",
                stepId: "step-2",
                kind: "run-command",
                label: "Run npm test",
                status: "pending",
                command: "npm test"
              }
            ]
          }
        ]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
      />
    );

    expect(screen.getByText("Agent action queue")).toBeInTheDocument();
    expect(screen.getByText("Inspect src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText("Run npm test")).toBeInTheDocument();
  });

  it("runs command actions and opens file actions from the agent queue", async () => {
    const user = userEvent.setup();
    const onRunCommand = vi.fn();
    const onPreviewFile = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Execute agent queue",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "inspect-file",
                label: "Inspect src/App.tsx",
                status: "pending",
                target: "src/App.tsx"
              },
              {
                id: "action-2",
                stepId: "step-2",
                kind: "run-command",
                label: "Run npm test",
                status: "pending",
                command: "npm test"
              }
            ]
          }
        ]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={onRunCommand}
        onPreviewFile={onPreviewFile}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open action src/App.tsx" }));
    await user.click(screen.getByRole("button", { name: "Run action npm test" }));

    expect(onPreviewFile).toHaveBeenCalledWith("src/App.tsx");
    expect(onRunCommand).toHaveBeenCalledWith("thread-1", "npm test");
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

    await user.click(screen.getByRole("button", { name: "命令" }));
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

    await user.click(screen.getByRole("button", { name: "变更" }));
    await user.click(screen.getByRole("button", { name: "src/App.tsx" }));

    expect(onPreviewFile).toHaveBeenCalledWith("src/App.tsx");
    expect(screen.getByDisplayValue("new")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "变更" }));
    await user.clear(screen.getByLabelText("编辑内容"));
    await user.type(screen.getByLabelText("编辑内容"), "new");
    await user.click(screen.getByRole("button", { name: "生成 diff" }));
    await user.click(screen.getByRole("button", { name: "应用修改" }));

    expect(onPreviewChange).toHaveBeenCalledWith("src/App.tsx", "new");
    expect(onApplyChange).toHaveBeenCalledWith("src/App.tsx", "new");
  });

  it("requests an AI edit for the selected file", async () => {
    const user = userEvent.setup();
    const onGenerateFileChange = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
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
        onPreviewChange={vi.fn()}
        onApplyChange={vi.fn()}
        onGenerateFileChange={onGenerateFileChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Changes" }));
    await user.click(screen.getByRole("button", { name: "Generate AI edit" }));

    expect(onGenerateFileChange).toHaveBeenCalledWith("src/App.tsx", "old");
  });

  it("shows a multi-file change set and discards selected changes", async () => {
    const user = userEvent.setup();
    const onPreviewFile = vi.fn();
    const onDiscardChange = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[thread]}
        projectScan={{
          rootPath: "E:\\CodeHome\\Forge",
          files: [
            { relativePath: "src/App.tsx", size: 42 },
            { relativePath: "src/main.tsx", size: 24 }
          ],
          truncated: false
        }}
        previewFile={{
          relativePath: "src/App.tsx",
          content: "old app",
          size: 7
        }}
        changePreview={null}
        changePreviews={[
          {
            relativePath: "src/App.tsx",
            currentContent: "old app",
            nextContent: "new app",
            diff: [
              { kind: "remove", oldLineNumber: 1, text: "old app" },
              { kind: "add", newLineNumber: 1, text: "new app" }
            ]
          },
          {
            relativePath: "src/main.tsx",
            currentContent: "old main",
            nextContent: "new main",
            diff: [{ kind: "add", newLineNumber: 1, text: "new main" }]
          }
        ]}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={onPreviewFile}
        onPreviewChange={vi.fn()}
        onApplyChange={vi.fn()}
        onDiscardChange={onDiscardChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Changes" }));
    expect(screen.getByText("Pending changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pending change src/main.tsx" }));
    await user.click(screen.getByRole("button", { name: "Discard change" }));

    expect(onPreviewFile).toHaveBeenCalledWith("src/main.tsx");
    expect(onDiscardChange).toHaveBeenCalledWith("src/App.tsx");
  });

  it("supports applying or discarding all pending changes", async () => {
    const user = userEvent.setup();
    const onApplyAllChanges = vi.fn();
    const onDiscardAllChanges = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
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
        changePreviews={[
          {
            relativePath: "src/App.tsx",
            currentContent: "old",
            nextContent: "new",
            diff: [{ kind: "add", newLineNumber: 1, text: "new" }]
          }
        ]}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
        onPreviewChange={vi.fn()}
        onApplyChange={vi.fn()}
        onApplyAllChanges={onApplyAllChanges}
        onDiscardAllChanges={onDiscardAllChanges}
      />
    );

    await user.click(screen.getByRole("button", { name: "Changes" }));
    await user.click(screen.getByRole("button", { name: "Apply all changes" }));
    await user.click(screen.getByRole("button", { name: "Discard all changes" }));

    expect(onApplyAllChanges).toHaveBeenCalledOnce();
    expect(onDiscardAllChanges).toHaveBeenCalledOnce();
  });

  it("generates AI edits for selected project files", async () => {
    const user = userEvent.setup();
    const onGenerateSelectedFileChanges = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[thread]}
        projectScan={{
          rootPath: "E:\\CodeHome\\Forge",
          files: [
            { relativePath: "src/App.tsx", size: 42 },
            { relativePath: "src/main.tsx", size: 24 }
          ],
          truncated: false
        }}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
        onGenerateSelectedFileChanges={onGenerateSelectedFileChanges}
      />
    );

    await user.click(screen.getByRole("button", { name: "Changes" }));
    await user.click(screen.getByLabelText("Select src/App.tsx for AI edit"));
    await user.click(screen.getByLabelText("Select src/main.tsx for AI edit"));
    await user.click(screen.getByRole("button", { name: "Generate AI edits for selected" }));

    expect(onGenerateSelectedFileChanges).toHaveBeenCalledWith([
      "src/App.tsx",
      "src/main.tsx"
    ]);
  });
});
