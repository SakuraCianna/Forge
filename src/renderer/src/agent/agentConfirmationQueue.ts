// 本文件说明: 推导 Agent 确认队列和队列控制状态, 供主视图复用和测试
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentProfileContext } from "@shared/agentTypes";
import type { ProjectFileChangePreview } from "@shared/fileTypes";
import {
  findNextPendingAgentAction,
  getRunnablePendingAgentActions,
  isRunnableAgentAction,
  resolveAgentCommandRisk,
  type AgentCommandSafetyPolicy
} from "@/agent/agentActionExecutor";

export type AgentConfirmationItemKind =
  | "pending-changes"
  | "failed-action"
  | "manual-gate"
  | "command-approval"
  | "command-blocked"
  | "commit-gate";

export type AgentFailureRecoveryPolicy = AgentProfileContext["failureRecoveryPolicy"];

export type AgentConfirmationItem = {
  id: string;
  kind: AgentConfirmationItemKind;
  label: string;
  active: boolean;
  action?: AgentAction;
  afterApprovalActionLabel?: string;
  command?: string;
  cwd?: string | null;
  pendingChangeCount?: number;
  previewPath?: string;
  riskReason?: string;
  failureRecoveryPolicy?: AgentFailureRecoveryPolicy;
};

export type AgentQueueControlState = {
  queueBlockerAction: AgentAction | null;
  queueBlocked: boolean;
  nextPendingAction: AgentAction | null;
  runnablePendingActions: AgentAction[];
  nextRunnableAction: AgentAction | null;
  nextGateAction: AgentAction | null;
  activeGateAction: AgentAction | null;
};

export function getAgentQueueControlState({
  actions,
  commandSafetyPolicy,
  agentPaused,
  hasPendingFileChanges
}: {
  actions: AgentAction[];
  commandSafetyPolicy: AgentCommandSafetyPolicy;
  agentPaused: boolean;
  hasPendingFileChanges: boolean;
}): AgentQueueControlState {
  const queueBlockerAction = getQueueBlockerAction(actions, commandSafetyPolicy);
  const queueBlocked =
    agentPaused ||
    hasPendingFileChanges ||
    queueBlockerAction?.status === "failed" ||
    queueBlockerAction?.status === "running";
  const nextPendingAction = queueBlocked ? null : findNextPendingAgentAction(actions);
  const runnablePendingActions = queueBlocked
    ? []
    : getRunnablePendingAgentActions(actions, commandSafetyPolicy);
  const nextRunnableAction =
    nextPendingAction && isRunnableAgentAction(nextPendingAction, commandSafetyPolicy)
      ? nextPendingAction
      : null;
  const nextGateAction = getNextGateAction(actions, runnablePendingActions);
  const activeGateAction =
    nextPendingAction && !isRunnableAgentAction(nextPendingAction, commandSafetyPolicy)
      ? nextPendingAction
      : nextGateAction;

  return {
    queueBlockerAction,
    queueBlocked,
    nextPendingAction,
    runnablePendingActions,
    nextRunnableAction,
    nextGateAction,
    activeGateAction
  };
}

