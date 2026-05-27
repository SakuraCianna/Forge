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
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
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
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
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
        onSelectThread={vi.fn()}
        onRunCommand={onRunCommand}
      />
    );

    await user.type(screen.getByLabelText("命令"), "npm test");
    await user.click(screen.getByRole("button", { name: "运行命令" }));

    expect(onRunCommand).toHaveBeenCalledWith("thread-1", "npm test");
    expect(screen.getByLabelText("命令")).toHaveValue("");
  });
});
