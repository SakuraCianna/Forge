// 本文件说明: 验证对话工作区的流式输出, 反馈按钮和记忆上下文展示
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
  events: []
};

describe("ThreadWorkspace", () => {
  it("renders compact user prompt and assistant answer in the transcript", () => {
    render(
      <ThreadWorkspace
        compact
        language="en-US"
        threads={[
          {
            ...thread,
            events: [
              {
                id: "answer",
                kind: "result",
                message: "A concise answer for the user.",
                createdAt: "2026-05-27T13:00:04.000Z"
              }
            ]
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
        onPickProject={() => undefined}
      />
    );

    const transcript = screen.getByRole("region", { name: "Conversation transcript" });
    const userPrompt = screen.getByText(thread.prompt).closest("article");

    expect(transcript).toHaveTextContent("A concise answer for the user.");
    expect(transcript).toHaveClass("grid", "gap-5");
    expect(userPrompt).toHaveClass("ml-auto", "max-w-[68%]");
    expect(transcript.firstElementChild).toHaveClass("grid", "grid-cols-[20px_minmax(0,1fr)]");
  });

  it("shows compact manual gate confirmation controls", async () => {
    const user = userEvent.setup();
    const onCompleteAgentAction = vi.fn();

    render(
      <ThreadWorkspace
        compact
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            status: "blocked",
            events: [
              {
                id: "plan-ready",
                kind: "plan",
                message: "Execution plan created, but the next step needs your review.",
                createdAt: "2026-05-27T13:00:04.000Z"
              }
            ],
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "manual",
                label: "Review diff",
                status: "pending"
              }
            ]
          }
        ]}
        onSelectThread={() => undefined}
        onCompleteAgentAction={onCompleteAgentAction}
      />
    );

    const controls = screen.getByRole("region", { name: "Agent action confirmation" });

    expect(within(controls).getAllByText("Waiting for manual confirmation").length).toBeGreaterThan(0);

    await user.click(within(controls).getByRole("button", { name: "Mark review complete" }));

    expect(onCompleteAgentAction).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ id: "action-1", kind: "manual" })
    );
  });

  it("shows compact command approval controls", async () => {
    const user = userEvent.setup();
    const onApproveAgentCommand = vi.fn();

    render(
      <ThreadWorkspace
        compact
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            status: "blocked",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "run-command",
                label: "Install dependencies",
                status: "pending",
                command: "npm install"
              }
            ]
          }
        ]}
        onSelectThread={() => undefined}
        onApproveAgentCommand={onApproveAgentCommand}
      />
    );

    await user.click(screen.getByRole("button", { name: "Approve command npm install" }));

    expect(onApproveAgentCommand).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ id: "action-1", command: "npm install" })
    );
  });

  it("opens pending compact file changes in the files view", async () => {
    const user = userEvent.setup();
    const onPreviewFile = vi.fn();
    const onOpenFiles = vi.fn();

    render(
      <ThreadWorkspace
        compact
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            status: "running",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "edit-file",
                label: "Edit src/App.tsx",
                status: "running",
                target: "src/App.tsx"
              }
            ]
          }
        ]}
        changePreviews={[
          {
            relativePath: "src/App.tsx",
            currentContent: "old",
            nextContent: "new",
            diff: [],
            source: {
              threadId: "thread-1",
              actionId: "action-1"
            }
          }
        ]}
        onSelectThread={() => undefined}
        onPreviewFile={onPreviewFile}
        onOpenFiles={onOpenFiles}
      />
    );

    await user.click(screen.getByRole("button", { name: "Review changes src/App.tsx" }));

    expect(onPreviewFile).toHaveBeenCalledWith("src/App.tsx");
    expect(onOpenFiles).toHaveBeenCalled();
  });

  it("renders compact assistant output as markdown", () => {
    render(
      <ThreadWorkspace
        compact
        language="en-US"
        threads={[
          {
            ...thread,
            events: [
              {
                id: "answer",
                kind: "result",
                message: "**你好**\n\n- 欢迎回来",
                createdAt: "2026-05-27T13:01:00.000Z"
              }
            ]
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
      />
    );

    expect(screen.getByText("你好").tagName).toBe("STRONG");
    expect(screen.getByText("欢迎回来")).toBeInTheDocument();
  });

  it("renders compact assistant markdown tables as real tables", () => {
    render(
      <ThreadWorkspace
        compact
        language="en-US"
        threads={[
          {
            ...thread,
            events: [
              {
                id: "answer",
                kind: "result",
                message: [
                  "**Generated files**",
                  "",
                  "| File | Status |",
                  "| --- | --- |",
                  "| README.md | created |"
                ].join("\n"),
                createdAt: "2026-05-27T13:01:00.000Z"
              }
            ]
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
      />
    );

    expect(screen.getByText("Generated files").tagName).toBe("STRONG");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "File" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "created" })).toBeInTheDocument();
  });

  it("keeps compact user prompts minimal and formats assistant timing", () => {
    render(
      <ThreadWorkspace
        compact
        language="en-US"
        threads={[
          {
            ...thread,
            prompt: "What did this project do?",
            events: [
              {
                id: "answer",
                kind: "result",
                message: "It builds a desktop coding workbench.",
                createdAt: "2026-05-27T13:01:02.333Z",
                completedAt: "2026-05-27T13:01:09.900Z"
              }
            ]
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
      />
    );

    const userPrompt = screen.getByText("What did this project do?").closest("article");
    const transcript = screen.getByRole("region", { name: "Conversation transcript" });

    expect(userPrompt).toHaveClass("ml-auto", "max-w-[68%]");
    expect(transcript.firstElementChild).toHaveClass("grid", "grid-cols-[20px_minmax(0,1fr)]");
    expect(screen.getByText(/2026-05-27 \d{2}:01:09/)).toBeInTheDocument();
    expect(screen.getByText(/LLM 8s/)).toBeInTheDocument();
  });

  it("uses tighter compact user bubbles", () => {
    render(
      <ThreadWorkspace
        compact
        language="en-US"
        threads={[
          {
            ...thread,
            prompt: "What changed?"
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
      />
    );

    const userBubble = screen.getByText("What changed?").closest("article");

    expect(userBubble).toHaveClass("px-3");
    expect(userBubble).toHaveClass("py-1.5");
    expect(userBubble).toHaveClass("leading-5");
    expect(userBubble).not.toHaveClass("py-3");
  });

  it("shows assistant response actions and copies the answer", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(
      <ThreadWorkspace
        compact
        language="en-US"
        threads={[
          {
            ...thread,
            events: [
              {
                id: "answer",
                kind: "result",
                message: "It builds a desktop coding workbench.",
                createdAt: "2026-05-27T13:01:02.333Z",
                completedAt: "2026-05-27T13:01:09.900Z"
              }
            ]
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
      />
    );

    await user.click(screen.getByRole("button", { name: "Copy response" }));

    expect(writeText).toHaveBeenCalledWith("It builds a desktop coding workbench.");
    expect(screen.getByRole("button", { name: "Copy response" })).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Like response" })).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "Dislike response" })).not.toHaveAttribute("title");
    expect(screen.getByRole("tooltip", { name: "Copy response" })).toHaveClass("forge-tooltip");
    expect(screen.getByRole("tooltip", { name: "Like response" })).toHaveClass("forge-tooltip");
    expect(screen.getByRole("tooltip", { name: "Dislike response" })).toHaveClass("forge-tooltip");
  });

  it("shows compact memory context without expanding the transcript", () => {
    render(
      <ThreadWorkspace
        compact
        language="zh-CN"
        threads={[
          {
            ...thread,
            contextMemories: [
              {
                id: "memory-1",
                scope: "project",
                projectPath: "E:\\CodeHome\\Forge",
                content: "这个项目默认终端是 PowerShell"
              },
              {
                id: "memory-2",
                scope: "global",
                projectPath: null,
                content: "回答保持简洁"
              }
            ],
            events: [
              {
                id: "answer",
                kind: "result",
                message: "我会按这些记忆回答。",
                createdAt: "2026-05-27T13:01:02.333Z"
              }
            ]
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
      />
    );

    const memoryContext = screen.getByRole("group", { name: "Agent 记忆上下文" });

    expect(memoryContext).toHaveTextContent("已使用 2 条记忆");
    expect(memoryContext).toHaveTextContent("这个项目默认终端是 PowerShell");
    expect(memoryContext).toHaveTextContent("回答保持简洁");
  });

  it("renders follow-up user turns as minimal prompt bubbles", () => {
    render(
      <ThreadWorkspace
        compact
        language="en-US"
        threads={[
          {
            ...thread,
            prompt: "你好",
            events: [
              {
                id: "answer-1",
                kind: "result",
                message: "你好, 我在",
                createdAt: "2026-05-27T13:01:00.000Z"
              },
              {
                id: "user-2",
                kind: "user",
                message: "继续刚才的话题",
                createdAt: "2026-05-27T13:02:00.000Z"
              }
            ]
          }
        ]}
        selectedThreadId="thread-1"
        onSelectThread={() => undefined}
      />
    );

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByText("继续刚才的话题")).toBeInTheDocument();
    expect(screen.queryByText("Run transcript")).not.toBeInTheDocument();
  });

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

    expect(screen.getAllByText("实现设置持久化").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/openai:gpt-5.5/)).toBeInTheDocument();
    expect(screen.queryByText("Internal progress message")).not.toBeInTheDocument();
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

  it("shows generated agent steps on the plan tab", () => {
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

    expect(screen.getByText("Steps")).toBeInTheDocument();
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

  it("shows recent command output in the run transcript", () => {
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

    const timeline = screen.getByRole("region", { name: "Run transcript" });
    expect(timeline).not.toBeNull();
    expect(within(timeline!).getByText("npm run build")).toBeInTheDocument();
    expect(within(timeline!).getByText("exit 1")).toBeInTheDocument();
    expect(within(timeline!).getByText("compiled renderer")).toBeInTheDocument();
    expect(within(timeline!).getByText("type error")).toBeInTheDocument();
  });

  it("offers failed command recovery from the run transcript", async () => {
    const user = userEvent.setup();
    const onGenerateCommandFix = vi.fn();
    const onRunCommand = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Recover failed transcript command",
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
        onRunCommand={onRunCommand}
        onPreviewFile={vi.fn()}
        onGenerateCommandFix={onGenerateCommandFix}
      />
    );

    const transcript = screen.getByRole("region", { name: "Run transcript" });
    expect(within(transcript).getByText("Command failed")).toBeInTheDocument();
    expect(within(transcript).getByText("failed tests")).toBeInTheDocument();

    await user.click(within(transcript).getByRole("button", { name: "Generate fix plan for npm test" }));
    expect(onGenerateCommandFix).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ command: "npm test", exitCode: 1 })
    );

    await user.click(within(transcript).getByRole("button", { name: "Retry command npm test" }));
    expect(onRunCommand).toHaveBeenCalledWith("thread-1", "npm test");

    await user.click(within(transcript).getByRole("button", { name: "View output for npm test" }));
    expect(screen.getByText("Command history")).toBeInTheDocument();
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

  it("approves command actions that require a one-time confirmation", async () => {
    const user = userEvent.setup();
    const onApproveAgentCommand = vi.fn();
    const onRunAgentAction = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Approve command",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "run-command",
                label: "Install dependencies",
                status: "pending",
                command: "npm install"
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
        onApproveAgentCommand={onApproveAgentCommand}
      />
    );

    await user.click(screen.getByRole("button", { name: "Approve command npm install" }));

    expect(onApproveAgentCommand).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ id: "action-1", command: "npm install" })
    );
    expect(onRunAgentAction).not.toHaveBeenCalled();
  });

  it("treats approval-gated commands as runnable when full access is enabled", async () => {
    const user = userEvent.setup();
    const onRunAgentActions = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Run full access command",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "run-command",
                label: "Install dependencies",
                status: "pending",
                command: "npm install"
              }
            ]
          }
        ]}
        fullAccess
        projectScan={null}
        previewFile={null}
        changePreview={null}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
        onRunAgentActions={onRunAgentActions}
      />
    );

    const status = screen.getByRole("region", { name: "Agent run" });
    expect(within(status).getByText("Ready for safe batch")).toBeInTheDocument();
    expect(within(status).getByText("1 safe actions ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve command npm install" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue safe agent actions" }));

    expect(onRunAgentActions).toHaveBeenCalledWith("thread-1", [
      expect.objectContaining({ id: "action-1", command: "npm install" })
    ]);
  });

  it("shows command approval audit records in the command history", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Audit command approval",
            events: [
              {
                id: "event-command-approved",
                kind: "command",
                message:
                  "Command approved: npm install (command may change dependencies or project state)",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandApproval: {
                  command: "npm install",
                  reason: "command may change dependencies or project state",
                  approvedAt: "2026-05-27T13:05:00.000Z"
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

    const approvals = screen.getByRole("region", { name: "Command approvals" });
    expect(within(approvals).getByText("Command approvals")).toBeInTheDocument();
    expect(within(approvals).getByText("npm install")).toBeInTheDocument();
    expect(
      within(approvals).getByText("command may change dependencies or project state")
    ).toBeInTheDocument();
    expect(within(approvals).getByText(/2026-05-27/)).toBeInTheDocument();
  });

  it("localizes built-in command approval reasons in Chinese", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="zh-CN"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "审计命令批准",
            events: [
              {
                id: "event-command-approved",
                kind: "command",
                message:
                  "Command approved: npm install (command may change dependencies or project state)",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandApproval: {
                  command: "npm install",
                  reason: "command may change dependencies or project state",
                  approvedAt: "2026-05-27T13:05:00.000Z"
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

    expect(screen.getByText("命令会修改依赖或项目状态")).toBeInTheDocument();
    expect(screen.queryByText("command may change dependencies or project state")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "命令" }));

    const approvals = screen.getByRole("region", { name: "命令审批记录" });
    expect(within(approvals).getByText("npm install")).toBeInTheDocument();
    expect(within(approvals).getByText("命令会修改依赖或项目状态")).toBeInTheDocument();
    expect(
      within(approvals).queryByText("command may change dependencies or project state")
    ).not.toBeInTheDocument();
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

  it("shows command output for the selected agent action when commands repeat", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Repeated command output",
            events: [
              {
                id: "event-command-action-1",
                kind: "result",
                message: "Unit test command finished",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  actionId: "action-1",
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 0,
                  stdout: "unit suite passed",
                  stderr: "",
                  timedOut: false
                }
              },
              {
                id: "event-command-action-2",
                kind: "error",
                message: "Integration test command failed",
                createdAt: "2026-05-27T13:06:00.000Z",
                commandResult: {
                  actionId: "action-2",
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: "integration suite failed",
                  stderr: "database unavailable",
                  timedOut: false
                }
              }
            ],
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "run-command",
                label: "Run unit tests",
                status: "completed",
                command: "npm test"
              },
              {
                id: "action-2",
                stepId: "step-2",
                kind: "run-command",
                label: "Run integration tests",
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

    await user.click(screen.getByRole("button", { name: "Select action Run unit tests" }));

    const details = screen.getByRole("region", { name: "Action details" });
    expect(within(details).getByText("unit suite passed")).toBeInTheDocument();
    expect(within(details).queryByText("integration suite failed")).not.toBeInTheDocument();
    expect(within(details).queryByText("database unavailable")).not.toBeInTheDocument();
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

  it("blocks queued verification while generated file changes are still pending", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Apply generated changes",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "edit-file",
                label: "Edit src/App.tsx",
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
              }
            ]
          }
        ]}
        projectScan={null}
        previewFile={null}
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
        onRunAgentActions={vi.fn()}
      />
    );

    const status = screen.getByRole("region", { name: "Agent run" });
    expect(within(status).getByText("Review generated changes")).toBeInTheDocument();
    expect(within(status).getByText("1 pending change")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue safe agent actions" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review changes" }));

    expect(screen.getByText("Pending changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending change src/App.tsx" })).toBeInTheDocument();
  });

  it("shows review state when a running edit action has generated pending changes", () => {
    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Review running edit",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "edit-file",
                label: "Edit src/App.tsx",
                status: "running",
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
        onRunAgentActions={vi.fn()}
      />
    );

    const status = screen.getByRole("region", { name: "Agent run" });
    expect(within(status).getByText("Review generated changes")).toBeInTheDocument();
    expect(within(status).getByText("1 pending change")).toBeInTheDocument();
    expect(within(status).queryByText("Running")).not.toBeInTheDocument();
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

  it("marks a manual review gate complete so the queue can continue", async () => {
    const user = userEvent.setup();
    const onCompleteAgentAction = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Review before verification",
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
        onCompleteAgentAction={onCompleteAgentAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mark review complete" }));

    expect(onCompleteAgentAction).toHaveBeenCalledWith(
      "thread-1",
      expect.objectContaining({ id: "action-1", kind: "manual" })
    );
  });

  it("opens source control from a pending commit gate", async () => {
    const user = userEvent.setup();
    const onOpenSourceControl = vi.fn();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Commit after verification",
            agentActions: [
              {
                id: "action-1",
                stepId: "step-1",
                kind: "run-command",
                label: "Run npm test",
                status: "completed",
                command: "npm test"
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
        onOpenSourceControl={onOpenSourceControl}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open source control" }));

    expect(onOpenSourceControl).toHaveBeenCalledOnce();
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

  it("copies command output with command metadata from the command history", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Copy command output",
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
    await user.click(screen.getByRole("button", { name: "Copy output" }));

    expect(writeText).toHaveBeenCalledWith(
      "$ npm test\ncwd: E:\\CodeHome\\Forge\nexit 1\n\nstdout:\nran 199 tests\n\nstderr:\nfailed tests"
    );
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

    const transcript = screen.getByRole("region", { name: "Run transcript" });
    expect(within(transcript).getByText("Running command")).toBeInTheDocument();
    expect(within(transcript).getByText("npm run build")).toBeInTheDocument();
    expect(within(transcript).getByText("building client")).toBeInTheDocument();
    expect(within(transcript).getByText("warning: cache miss")).toBeInTheDocument();
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

  it("keeps the final error visible when command history output is long", async () => {
    const user = userEvent.setup();

    render(
      <ThreadWorkspace
        language="en-US"
        selectedThreadId="thread-1"
        threads={[
          {
            ...thread,
            title: "Long command output",
            events: [
              {
                id: "event-command-result",
                kind: "error",
                message: "Command failed",
                createdAt: "2026-05-27T13:05:00.000Z",
                commandResult: {
                  command: "npm test",
                  cwd: "E:\\CodeHome\\Forge",
                  exitCode: 1,
                  stdout: `start\n${"x".repeat(1200)}\nFINAL ERROR: failed assertion`,
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

    await user.click(screen.getByRole("button", { name: "Commands" }));

    expect(screen.getByText(/output truncated/)).toBeInTheDocument();
    expect(screen.getByText(/FINAL ERROR: failed assertion/)).toBeInTheDocument();
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

  it("accepts or rejects a single diff hunk from the preview", async () => {
    const user = userEvent.setup();
    const onPreviewChange = vi.fn();
    const diff = [
      { kind: "remove" as const, oldLineNumber: 1, text: "a" },
      { kind: "add" as const, newLineNumber: 1, text: "A" },
      { kind: "context" as const, oldLineNumber: 2, newLineNumber: 2, text: "b" },
      { kind: "remove" as const, oldLineNumber: 3, text: "c" },
      { kind: "add" as const, newLineNumber: 3, text: "C" },
      { kind: "context" as const, oldLineNumber: 4, newLineNumber: 4, text: "d" }
    ];

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
          content: "a\nb\nc\nd",
          size: 7
        }}
        changePreview={{
          relativePath: "src/App.tsx",
          currentContent: "a\nb\nc\nd",
          nextContent: "A\nb\nC\nd",
          diff
        }}
        onSelectThread={vi.fn()}
        onRunCommand={vi.fn()}
        onPreviewFile={vi.fn()}
        onPreviewChange={onPreviewChange}
        onApplyChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Changes" }));
    await user.click(screen.getByRole("button", { name: "Reject hunk 1 src/App.tsx" }));
    await user.click(screen.getByRole("button", { name: "Keep only hunk 2 src/App.tsx" }));

    expect(onPreviewChange).toHaveBeenNthCalledWith(1, "src/App.tsx", "a\nb\nC\nd");
    expect(onPreviewChange).toHaveBeenNthCalledWith(2, "src/App.tsx", "a\nb\nC\nd");
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