export function getAgentConfirmationItems({
  actions,
  changePreviews,
  commandSafetyPolicy,
  fullAccess,
  activeGateAction,
  projectPath,
  queueBlockerAction,
  failureRecoveryPolicy
}: {
  actions: AgentAction[];
  changePreviews: Pick<ProjectFileChangePreview, "relativePath">[];
  commandSafetyPolicy: AgentCommandSafetyPolicy;
  fullAccess: boolean;
  activeGateAction: AgentAction | null;
  projectPath: string | null;
  queueBlockerAction: AgentAction | null;
  failureRecoveryPolicy?: AgentFailureRecoveryPolicy | null;
}): AgentConfirmationItem[] {
  const items: AgentConfirmationItem[] = [];

  if (changePreviews.length > 0) {
    items.push({
      id: "pending-changes",
      kind: "pending-changes",
      label: changePreviews[0]?.relativePath ?? "Pending changes",
      active: true,
      pendingChangeCount: changePreviews.length,
      previewPath: changePreviews[0]?.relativePath
    });
  }

  for (const action of actions) {
    const kind = getAgentConfirmationKind(action, commandSafetyPolicy, fullAccess);

    if (!kind) {
      continue;
    }

    const actionIndex = actions.findIndex((candidate) => candidate.id === action.id);
    const nextAction = findNextIncompleteActionAfterIndex(actions, actionIndex);
    const commandRisk =
      action.kind === "run-command" && action.command
        ? resolveAgentCommandRisk(action.command, commandSafetyPolicy)
        : null;

    items.push({
      id: `action-${action.id}`,
      kind,
      label: action.label,
      action,
      afterApprovalActionLabel: nextAction?.label,
      command: action.command,
      cwd: action.kind === "run-command" ? projectPath : null,
      riskReason:
        commandRisk?.level === "ask" || commandRisk?.level === "deny"
          ? commandRisk.reason
          : undefined,
      failureRecoveryPolicy:
        kind === "failed-action" ? (failureRecoveryPolicy ?? undefined) : undefined,
      active:
        changePreviews.length === 0 &&
        (activeGateAction?.id === action.id || queueBlockerAction?.id === action.id)
    });
  }

  return items;
}

export function getAgentConfirmationKind(
  action: AgentAction,
  commandSafetyPolicy: AgentCommandSafetyPolicy,
  fullAccess: boolean
): AgentConfirmationItemKind | null {
  if (action.status === "failed") {
    return "failed-action";
  }

  if (action.status !== "pending") {
    return null;
  }

  if (action.kind === "manual") {
    return "manual-gate";
  }

  if (action.kind === "commit") {
    return "commit-gate";
  }

  if (action.kind === "run-command" && action.command) {
    const commandRisk = resolveAgentCommandRisk(action.command, commandSafetyPolicy);

    if (commandRisk.level === "deny") {
      return "command-blocked";
    }

    if (commandRisk.level === "ask" && !fullAccess) {
      return "command-approval";
    }
  }

  return null;
}

export function getQueueStats(actions: AgentAction[]): {
  completed: number;
  failed: number;
  total: number;
} {
  return actions.reduce(
    (stats, action) => ({
      completed: stats.completed + (action.status === "completed" ? 1 : 0),
      failed: stats.failed + (action.status === "failed" ? 1 : 0),
      total: stats.total + 1
    }),
    { completed: 0, failed: 0, total: 0 }
  );
}

export function getQueueBlockerAction(
  actions: AgentAction[],
  policy: AgentCommandSafetyPolicy = {}
): AgentAction | null {
  for (const action of actions) {
    if (action.status === "completed" || action.status === "skipped") {
      continue;
    }

    if (action.status === "failed" || action.status === "running") {
      return action;
    }

    if (action.status === "pending" && !isRunnableAgentAction(action, policy)) {
      return action;
    }

    return null;
  }

  return null;
}

export function getNextGateAction(
  actions: AgentAction[],
  runnablePendingActions: AgentAction[]
): AgentAction | null {
  const lastRunnableAction = runnablePendingActions.at(-1);

  if (!lastRunnableAction) {
    return null;
  }

  const lastRunnableIndex = actions.findIndex((action) => action.id === lastRunnableAction.id);

  if (lastRunnableIndex < 0) {
    return null;
  }

  return (
    actions
      .slice(lastRunnableIndex + 1)
      .find((action) => action.status === "pending") ?? null
  );
}

function findNextIncompleteActionAfterIndex(
  actions: AgentAction[],
  actionIndex: number
): AgentAction | null {
  if (actionIndex < 0) {
    return null;
  }

  return (
    actions
      .slice(actionIndex + 1)
      .find((action) => action.status !== "completed" && action.status !== "skipped") ?? null
  );
}
