import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { TaskThread } from "@/state/taskThreads";
import {
  collectAgentFileChangeStats,
  collectAgentRecoverySummaryStats,
  createAgentCompletionSummaryMessage,
  getAgentCompletionWorkStartedAt
} from "./agentCompletionSummary";

describe("agent completion summary", () => {
  it("dedupes reads and separates created, edited, and deleted files", () => {
    const thread = createSummaryThread();
    const actions = thread.agentActions ?? [];

    expect(collectAgentFileChangeStats(thread, actions)).toEqual({
      readFiles: ["src/App.tsx"],
      createdFiles: ["docs/new.md"],
      editedFiles: ["README.md"],
      deletedFiles: ["docs/old.md"]
    });
  });

  it("includes file operation counts and timing in the final Chinese summary", () => {
    const thread = createSummaryThread();
    const summary = createAgentCompletionSummaryMessage(
      thread,
      "zh-CN",
      "2025-01-01T00:00:11.000Z"
    );

    expect(summary).toContain("本次已完成，创建了 docs/new.md");
    expect(summary).toContain("创建了 1 个文件");
    expect(summary).toContain("编辑了 1 个文件");
    expect(summary).toContain("删除了 1 个文件");
    expect(summary).toContain("读取了 1 个文件");
    expect(summary).toContain("思考 2 秒");
    expect(summary).toContain("等待 3 秒");
    expect(summary).toContain("总用时 10 秒");
    expect(summary).toContain("查看详情可展开“已处理”");
  });

  it("starts total timing from the first model work event", () => {
    const thread = createSummaryThread();
    const summary = createAgentCompletionSummaryMessage(
      thread,
      "en-US",
      "2025-01-01T00:00:10.000Z"
    );

    expect(getAgentCompletionWorkStartedAt(thread)).toBe("2025-01-01T00:00:01.000Z");
    expect(summary).toContain("total 9s");
  });

  it("includes deduped recovery attempts and paused recovery reasons", () => {
    const baseThread = createSummaryThread();
    const thread = createSummaryThread({
      agentActions: [
        ...(baseThread.agentActions ?? []),
        {
          id: "install-dependency",
          stepId: "step-4",
          kind: "run-command",
          label: "Install dependency",
          status: "skipped",
          command: "npm install left-pad"
        }
      ],
      events: [
        ...baseThread.events,
        {
          id: "auto-recovery-1",
          kind: "error",
          message: "auto recovery",
          createdAt: "2025-01-01T00:00:09.000Z",
          failureRecoveryAttempt: {
            actionId: "edit-new",
            label: "编辑 docs/new.md",
            source: "auto",
            attempt: 1,
            limit: 2
          }
        },
        {
          id: "auto-recovery-duplicate",
          kind: "error",
          message: "duplicate auto recovery",
          createdAt: "2025-01-01T00:00:09.100Z",
          failureRecoveryAttempt: {
            actionId: "edit-new",
            label: "编辑 docs/new.md",
            source: "auto",
            attempt: 1,
            limit: 2
          }
        },
        {
          id: "manual-recovery-1",
          kind: "error",
          message: "manual recovery",
          createdAt: "2025-01-01T00:00:09.200Z",
          failureRecoveryAttempt: {
            actionId: "edit-new",
            label: "编辑 docs/new.md",
            source: "manual"
          }
        },
        {
          id: "thread-1-agent-action-recovery-skip-install-dependency-requires-dependency",
          kind: "plan",
          message: "Automatic recovery paused: Install dependency",
          createdAt: "2025-01-01T00:00:09.300Z",
          autoFailureRecoverySkip: {
            actionId: "install-dependency",
            label: "Install dependency",
            reason: "requires-dependency",
            detail: "Missing dependency or package: left-pad"
          }
        }
      ]
    });

    expect(collectAgentRecoverySummaryStats(thread)).toEqual({
      autoAttempts: 1,
      manualAttempts: 1,
      paused: [
        {
          actionId: "install-dependency",
          label: "Install dependency",
          reason: "requires-dependency",
          detail: "Missing dependency or package: left-pad"
        }
      ]
    });

    const zhSummary = createAgentCompletionSummaryMessage(
      thread,
      "zh-CN",
      "2025-01-01T00:00:12.000Z"
    );
    const enSummary = createAgentCompletionSummaryMessage(
      thread,
      "en-US",
      "2025-01-01T00:00:12.000Z"
    );

    expect(zhSummary).toContain("自动恢复 1 次");
    expect(zhSummary).toContain("人工恢复 1 次");
    expect(zhSummary).toContain("恢复暂停 1 次（需要依赖配置）");
    expect(enSummary).toContain("auto recovery 1 time");
    expect(enSummary).toContain("manual recovery 1 time");
    expect(enSummary).toContain("recovery paused 1 time (dependency setup required)");
  });
});

function createSummaryThread(overrides: Partial<TaskThread> = {}): TaskThread {
  const actions: AgentAction[] = [
    {
      id: "read-1",
      stepId: "step-1",
      kind: "inspect-file",
      label: "读取 src/App.tsx",
      status: "completed",
      target: "src/App.tsx"
    },
    {
      id: "read-duplicate",
      stepId: "step-2",
      kind: "inspect-file",
      label: "读取 src/App.tsx",
      status: "completed",
      target: "src/App.tsx"
    },
    {
      id: "edit-new",
      stepId: "step-3",
      kind: "edit-file",
      label: "编辑 docs/new.md",
      status: "completed",
      target: "docs/new.md"
    }
  ];

  return {
    id: "thread-1",
    title: "summary",
    prompt: "create and edit files",
    status: "completed",
    modelId: "model",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2025-01-01T00:00:00.000Z",
    agentActions: actions,
    events: [
      {
        id: "plan-1",
        kind: "plan",
        message: "planning",
        createdAt: "2025-01-01T00:00:01.000Z",
        completedAt: "2025-01-01T00:00:03.000Z"
      },
      {
        id: "wait-1",
        kind: "plan",
        message: "waiting",
        createdAt: "2025-01-01T00:00:04.000Z",
        agentActionRun: {
          actionId: "edit-new",
          label: "编辑 docs/new.md",
          status: "waiting",
          durationMs: 3000
        }
      },
      {
        id: "file-create",
        kind: "file",
        message: "created file",
        createdAt: "2025-01-01T00:00:06.000Z",
        fileChange: {
          relativePath: "docs/new.md",
          changeKind: "create"
        }
      },
      {
        id: "file-edit",
        kind: "file",
        message: "edited file",
        createdAt: "2025-01-01T00:00:07.000Z",
        fileChange: {
          relativePath: "README.md",
          changeKind: "edit"
        }
      },
      {
        id: "file-delete",
        kind: "file",
        message: "deleted file",
        createdAt: "2025-01-01T00:00:08.000Z",
        fileChange: {
          relativePath: "docs/old.md",
          changeKind: "delete"
        }
      }
    ],
    ...overrides
  };
}
