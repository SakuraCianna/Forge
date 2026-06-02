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
import {
  countAutoFailureRecoveryAttempts,
  type FailureRecoveryAttemptEvent
} from "@/agent/failureRecoveryAttempts";

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
  maxFailureRecoveryAttempts?: number;
  autoFailureRecoveryAttemptsUsed?: number;
  autoFailureRecoveryExhausted?: boolean;
};

type AgentChangePreviewForQueue = Pick<ProjectFileChangePreview, "relativePath" | "source">;

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
  const hasBlockingFileChanges = hasPendingFileChanges && !commandSafetyPolicy.fullAccess;
  const queueBlocked =
    agentPaused ||
    hasBlockingFileChanges ||
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
  failureRecoveryPolicy,
  maxFailureRecoveryAttempts,
  events = []
}: {
  actions: AgentAction[];
  changePreviews: AgentChangePreviewForQueue[];
  commandSafetyPolicy: AgentCommandSafetyPolicy;
  fullAccess: boolean;
  activeGateAction: AgentAction | null;
  projectPath: string | null;
  queueBlockerAction: AgentAction | null;
  failureRecoveryPolicy?: AgentFailureRecoveryPolicy | null;
  maxFailureRecoveryAttempts?: number | null;
  events?: FailureRecoveryAttemptEvent[];
}): AgentConfirmationItem[] {
  const items: AgentConfirmationItem[] = [];
  const blockingChangePreviews = getBlockingFileChangePreviews(changePreviews, { fullAccess });

  if (blockingChangePreviews.length > 0) {
    items.push({
      id: "pending-changes",
      kind: "pending-changes",
      label: blockingChangePreviews[0]?.relativePath ?? "Pending changes",
      active: true,
      pendingChangeCount: blockingChangePreviews.length,
      previewPath: blockingChangePreviews[0]?.relativePath
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
    const autoFailureRecoveryAttemptsUsed =
      kind === "failed-action" ? countAutoFailureRecoveryAttempts(events) : undefined;
    const autoFailureRecoveryExhausted =
      kind === "failed-action" &&
      failureRecoveryPolicy === "auto" &&
      typeof maxFailureRecoveryAttempts === "number" &&
      (autoFailureRecoveryAttemptsUsed ?? 0) >= maxFailureRecoveryAttempts;

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
      maxFailureRecoveryAttempts:
        kind === "failed-action" ? (maxFailureRecoveryAttempts ?? undefined) : undefined,
      autoFailureRecoveryAttemptsUsed,
      autoFailureRecoveryExhausted,
      active:
        blockingChangePreviews.length === 0 &&
        (activeGateAction?.id === action.id || queueBlockerAction?.id === action.id)
    });
  }

  return items;
}

// full access 下不把文件预览当成人工确认项; App 可额外传入线程级判断, 避免其他线程的审查项卡住全自动队列。
export function getBlockingFileChangePreviews(
  changePreviews: AgentChangePreviewForQueue[],
  {
    fullAccess = false,
    isFullAccessThread
  }: {
    fullAccess?: boolean;
    isFullAccessThread?: (threadId: string) => boolean;
  } = {}
): AgentChangePreviewForQueue[] {
  if (fullAccess) {
    return [];
  }

  if (!isFullAccessThread) {
    return changePreviews;
  }

  return changePreviews.filter((preview) => {
    const sourceThreadId = preview.source?.threadId;

    return !sourceThreadId || !isFullAccessThread(sourceThreadId);
  });
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

  if (fullAccess && (action.kind === "manual" || action.kind === "commit")) {
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
