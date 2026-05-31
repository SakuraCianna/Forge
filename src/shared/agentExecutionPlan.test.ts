// 本文件说明: 验证模型计划步骤能转成正确的 Agent 动作队列
import { describe, expect, it } from "vitest";
import type { AgentPlanStep } from "./agentTypes.js";
import { createAgentActionsFromPlanSteps } from "./agentExecutionPlan.js";

describe("agentExecutionPlan", () => {
  it("turns structured plan steps into a coding-agent action queue", () => {
    const steps: AgentPlanStep[] = [
      {
        id: "step-1",
        title: "Inspect App",
        description: "Inspect src/renderer/src/App.tsx before editing.",
        kind: "inspect",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "step-2",
        title: "Edit App",
        description: "Modify src/renderer/src/App.tsx to wire the new flow.",
        kind: "edit",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "step-3",
        title: "Verify",
        description: "Run npm test.",
        kind: "verify",
        status: "pending",
        target: "npm test"
      }
    ];

    expect(createAgentActionsFromPlanSteps(steps)).toEqual([
      {
        id: "action-1",
        stepId: "step-1",
        kind: "inspect-file",
        label: "Inspect src/renderer/src/App.tsx",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "action-2",
        stepId: "step-2",
        kind: "edit-file",
        label: "Edit src/renderer/src/App.tsx",
        status: "pending",
        target: "src/renderer/src/App.tsx"
      },
      {
        id: "action-3",
        stepId: "step-3",
        kind: "run-command",
        label: "Run npm test",
        status: "pending",
        command: "npm test"
      }
    ]);
  });

  it("keeps vague plan steps as manual actions instead of inventing file edits", () => {
    const steps: AgentPlanStep[] = [
      {
        id: "step-1",
        title: "Think",
        description: "Clarify the architecture before changing code.",
        kind: "other",
        status: "pending"
      }
    ];

    expect(createAgentActionsFromPlanSteps(steps)).toEqual([
      {
        id: "action-1",
        stepId: "step-1",
        kind: "manual",
        label: "Clarify the architecture before changing code.",
        status: "pending"
      }
    ]);
  });

  it("turns non-file inspect targets into project search actions", () => {
    const steps: AgentPlanStep[] = [
      {
        id: "step-1",
        title: "Find usage",
        description: "Search for provider setup before editing.",
        kind: "inspect",
        status: "pending",
        target: "provider setup"
      }
    ];

    expect(createAgentActionsFromPlanSteps(steps)).toEqual([
      {
        id: "action-1",
        stepId: "step-1",
        kind: "search-project",
        label: "Search provider setup",
        status: "pending",
        target: "provider setup"
      }
    ]);
  });

  it("turns glob inspect targets into project file matching actions", () => {
    const steps: AgentPlanStep[] = [
      {
        id: "step-1",
        title: "Find TSX files",
        description: "Find React component files.",
        kind: "inspect",
        status: "pending",
        target: "src/**/*.tsx"
      }
    ];

    expect(createAgentActionsFromPlanSteps(steps)).toEqual([
      {
        id: "action-1",
        stepId: "step-1",
        kind: "glob-project",
        label: "Find src/**/*.tsx",
        status: "pending",
        target: "src/**/*.tsx"
      }
    ]);
  });

  it("does not let non-actionable planning notes block later file creation", () => {
    const steps: AgentPlanStep[] = [
      {
        id: "step-1",
        title: "Confirm scope",
        description: "确认项目说明书需要覆盖的内容。",
        kind: "other",
        status: "pending"
      },
      {
        id: "step-2",
        title: "Create project guide",
        description: "创建 项目说明书.md, 介绍这个项目怎么使用。",
        kind: "edit",
        status: "pending",
        target: "项目说明书.md"
      }
    ];

    expect(createAgentActionsFromPlanSteps(steps)).toEqual([
      {
        id: "action-1",
        stepId: "step-2",
        kind: "edit-file",
        label: "Edit 项目说明书.md",
        status: "pending",
        target: "项目说明书.md"
      }
    ]);
  });
});
