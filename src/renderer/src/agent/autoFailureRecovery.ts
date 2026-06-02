import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type { CommandRunResult, TaskThread, TaskThreadEvent } from "@/state/taskThreads";
import { countAutoFailureRecoveryAttempts } from "./failureRecoveryAttempts";

const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");

export type AutoFailureRecoverySkipReason =
  | "requires-permission"
  | "requires-dependency"
  | "user-cancelled";

export type AutoFailureRecoveryDecision =
  | { recoverable: true; reason: "recoverable" }
  | {
      recoverable: false;
      reason: AutoFailureRecoverySkipReason;
      detail: string;
    };

export type AutoFailureRecoveryCandidate = {
  thread: TaskThread;
  failedAction: AgentAction;
  key: string;
  attempt: number;
  limit: number;
  decision: AutoFailureRecoveryDecision;
};

export type AutoFailureRecoverySkipNotice = {
  thread: TaskThread;
  failedAction: AgentAction;
  key: string;
  decision: Extract<AutoFailureRecoveryDecision, { recoverable: false }>;
};

export type SelectAutoFailureRecoveryCandidateInput = {
  threads: TaskThread[];
  currentProjectPath: string;
  cancelledThreadIds: ReadonlySet<string>;
  activeKeys: ReadonlySet<string>;
  attemptedKeys: ReadonlySet<string>;
  countsByThreadId: ReadonlyMap<string, number>;
  getThreadFailureRecoveryLimit: (threadId: string) => number;
};

export function selectAutoFailureRecoveryCandidate({
  threads,
  currentProjectPath,
  cancelledThreadIds,
  activeKeys,
  attemptedKeys,
  countsByThreadId,
  getThreadFailureRecoveryLimit
}: SelectAutoFailureRecoveryCandidateInput): AutoFailureRecoveryCandidate | null {
  for (const thread of threads) {
    if (!canThreadAutoRecover(thread, currentProjectPath, cancelledThreadIds)) {
      continue;
    }

    const failedAction = findFailedAgentQueueBlocker(thread.agentActions ?? []);

    if (!failedAction) {
      continue;
    }

    const key = createAutoFailureFixKey(thread.id, failedAction.id);
    const limit = Math.max(0, getThreadFailureRecoveryLimit(thread.id));
    const currentCount = Math.max(
      countsByThreadId.get(thread.id) ?? 0,
      countAutoFailureRecoveryAttempts(thread.events)
    );
    const actionAutoAttempted =
      countAutoFailureRecoveryAttempts(thread.events, failedAction.id) > 0;
    const decision = classifyAutoFailureForRecovery(thread, failedAction);

    if (
      limit <= 0 ||
      currentCount >= limit ||
      activeKeys.has(key) ||
      attemptedKeys.has(key) ||
      actionAutoAttempted ||
      !decision.recoverable
    ) {
      continue;
    }

    return {
      thread,
      failedAction,
      key,
      attempt: currentCount + 1,
      limit,
      decision
    };
  }

  return null;
}

export function selectAutoFailureRecoverySkipNotice({
  threads,
  currentProjectPath,
  cancelledThreadIds
}: Pick<
  SelectAutoFailureRecoveryCandidateInput,
  "threads" | "currentProjectPath" | "cancelledThreadIds"
>): AutoFailureRecoverySkipNotice | null {
  for (const thread of threads) {
    if (!canThreadAutoRecover(thread, currentProjectPath, cancelledThreadIds)) {
      continue;
    }

    const failedAction = findFailedAgentQueueBlocker(thread.agentActions ?? []);

    if (!failedAction) {
      continue;
    }

    const decision = classifyAutoFailureForRecovery(thread, failedAction);

    if (decision.recoverable) {
      continue;
    }

    const key = createAutoFailureRecoverySkipKey(thread.id, failedAction.id, decision.reason);

    if (thread.events.some((event) => event.id === key)) {
      continue;
    }

    return {
      thread,
      failedAction,
      key,
      decision
    };
  }

  return null;
}

