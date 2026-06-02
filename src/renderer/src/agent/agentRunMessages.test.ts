import { describe, expect, it } from "vitest";
import type { AgentAction } from "@shared/agentExecutionPlan";
import {
  formatAgentActionRunMessage,
  formatFailureFixPlanStartMessage
} from "./agentRunMessages";

const action: AgentAction = {
  id: "action-1",
  stepId: "step-1",
  kind: "edit-file",
  label: "Edit App.tsx",
  status: "running",
  target: "src/renderer/src/App.tsx"
};

describe("agent run messages", () => {
  it("formats localized agent action run messages with durations", () => {
    expect(
      formatAgentActionRunMessage("zh-CN", action, {
        status: "completed",
        durationMs: 1250
      })
    ).toBe("已完成 Agent 动作: Edit App.tsx (1.3 s)");

    expect(
      formatAgentActionRunMessage("en-US", action, {
        status: "waiting",
        durationMs: 80
      })
    ).toBe("Agent action waiting: Edit App.tsx (80 ms)");
  });

  it("formats automatic failure fix plan attempts", () => {
    expect(
      formatFailureFixPlanStartMessage("zh-CN", action, {
        actionId: action.id,
        label: action.label,
        source: "auto",
        attempt: 2,
        limit: 3
      })
    ).toBe("正在自动生成失败修复计划 2 / 3: Edit App.tsx");
  });
});
