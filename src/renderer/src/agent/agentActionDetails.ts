// 本文件说明: 封装 Agent 动作详情的状态, 时间和复制上下文格式化
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import type {
  AgentActionRunRecord,
  CommandRunResult,
  TaskThreadEvent
} from "@/state/taskThreads";
import type { FailureRecoveryAttemptView } from "@/agent/failureRecoveryAttempts";

export function formatAgentActionContextForClipboard(
  action: AgentAction,
  statusLabel: string,
  nextStep: string,
  commandResult: CommandRunResult | null,
  toolResult: TaskThreadEvent | null,
  actionRun: AgentActionRunRecord | null,
  recoveryAttempts: FailureRecoveryAttemptView[] = []
): string {
  const metadata = [
    `Action: ${action.label}`,
    `Kind: ${action.kind}`,
    `Status: ${statusLabel}`,
    action.target ? `Target: ${action.target}` : null,
    action.command ? `Command: ${action.command}` : null,
    `Next step: ${nextStep}`
  ].filter((line): line is string => Boolean(line));
  const sections = [...metadata];

  if (commandResult) {
    sections.push(`Command result:\n${formatCommandResultForClipboard(commandResult)}`);
  }

  if (actionRun) {
    sections.push(`Execution record:\n${formatAgentActionRunForClipboard(actionRun)}`);
  }

  if (recoveryAttempts.length > 0) {
    sections.push(
      `Recovery history:\n${recoveryAttempts
        .map(formatFailureRecoveryAttemptForClipboard)
        .join("\n")}`
    );
  }

  if (toolResult) {
    sections.push(`Tool result:\n${toolResult.message.trim()}`);
  }

  return sections.join("\n");
}

export function formatFailureRecoveryAttemptForClipboard(
  attempt: FailureRecoveryAttemptView
): string {
  return [
    `Source: ${attempt.source}`,
    attempt.attempt === undefined
      ? null
      : `Attempt: ${attempt.attempt}${attempt.limit === undefined ? "" : ` / ${attempt.limit}`}`,
    attempt.createdAt ? `Created: ${attempt.createdAt}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join(", ");
}

export function formatAgentActionRunForClipboard(actionRun: AgentActionRunRecord): string {
  return [
    `Status: ${actionRun.status}`,
    actionRun.startedAt ? `Started: ${actionRun.startedAt}` : null,
    actionRun.completedAt ? `Completed: ${actionRun.completedAt}` : null,
    typeof actionRun.durationMs === "number"
      ? `Duration: ${formatActionDuration(actionRun.durationMs)}`
      : null,
    actionRun.reason ? `Reason: ${actionRun.reason}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function formatAgentActionRunStatus(
  status: AgentActionRunRecord["status"],
  language: Language
): string {
  if (language === "zh-CN") {
    return {
      started: "已开始",
      completed: "已完成",
      failed: "失败",
      waiting: "等待继续",
      confirmed: "已确认",
      skipped: "已跳过"
    }[status];
  }

  return {
    started: "Started",
    completed: "Completed",
    failed: "Failed",
    waiting: "Waiting",
    confirmed: "Confirmed",
    skipped: "Skipped"
  }[status];
}

export function formatActionTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function formatActionDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
}

export function formatCommandResultForClipboard(result: CommandRunResult): string {
  const metadata = [`$ ${result.command}`];
  const outputSections: string[] = [];

  if (result.cwd) {
    metadata.push(`cwd: ${result.cwd}`);
  }

  if (result.cancelled) {
    metadata.push("cancelled");
  } else if (result.timedOut) {
    metadata.push("timed out");
  } else {
    metadata.push(`exit ${result.exitCode === null ? "null" : result.exitCode}`);
  }

  if (result.stdout.trim()) {
    outputSections.push(`stdout:\n${result.stdout.trimEnd()}`);
  }

  if (result.stderr.trim()) {
    outputSections.push(`stderr:\n${result.stderr.trimEnd()}`);
  }

  return [metadata.join("\n"), outputSections.join("\n\n")].filter(Boolean).join("\n\n");
}
