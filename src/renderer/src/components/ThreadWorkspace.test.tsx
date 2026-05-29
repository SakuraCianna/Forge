import { render, screen, within } from "@testing-library/react";
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

  it("surfaces a running command in the thread header", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Watch running command",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  status: "running"
                }
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

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Running command")).toBeInTheDocument();
    expect(within(header).getByText("npm run build")).toBeInTheDocument();
  });

  it("opens command history from the thread header activity summary", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Jump to running command",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  status: "running"
                }
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

    expect(screen.queryByText("Command history")).not.toBeInTheDocument();

    const header = screen.getByRole("banner");
    await user.click(within(header).getByRole("button", { name: /Running command.*npm run build/ }));

    expect(screen.getByText("Command history")).toBeInTheDocument();
    const commandHistory = screen.getByText("Command history").closest("section");
    expect(commandHistory).not.toBeNull();
    expect(within(commandHistory!).getByText("npm run build")).toBeInTheDocument();
  });

  it("surfaces background thread command activity in the thread list", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          thread,
          {
            ...thread,
            id: "thread-2",
            title: "Background build",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  status: "running"
                }
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

    expect(
      screen.getByRole("button", { name: /Background build.*Running command.*npm run build/ })
    ).toBeInTheDocument();
  });

  it("surfaces the latest failed command in the thread header", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Review failed command",
            events: [
              ...thread.events,
              {
                id: "event-command-result",
                kind: "error",
                message: "Command failed",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: "ran 10 tests",
                  stderr: "failed tests",
                  timedOut: false
                }
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

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Last failure")).toBeInTheDocument();
    expect(within(header).getByText("npm test")).toBeInTheDocument();
    expect(within(header).getByText("exit 1")).toBeInTheDocument();
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
    expect(screen.getAllByText("Inspect src/App.tsx").length).toBeGreaterThan(0);
    expect(screen.getByText("Run npm test")).toBeInTheDocument();
  });

  it("does not claim tests are ready without a real command result", () => {
    render(
      <ThreadWorkspace
        language="en-US"
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

    expect(screen.queryByText("npm test ready")).not.toBeInTheDocument();
    expect(screen.getByText("No verification commands have finished yet")).toBeInTheDocument();
  });

  it("shows the latest verification command result on the plan tab", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Verify command result",
            events: [
              ...thread.events,
              {
                id: "event-command-result",
                kind: "result",
                message: "Command finished",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 0,
                  stdout: "221 passed",
                  stderr: "",
                  timedOut: false
                }
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

    const verification = screen.getByText("Verification").closest("section");
    expect(verification).not.toBeNull();
    expect(within(verification!).getByText("npm test")).toBeInTheDocument();
    expect(within(verification!).getByText("exit 0")).toBeInTheDocument();
    expect(within(verification!).getByText("221 passed")).toBeInTheDocument();
  });

  it("shows recent command output in the agent timeline", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Timeline output",
            events: [
              ...thread.events,
              {
                id: "event-plan-old",
                kind: "plan",
                message: "Old event",
                createdAt: "2026-05-27T13:01:00.000Z"
              },
              {
                id: "event-command-result",
                kind: "error",
                message: "Command failed",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm run build",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: "compiled renderer",
                  stderr: "type error",
                  timedOut: false
                }
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

    const timeline = screen.getByText("Agent timeline").closest("section");
    expect(timeline).not.toBeNull();
    expect(within(timeline!).getByText("npm run build")).toBeInTheDocument();
    expect(within(timeline!).getByText("exit 1")).toBeInTheDocument();
    expect(within(timeline!).getByText("compiled renderer")).toBeInTheDocument();
    expect(within(timeline!).getByText("type error")).toBeInTheDocument();
  });

  it("runs command actions and opens file actions from the agent queue", async () => {
    const user = userEvent.setup();
    const onRunAgentAction = vi.fn();

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
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
        onRunAgentAction={onRunAgentAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open action src/App.tsx" }));
    await user.click(screen.getByRole("button", { name: "Run action npm test" }));

    expect(onRunAgentAction).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      expect.objectContaining({ id: "action-1", target: "src/App.tsx" })
    );
    expect(onRunAgentAction).toHaveBeenNthCalledWith(
      2,
      "thread-1",
      expect.objectContaining({ id: "action-2", command: "npm test" })
    );
  });

  it("shows details for the selected agent action", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Inspect action details",
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

    const details = screen.getByRole("region", { name: "Action details" });
    expect(within(details).getByText("Inspect src/App.tsx")).toBeInTheDocument();
    expect(within(details).getByText("Target")).toBeInTheDocument();
    expect(within(details).getByText("src/App.tsx")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select action Run npm test" }));

    expect(within(details).getByText("Run npm test")).toBeInTheDocument();
    expect(within(details).getByText("Command")).toBeInTheDocument();
    expect(within(details).getByText("npm test")).toBeInTheDocument();
    expect(within(details).getByText("Ready to run")).toBeInTheDocument();
  });

  it("shows the latest output for a matching command action", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Inspect command output",
            events: [
              ...thread.events,
              {
                id: "event-command-result",
                kind: "error",
                message: "Command failed",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: "ran 10 tests",
                  stderr: "failed tests",
                  timedOut: false
                }
              }
            ],
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "run-command",
                label: "Run npm test",
                status: "failed",
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

    const details = screen.getByRole("region", { name: "Action details" });
    expect(within(details).getByText("Last command output")).toBeInTheDocument();
    expect(within(details).getByText("Exit code")).toBeInTheDocument();
    expect(within(details).getByText("1")).toBeInTheDocument();
    expect(within(details).getByText("stderr")).toBeInTheDocument();
    expect(within(details).getByText("failed tests")).toBeInTheDocument();
  });

  it("runs the next pending agent action from the queue", async () => {
    const user = userEvent.setup();
    const onRunAgentAction = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Step through agent queue",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "inspect-file",
                label: "Inspect src/App.tsx",
                status: "completed",
                target: "src/App.tsx"
              },
              {
                id: "action-2",
                stepId: "step-2",
                kind: "edit-file",
                label: "Edit src/App.tsx",
                status: "pending",
                target: "src/App.tsx"
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
        onRunAgentAction={onRunAgentAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "Run next agent action" }));

    expect(onRunAgentAction).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ id: "action-2", kind: "edit-file" })
    );
  });

  it("runs the safe pending agent action batch without crossing a manual gate", async () => {
    const user = userEvent.setup();
    const onRunAgentActions = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Continue agent queue",
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
              },
              {
                id: "action-3",
                stepId: "step-3",
                kind: "manual",
                label: "Review diff",
                status: "pending"
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
        onRunAgentActions={onRunAgentActions}
      />
    );

    expect(screen.getAllByText("2 safe actions ready").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Stops before Review diff").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Continue safe agent actions" }));

    expect(onRunAgentActions).toHaveBeenCalledWith(
      "thread-1",
      expect.arrayContaining([
        expect.objectContaining({ id: "action-1" }),
        expect.objectContaining({ id: "action-2" })
      ])
    );
    expect(onRunAgentActions.mock.calls[0][1]).toHaveLength(2);
  });

  it("summarizes the agent run state above the timeline", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Track agent run",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "inspect-file",
                label: "Inspect src/App.tsx",
                status: "completed",
                target: "src/App.tsx"
              },
              {
                id: "action-2",
                stepId: "step-2",
                kind: "run-command",
                label: "Run npm test",
                status: "pending",
                command: "npm test"
              },
              {
                id: "action-3",
                stepId: "step-3",
                kind: "edit-file",
                label: "Edit src/App.tsx",
                status: "pending",
                target: "src/App.tsx"
              },
              {
                id: "action-4",
                stepId: "step-4",
                kind: "manual",
                label: "Review diff",
                status: "pending"
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
        onRunAgentActions={vi.fn()}
      />
    );

    const status = screen.getByRole("region", { name: "Agent run" });
    expect(within(status).getByText("Ready for safe batch")).toBeInTheDocument();
    expect(within(status).getByText("1 / 4 actions completed")).toBeInTheDocument();
    expect(within(status).getByText("2 safe actions ready")).toBeInTheDocument();
    expect(within(status).getByText("Stops before Review diff")).toBeInTheDocument();
  });

  it("shows manual gates as review requirements instead of runnable steps", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Review before commit",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "manual",
                label: "Review diff",
                status: "pending"
              },
              {
                id: "action-2",
                stepId: "step-2",
                kind: "commit",
                label: "Commit changes",
                status: "pending"
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
        onRunAgentAction={vi.fn()}
        onRunAgentActions={vi.fn()}
      />
    );

    expect(screen.getAllByText("Manual review required").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review diff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review gate").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: "Run next agent action" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue safe agent actions" })
    ).not.toBeInTheDocument();
  });

  it("shows queue progress and blocks continuation after a failed action", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Fix failed command",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "inspect-file",
                label: "Inspect src/App.tsx",
                status: "completed",
                target: "src/App.tsx"
              },
              {
                id: "action-2",
                stepId: "step-2",
                kind: "run-command",
                label: "Run npm test",
                status: "failed",
                command: "npm test"
              },
              {
                id: "action-3",
                stepId: "step-3",
                kind: "run-command",
                label: "Run npm run build",
                status: "pending",
                command: "npm run build"
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
        onRunAgentAction={vi.fn()}
        onRunAgentActions={vi.fn()}
      />
    );

    expect(screen.getAllByText("1 / 3 actions completed").length).toBeGreaterThan(0);
    expect(screen.getByText("1 failed")).toBeInTheDocument();
    expect(screen.getByText("Queue stopped at Run npm test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run next agent action" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue safe agent actions" })
    ).not.toBeInTheDocument();
  });

  it("offers recovery actions for a failed agent action", async () => {
    const user = userEvent.setup();
    const onGenerateFailureFix = vi.fn();
    const onRunAgentAction = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Recover failed command",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "run-command",
                label: "Run npm test",
                status: "failed",
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
        onGenerateFailureFix={onGenerateFailureFix}
        onRunAgentAction={onRunAgentAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "View logs" }));
    expect(screen.queryByText("Agent action queue")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Plan" }));
    await user.click(screen.getByRole("button", { name: "Retry failed action" }));
    expect(onRunAgentAction).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ id: "action-1" })
    );

    await user.click(screen.getByRole("button", { name: "Generate fix plan" }));
    expect(onGenerateFailureFix).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ id: "action-1" })
    );
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

  it("shows command history on the commands tab", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Review command history",
            events: [
              ...thread.events,
              {
                id: "event-command-result",
                kind: "error",
                message: "Command failed",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: "ran 199 tests",
                  stderr: "failed tests",
                  timedOut: false
                }
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

    await user.click(screen.getByRole("button", { name: "Commands" }));

    expect(screen.getByText("Command history")).toBeInTheDocument();
    const commandHistory = screen.getByText("Command history").closest("section");
    expect(commandHistory).not.toBeNull();
    expect(within(commandHistory!).getByText("npm test")).toBeInTheDocument();
    expect(within(commandHistory!).getByText("exit 1")).toBeInTheDocument();
    expect(within(commandHistory!).getByText("stderr")).toBeInTheDocument();
    expect(within(commandHistory!).getByText("failed tests")).toBeInTheDocument();
  });

  it("shows a running command in the command history", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Watch running command",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  status: "running"
                }
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

    await user.click(screen.getByRole("button", { name: "Commands" }));

    const commandHistory = screen.getByText("Command history").closest("section");
    expect(commandHistory).not.toBeNull();
    expect(within(commandHistory!).getByText("npm run build")).toBeInTheDocument();
    expect(within(commandHistory!).getByText("running")).toBeInTheDocument();
  });

  it("keeps a matching command running when another run id has finished", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Track repeated command runs",
            events: [
              ...thread.events,
              {
                id: "event-command-started-1",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm test",
                  runId: "run-1",
                  status: "running"
                }
              },
              {
                id: "event-command-started-2",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:06:00.000Z",
                commandRun: {
                  command: "npm test",
                  runId: "run-2",
                  status: "running"
                }
              },
              {
                id: "event-command-result-1",
                kind: "result",
                message: "Command finished",
                createdAt: "2026-05-27T13:07:00.000Z",
                commandResult: {
                  command: "npm test",
                  runId: "run-1",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 0,
                  stdout: "passed",
                  stderr: "",
                  timedOut: false
                }
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

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Running command")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Commands" }));

    const commandHistory = screen.getByText("Command history").closest("section");
    expect(commandHistory).not.toBeNull();
    expect(within(commandHistory!).getByText("running")).toBeInTheDocument();
  });

  it("cancels a running command from the command history", async () => {
    const user = userEvent.setup();
    const onCancelCommand = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Cancel running command",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  runId: "run-1",
                  status: "running"
                }
              }
            ]
          }
        ]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onCancelCommand={onCancelCommand}
        onPreviewFile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Commands" }));
    await user.click(screen.getByRole("button", { name: "Cancel command" }));

    expect(onCancelCommand).toHaveBeenCalledWith("thread-1", "run-1");
  });

  it("does not show a placeholder exit code for a running command", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Watch running command",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  status: "running"
                }
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

    await user.click(screen.getByRole("button", { name: "Commands" }));

    const commandHistory = screen.getByText("Command history").closest("section");
    expect(commandHistory).not.toBeNull();
    expect(within(commandHistory!).queryByText("exit null")).not.toBeInTheDocument();
  });

  it("shows live output for a running command", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Watch live output",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  runId: "run-1",
                  status: "running",
                  stdout: "building client\n",
                  stderr: "warning: cache miss\n"
                }
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

    await user.click(screen.getByRole("button", { name: "Commands" }));

    const commandHistory = screen.getByText("Command history").closest("section");
    expect(commandHistory).not.toBeNull();
    expect(within(commandHistory!).getByText("building client")).toBeInTheDocument();
    expect(within(commandHistory!).getByText("warning: cache miss")).toBeInTheDocument();
  });

  it("keeps a live running command visible on the plan tab", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Watch active run",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  runId: "run-1",
                  status: "running",
                  stdout: "building client\n",
                  stderr: "warning: cache miss\n"
                }
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

    const activeRun = screen.getByText("Active run").closest("section");
    expect(activeRun).not.toBeNull();
    expect(within(activeRun!).getByText("npm run build")).toBeInTheDocument();
    expect(within(activeRun!).getByText("building client")).toBeInTheDocument();
    expect(within(activeRun!).getByText("warning: cache miss")).toBeInTheDocument();
  });

  it("cancels a running command from the active run panel", async () => {
    const user = userEvent.setup();
    const onCancelCommand = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Cancel active run",
            events: [
              ...thread.events,
              {
                id: "event-command-started",
                kind: "command",
                message: "Started command",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandRun: {
                  command: "npm run build",
                  runId: "run-1",
                  status: "running",
                  stdout: "building client\n"
                }
              }
            ]
          }
        ]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onCancelCommand={onCancelCommand}
        onPreviewFile={vi.fn()}
      />
    );

    const activeRun = screen.getByText("Active run").closest("section");
    expect(activeRun).not.toBeNull();
    await user.click(within(activeRun!).getByRole("button", { name: "Stop command" }));

    expect(onCancelCommand).toHaveBeenCalledWith("thread-1", "run-1");
  });

  it("generates a fix plan from a failed command history entry", async () => {
    const user = userEvent.setup();
    const onGenerateCommandFix = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Fix from command history",
            events: [
              ...thread.events,
              {
                id: "event-command-result",
                kind: "error",
                message: "Command failed",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: "ran 199 tests",
                  stderr: "failed tests",
                  timedOut: false
                }
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
        onGenerateCommandFix={onGenerateCommandFix}
      />
    );

    await user.click(screen.getByRole("button", { name: "Commands" }));
    await user.click(screen.getByRole("button", { name: "Generate fix plan" }));

    expect(onGenerateCommandFix).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({
        command: "npm test",
        exitCode: 1,
        stderr: "failed tests"
      })
    );
  });

  it("reruns a command from a failed command history entry", async () => {
    const user = userEvent.setup();
    const onRunCommand = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Retry from command history",
            events: [
              ...thread.events,
              {
                id: "event-command-result",
                kind: "error",
                message: "Command failed",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: "ran 10 tests",
                  stderr: "failed tests",
                  timedOut: false
                }
              }
            ]
          }
        ]}
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={onRunCommand}
        onPreviewFile={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Commands" }));
    await user.click(screen.getByRole("button", { name: "Retry command" }));

    expect(onRunCommand).toHaveBeenCalledWith("thread-1", "npm test");
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
