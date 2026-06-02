import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { TaskThread } from "@/state/taskThreads";
import {
  appendAgentActionOutcomeRecord,
  appendAgentActionRunRecord,
  appendAgentCompletionSummaryIfDone,
  appendFailureRecoverySuggestion,
  applyAgentActionDecisionStatus,
  createAgentActionRunEvent
} from "./agentActionLifecycle";

describe("agent action lifecycle", () => {
  it("creates structured run events for action details", () => {
    const event = createAgentActionRunEvent({
      threadId: "thread-1",
      action: editAction,
      language: "en-US",
      createdAt: "2025-01-01T00:00:01.000Z",
      record: {
        status: "started",
        startedAt: "2025-01-01T00:00:01.000Z"
      }
    });

    expect(event).toMatchObject({
      id: "thread-1-agent-action-run-started-edit-1-2025-01-01T00:00:01.000Z",
      kind: "plan",
      message: "Started agent action: Edit README.md",
      agentActionRun: {
        actionId: "edit-1",
        label: "Edit README.md",
        status: "started"
      }
    });
  });

  it("dedupes failure recovery suggestions for the same action", () => {
    const once = appendFailureRecoverySuggestion([createThread()], {
      threadId: "thread-1",
      action: editAction,
      status: "failed",
      agentProfile: suggestRecoveryProfile,
      language: "en-US",
      createdAt: "2025-01-01T00:00:02.000Z"
    });
    const twice = appendFailureRecoverySuggestion(once, {
      threadId: "thread-1",
      action: editAction,
      status: "failed",
      agentProfile: suggestRecoveryProfile,
      language: "en-US",
      createdAt: "2025-01-01T00:00:03.000Z"
    });

    expect(twice[0]?.events.filter((event) => event.id.includes("recovery-suggestion"))).toHaveLength(1);
  });

  it("appends outcome records with duration and recovery suggestions", () => {
    const threads = appendAgentActionOutcomeRecord([createThread()], {
      threadId: "thread-1",
      action: editAction,
      outcome: "failed",
      startedAt: "2025-01-01T00:00:01.000Z",
      completedAt: "2025-01-01T00:00:04.000Z",
      agentProfile: suggestRecoveryProfile,
      language: "en-US"
    });
    const events = threads[0]?.events ?? [];

    expect(events.at(-2)?.agentActionRun).toMatchObject({
      actionId: "edit-1",
      status: "failed",
      durationMs: 3000
    });
    expect(events.at(-1)?.message).toContain("Recovery notice");
  });

  it("updates action status when users confirm or skip a gate", () => {
    const threads = applyAgentActionDecisionStatus([createThread()], {
      threadId: "thread-1",
      action: reviewAction,
      status: "skipped",
      language: "en-US",
      createdAt: "2025-01-01T00:00:05.000Z"
    });
    const thread = threads[0];

    expect(thread?.agentActions?.find((action) => action.id === "review-1")?.status).toBe("skipped");
    expect(thread?.events.at(-1)?.agentActionRun).toMatchObject({
      actionId: "review-1",
      status: "skipped",
      completedAt: "2025-01-01T00:00:05.000Z"
    });
  });

  it("appends the final summary once all actions are settled", () => {
    const settledThread = createThread({
      status: "running",
      agentActions: [
        { ...editAction, status: "completed" },
        { ...reviewAction, status: "skipped" }
      ],
      events: [
        {
          id: "plan-1",
          kind: "plan",
          message: "plan",
          createdAt: "2025-01-01T00:00:01.000Z",
          completedAt: "2025-01-01T00:00:02.000Z"
        }
      ]
    });
    const once = appendAgentCompletionSummaryIfDone([settledThread], {
      threadId: "thread-1",
      language: "en-US",
      createdAt: "2025-01-01T00:00:06.000Z"
    });
    const twice = appendAgentCompletionSummaryIfDone(once, {
      threadId: "thread-1",
      language: "en-US",
      createdAt: "2025-01-01T00:00:07.000Z"
    });

    expect(twice[0]?.status).toBe("completed");
    expect(twice[0]?.events.filter((event) => event.id.includes("agent-summary"))).toHaveLength(1);
    expect(twice[0]?.events.at(-1)?.message).toContain("Completed, updated README.md");
  });

  it("appends standalone run records to the target thread", () => {
    const threads = appendAgentActionRunRecord([createThread()], {
      threadId: "thread-1",
      action: editAction,
      language: "en-US",
      record: {
        status: "waiting",
        completedAt: "2025-01-01T00:00:08.000Z",
        durationMs: 25
      }
    });

    expect(threads[0]?.events.at(-1)?.message).toBe("Agent action waiting: Edit README.md (25 ms)");
  });
});

const editAction: AgentAction = {
  id: "edit-1",
  stepId: "step-1",
  kind: "edit-file",
  label: "Edit README.md",
  status: "pending",
  target: "README.md"
};

const reviewAction: AgentAction = {
  id: "review-1",
  stepId: "step-2",
  kind: "manual",
  label: "Review changes",
  status: "pending"
};

const suggestRecoveryProfile: Pick<AgentProfileContext, "failureRecoveryPolicy"> = {
  failureRecoveryPolicy: "suggest"
};

function createThread(overrides: Partial<TaskThread> = {}): TaskThread {
  return {
    id: "thread-1",
    title: "thread",
    prompt: "edit file",
    status: "running",
    modelId: "model",
    intelligence: "medium",
    speed: "balanced",
    createdAt: "2025-01-01T00:00:00.000Z",
    agentActions: [editAction, reviewAction],
    events: [],
    ...overrides
  };
}
