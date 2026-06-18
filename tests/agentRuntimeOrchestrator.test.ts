// 本文件说明: 直接验证 Agent Runtime 状态机入口的权限、门禁和命令分派
import test from "node:test";
import assert from "node:assert/strict";
import type { AgentAction } from "../src/shared/agentExecutionPlan.js";
import type { AgentProfileContext } from "../src/shared/agentTypes.js";
import {
  resolveAgentRuntimeCommandDecision,
  resolveAgentRuntimeManualGateStep,
  resolveAgentRuntimePreflightDecision,
  runAgentRuntimeExecution,
  type AgentRuntimeExecutionHandlers
} from "../src/renderer/src/agent/agentRuntimeOrchestrator.js";

test("runtime preflight blocks actions outside the active profile tools", () => {
  const decision = resolveAgentRuntimePreflightDecision({
    action: createAction("edit-file", { target: "src/App.tsx" }),
    agentProfile: createProfile({ enabledTools: ["read", "command"] })
  });

  assert.equal(decision.kind, "permission-denied");
  assert.equal(decision.kind === "permission-denied" ? decision.permission.tool : null, "edit");
});

test("runtime manual gates wait in review mode and become automatic in full access", () => {
  const reviewDecision = resolveAgentRuntimePreflightDecision({
    action: createAction("commit", { target: "完善稳定性" }),
    agentProfile: createProfile({ enabledTools: ["git"] }),
    fullAccess: false
  });
  const fullAccessDecision = resolveAgentRuntimePreflightDecision({
    action: createAction("commit", { target: "完善稳定性" }),
    agentProfile: createProfile({ enabledTools: ["git"] }),
    fullAccess: true
  });

  assert.equal(reviewDecision.kind, "manual-gate");
  assert.deepEqual(
    reviewDecision.kind === "manual-gate"
      ? resolveAgentRuntimeManualGateStep({
          execution: reviewDecision.execution,
          fullAccess: false
        })
      : null,
    { kind: "wait-for-review" }
  );
  assert.equal(fullAccessDecision.kind, "manual-gate");
  assert.deepEqual(
    fullAccessDecision.kind === "manual-gate"
      ? resolveAgentRuntimeManualGateStep({
          execution: fullAccessDecision.execution,
          fullAccess: true
        })
      : null,
    { kind: "auto-commit" }
  );
});

test("runtime command decisions keep unknown commands behind one-shot approval", () => {
  assert.deepEqual(
    resolveAgentRuntimeCommandDecision({
      command: "node scripts/custom-maintenance.js",
      policy: {}
    }),
    {
      kind: "approval-required",
      risk: {
        level: "ask",
        reason: "command is not in the safe allowlist"
      }
    }
  );
  assert.deepEqual(
    resolveAgentRuntimeCommandDecision({
      command: "node scripts/custom-maintenance.js",
      policy: {},
      approvedCommand: true
    }),
    {
      kind: "run",
      risk: {
        level: "ask",
        reason: "command is not in the safe allowlist"
      }
    }
  );
});

test("runtime execution routes command approvals without calling the command handler", async () => {
  const calls: string[] = [];
  const outcome = await runAgentRuntimeExecution({
    execution: {
      kind: "run-command",
      command: "node scripts/custom-maintenance.js"
    },
    commandPolicy: {},
    handlers: createHandlers(calls)
  });

  assert.deepEqual(calls, ["approval:node scripts/custom-maintenance.js"]);
  assert.deepEqual(outcome, {
    status: "pending",
    continueBatch: false
  });
});

test("runtime execution runs an approved command exactly once", async () => {
  const calls: string[] = [];
  const outcome = await runAgentRuntimeExecution({
    execution: {
      kind: "run-command",
      command: "node scripts/custom-maintenance.js"
    },
    commandPolicy: {},
    approvedCommand: true,
    handlers: createHandlers(calls)
  });

  assert.deepEqual(calls, ["run:node scripts/custom-maintenance.js"]);
  assert.equal(outcome, "completed");
});

function createAction(
  kind: AgentAction["kind"],
  patch: Partial<AgentAction> = {}
): AgentAction {
  return {
    id: "action-1",
    stepId: "step-1",
    kind,
    label: "测试动作",
    status: "pending",
    ...patch
  };
}

function createProfile(
  patch: Partial<AgentProfileContext> = {}
): AgentProfileContext {
  return {
    id: "build",
    name: "开发智能体",
    description: "测试配置",
    instructions: "先读后改",
    permissionMode: "auto",
    enabledTools: ["read", "edit", "command", "git", "extension", "web"],
    contextBudget: 12000,
    planStepLimit: 12,
    autoRunBatchSize: 3,
    verificationPolicy: "require",
    failureRecoveryPolicy: "suggest",
    maxFailureRecoveryAttempts: 2,
    ...patch
  };
}

function createHandlers(calls: string[]): AgentRuntimeExecutionHandlers {
  return {
    openFile: (relativePath) => {
      calls.push(`open:${relativePath}`);
      return "completed";
    },
    listDirectory: (relativePath) => {
      calls.push(`list:${relativePath}`);
      return "completed";
    },
    globProject: (pattern) => {
      calls.push(`glob:${pattern}`);
      return "completed";
    },
    searchProject: (query) => {
      calls.push(`search:${query}`);
      return "completed";
    },
    webSearch: (query) => {
      calls.push(`web:${query}`);
      return "completed";
    },
    inspectGitStatus: () => {
      calls.push("git-status");
      return "completed";
    },
    generateFileChange: (relativePath) => {
      calls.push(`edit:${relativePath}`);
      return "completed";
    },
    runCommand: (command) => {
      calls.push(`run:${command}`);
      return "completed";
    },
    executeBuiltInTool: (toolName) => {
      calls.push(`tool:${toolName}`);
      return "completed";
    },
    invokeExtension: (extensionId, actionId) => {
      calls.push(`extension:${extensionId}:${actionId}`);
      return "completed";
    },
    blockCommandDenied: (reason) => {
      calls.push(`deny:${reason}`);
      return "failed";
    },
    blockCommandApprovalRequired: (command) => {
      calls.push(`approval:${command}`);
      return {
        status: "pending",
        continueBatch: false
      };
    },
    blockInvalidTarget: (reason) => {
      calls.push(`invalid:${reason}`);
      return "failed";
    },
    completeAction: () => {
      calls.push("complete");
      return "completed";
    }
  };
}