export function findFailedAgentQueueBlocker(actions: AgentAction[]): AgentAction | null {
  for (const action of actions) {
    if (action.status === "completed" || action.status === "skipped") {
      continue;
    }

    return action.status === "failed" ? action : null;
  }

  return null;
}

export function createAutoFailureFixKey(threadId: string, actionId: string): string {
  return `${threadId}:${actionId}`;
}

export function createAutoFailureRecoverySkipKey(
  threadId: string,
  actionId: string,
  reason: AutoFailureRecoverySkipReason
): string {
  return `${threadId}-agent-action-recovery-skip-${actionId}-${reason}`;
}

export function createAutoFailureRecoverySkipEvent({
  threadId,
  action,
  decision,
  language,
  createdAt
}: {
  threadId: string;
  action: Pick<AgentAction, "id" | "label">;
  decision: Extract<AutoFailureRecoveryDecision, { recoverable: false }>;
  language: Language;
  createdAt: string;
}): TaskThreadEvent {
  return {
    id: createAutoFailureRecoverySkipKey(threadId, action.id, decision.reason),
    kind: "plan",
    message: formatAutoFailureRecoverySkipMessage(language, action, decision),
    createdAt
  };
}

export function classifyAutoFailureForRecovery(
  thread: Pick<TaskThread, "events">,
  action: AgentAction
): AutoFailureRecoveryDecision {
  const manualGateEvent = findManualGateFailureEvent(thread.events, action);

  if (manualGateEvent) {
    return {
      recoverable: false,
      reason: "requires-permission",
      detail: manualGateEvent.message
    };
  }

  const commandResult = findLatestCommandResultForAction(thread.events, action);

  if (commandResult?.cancelled) {
    return {
      recoverable: false,
      reason: "user-cancelled",
      detail: "The failed command was cancelled by the user."
    };
  }

  const failureText = collectFailureText(thread.events, action, commandResult);
  const dependencyDetail = findDependencyMissingDetail(failureText);

  if (dependencyDetail) {
    return {
      recoverable: false,
      reason: "requires-dependency",
      detail: dependencyDetail
    };
  }

  const permissionDetail = findPermissionFailureDetail(failureText);

  if (permissionDetail) {
    return {
      recoverable: false,
      reason: "requires-permission",
      detail: permissionDetail
    };
  }

  return { recoverable: true, reason: "recoverable" };
}

export function formatAutoFailureRecoverySkipMessage(
  language: Language,
  action: Pick<AgentAction, "label">,
  decision: Extract<AutoFailureRecoveryDecision, { recoverable: false }>
): string {
  const reasonText = formatAutoFailureRecoverySkipReason(language, decision.reason);

  if (language === "zh-CN") {
    return [
      `自动恢复已暂停: ${action.label}`,
      `原因: ${reasonText}`,
      `细节: ${decision.detail}`,
      "Forge 不会在该失败点继续自动重试, 需要处理权限、依赖或取消状态后再继续。"
    ].join("\n");
  }

  return [
    `Automatic recovery paused: ${action.label}`,
    `Reason: ${reasonText}`,
    `Detail: ${decision.detail}`,
    "Forge will not keep retrying this failure until the permission, dependency, or cancellation state is resolved."
  ].join("\n");
}

function canThreadAutoRecover(
  thread: TaskThread,
  currentProjectPath: string,
  cancelledThreadIds: ReadonlySet<string>
): boolean {
  return (
    !thread.archived &&
    thread.projectPath === currentProjectPath &&
    thread.agentProfile?.failureRecoveryPolicy === "auto" &&
    !cancelledThreadIds.has(thread.id)
  );
}

