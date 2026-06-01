import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import {
  createFailureRecoverySuggestionEventId,
  formatFailureRecoverySuggestion,
  getFailureRecoverySuggestionEventPrefix,
  shouldSuggestFailureRecovery
} from "./failureRecoveryPolicy";

const baseAgentProfile: AgentProfileContext = {
  id: "developer",
  name: "Developer",
  description: "Builds code changes",
  instructions: "",
  permissionMode: "auto",
  enabledTools: [],
  contextBudget: 12000,
  planStepLimit: 8,
  autoRunBatchSize: 1,
  verificationPolicy: "suggest",
  failureRecoveryPolicy: "suggest",
  maxFailureRecoveryAttempts: 2
};

const failedAction: AgentAction = {
  id: "action-1",
  stepId: "step-1",
  kind: "run-command",
  label: "Run npm test",
  status: "failed",
  command: "npm test"
};

describe("failure recovery policy", () => {
  it("suggests recovery only for failed actions in suggest mode", () => {
    expect(shouldSuggestFailureRecovery(baseAgentProfile, "failed")).toBe(true);
    expect(
      shouldSuggestFailureRecovery({ ...baseAgentProfile, failureRecoveryPolicy: "manual" }, "failed")
    ).toBe(false);
    expect(
      shouldSuggestFailureRecovery({ ...baseAgentProfile, failureRecoveryPolicy: "auto" }, "failed")
    ).toBe(false);
    expect(shouldSuggestFailureRecovery(baseAgentProfile, "completed")).toBe(false);
  });

  it("formats recovery suggestions in the selected language", () => {
    expect(formatFailureRecoverySuggestion("zh-CN", failedAction)).toContain("生成修复计划");
    expect(formatFailureRecoverySuggestion("zh-CN", failedAction)).toContain("Run npm test");
    expect(formatFailureRecoverySuggestion("en-US", failedAction)).toContain("Generate a fix plan");
    expect(formatFailureRecoverySuggestion("en-US", failedAction)).toContain("Run npm test");
  });

  it("creates stable per-action event prefixes", () => {
    const prefix = getFailureRecoverySuggestionEventPrefix("thread-1", "action-1");
    const eventId = createFailureRecoverySuggestionEventId(
      "thread-1",
      "action-1",
      "2026-06-01T00:00:00.000Z"
    );

    expect(prefix).toBe("thread-1-agent-action-recovery-suggestion-action-1-");
    expect(eventId.startsWith(prefix)).toBe(true);
  });
});
