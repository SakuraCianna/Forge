import type { AgentAction } from "@shared/agentExecutionPlan";
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