function formatAutoFailureRecoverySkipReason(
  language: Language,
  reason: AutoFailureRecoverySkipReason
): string {
  if (language === "zh-CN") {
    if (reason === "requires-dependency") {
      return "需要先确认或安装依赖";
    }

    if (reason === "requires-permission") {
      return "需要用户确认权限";
    }

    return "用户已取消相关命令";
  }

  if (reason === "requires-dependency") {
    return "dependency or tool setup is required";
  }

  if (reason === "requires-permission") {
    return "permission approval is required";
  }

  return "the related command was cancelled by the user";
}

function findManualGateFailureEvent(
  events: TaskThreadEvent[],
  action: AgentAction
): TaskThreadEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (!event || !eventMentionsAction(event, action)) {
      continue;
    }

    if (
      event.id.includes("-permission-denied-") ||
      (event.kind === "error" && event.id.includes("-command-blocked-"))
    ) {
      return event;
    }
  }

  return null;
}

function findLatestCommandResultForAction(
  events: TaskThreadEvent[],
  action: AgentAction
): CommandRunResult | null {
  if (!action.command) {
    return null;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const result = events[index]?.commandResult;

    if (!result) {
      continue;
    }

    if (result.actionId === action.id || (!result.actionId && result.command === action.command)) {
      return result;
    }
  }

  return null;
}

function collectFailureText(
  events: TaskThreadEvent[],
  action: AgentAction,
  commandResult: CommandRunResult | null
): string {
  const eventMessages = events
    .filter((event) => eventMentionsAction(event, action))
    .map((event) => event.message)
    .filter(Boolean);
  const commandText = commandResult
    ? [commandResult.stdout, commandResult.stderr].filter(Boolean)
    : [];

  return stripAnsi([...eventMessages, ...commandText].join("\n"));
}

function eventMentionsAction(event: TaskThreadEvent, action: AgentAction): boolean {
  return (
    event.agentActionRun?.actionId === action.id ||
    event.commandRun?.actionId === action.id ||
    event.commandResult?.actionId === action.id ||
    event.id.includes(`-${action.id}-`)
  );
}

function findDependencyMissingDetail(value: string): string | null {
  const specifier = findMissingDependencySpecifier(value);

  if (specifier) {
    return `Missing dependency or package: ${specifier}`;
  }

  if (
    /(?:command not found|not recognized as an internal or external command|is not recognized as the name of)/iu.test(
      value
    )
  ) {
    return "A required command line tool is missing.";
  }

  return null;
}

function findMissingDependencySpecifier(value: string): string | null {
  const patterns = [
    /Cannot find module ['"]([^'"]+)['"]/iu,
    /Cannot find package ['"]([^'"]+)['"]/iu,
    /No module named ['"]([^'"]+)['"]/iu,
    /Module not found:.*?(?:Can't resolve|Cannot resolve) ['"]([^'"]+)['"]/iu
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const specifier = match?.[1]?.trim();

    if (specifier && isExternalPackageSpecifier(specifier)) {
      return specifier;
    }
  }

  return null;
}

function isExternalPackageSpecifier(specifier: string): boolean {
  const normalized = specifier.trim().replace(/\\/g, "/");

  if (
    !normalized ||
    normalized.startsWith(".") ||
    normalized.startsWith("/") ||
    normalized.startsWith("@/") ||
    /^[a-z]:/iu.test(normalized)
  ) {
    return false;
  }

  if (/^(?:src|app|components|pages|lib|utils|shared|renderer|main)\//iu.test(normalized)) {
    return false;
  }

  return !normalized.includes("/") || normalized.startsWith("@");
}

function findPermissionFailureDetail(value: string): string | null {
  const match = value.match(
    /(?:permission denied|access is denied|operation not permitted|requires elevated|administrator privileges|\bEACCES\b|\bEPERM\b)/iu
  );

  return match ? `Permission problem: ${match[0]}` : null;
}

function stripAnsi(value: string): string {
  return value.replace(ansiEscapePattern, "");
}
