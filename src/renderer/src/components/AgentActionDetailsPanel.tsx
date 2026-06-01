// 本文件说明: 渲染 Agent 单个动作详情, 包含执行记录, 恢复历史和最近输出
import type { ReactElement } from "react";
import { Copy, Layers } from "lucide-react";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type {
  AgentActionRunRecord,
  CommandRunResult,
  TaskThreadEvent
} from "@/state/taskThreads";
import {
  formatActionDuration,
  formatActionTimestamp,
  formatAgentActionContextForClipboard,
  formatAgentActionRunStatus,
  formatCommandOutputSnippet
} from "@/agent/agentActionDetails";
import type { FailureRecoveryAttemptView } from "@/agent/failureRecoveryAttempts";
import type { Language } from "@shared/modelTypes";
import { Tooltip } from "./Tooltip";

export type AgentActionDetailsCopy = {
  title: string;
  kind: string;
  status: string;
  target: string;
  command: string;
  nextStep: string;
  noTarget: string;
  commandOutput: string;
  toolResult: string;
  recoveryHistory: string;
  copyContext: string;
  executionRecord: string;
  autoRecovery: string;
  manualRecovery: string;
  recoveryAttempt: (attempt: number, limit?: number) => string;
  startedAt: string;
  completedAt: string;
  duration: string;
  exitCode: string;
  cwd: string;
  stdout: string;
  stderr: string;
  timedOut: string;
};

type AgentActionDetailsPanelProps = {
  action: AgentAction;
  actionRun: AgentActionRunRecord | null;
  actionRunMessage?: string;
  commandResult: CommandRunResult | null;
  controls: ReactElement | null;
  copy: AgentActionDetailsCopy;
  detailRows: Array<{ label: string; value: string }>;
  language: Language;
  nextStep: string;
  recoveryAttempts: FailureRecoveryAttemptView[];
  statusLabel: string;
  toolResult: TaskThreadEvent | null;
};

export function AgentActionDetailsPanel({
  action,
  actionRun,
  actionRunMessage,
  commandResult,
  controls,
  copy,
  detailRows,
  language,
  nextStep,
  recoveryAttempts,
  statusLabel,
  toolResult
}: AgentActionDetailsPanelProps): ReactElement {
  return (
    <section aria-label={copy.title} className="rounded-[18px] border border-[#ececf1] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#202123]">
          <Layers className="h-4 w-4 text-[#565869]" />
          {copy.title}
        </h2>
        <Tooltip label={copy.copyContext}>
          <button
            type="button"
            aria-label={copy.copyContext}
            onClick={() =>
              void navigator.clipboard?.writeText(
                formatAgentActionContextForClipboard(
                  action,
                  statusLabel,
                  nextStep,
                  commandResult,
                  toolResult,
                  actionRun,
                  recoveryAttempts
                )
              )
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-[#d9d9e3] bg-white text-[#6e6e80] transition hover:bg-[#f7f7f8] hover:text-[#202123] active:scale-[0.99]"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
      <p className="text-sm font-medium leading-5 text-[#202123]">{action.label}</p>
      <dl className="mt-3 grid gap-2">
        {detailRows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded-[12px] bg-[#fafafa] px-2.5 py-2 text-xs"
          >
            <dt className="text-[#8e8ea0]">{row.label}</dt>
            <dd className="min-w-0 break-words font-medium text-[#202123]">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
          {copy.nextStep}
        </div>
        <p className="mt-1 text-sm leading-5 text-[#202123]">{nextStep}</p>
      </div>
      {controls}
      {renderRecoveryHistory(recoveryAttempts, copy)}
      {renderActionRun(actionRun, actionRunMessage, copy, language)}
      {renderCommandResult(commandResult, copy)}
      {renderToolResult(toolResult, copy)}
    </section>
  );
}

function renderRecoveryHistory(
  recoveryAttempts: FailureRecoveryAttemptView[],
  copy: AgentActionDetailsCopy
): ReactElement | null {
  if (recoveryAttempts.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-[#ececf1] pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
        {copy.recoveryHistory}
      </h3>
      <div className="mt-2 grid gap-2">
        {recoveryAttempts.map((attempt, index) => (
          <article
            key={`${attempt.actionId}-${attempt.source}-${attempt.createdAt ?? index}`}
            className="rounded-[12px] bg-[#fafafa] px-2.5 py-2 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#202123]">
                {formatFailureRecoveryAttemptSource(attempt, copy)}
              </span>
              <span className="text-[#8e8ea0]">
                {formatFailureRecoveryAttemptProgress(attempt, copy)}
              </span>
            </div>
            {attempt.createdAt ? (
              <p className="mt-1 text-[#565869]">{formatActionTimestamp(attempt.createdAt)}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function renderActionRun(
  actionRun: AgentActionRunRecord | null,
  actionRunMessage: string | undefined,
  copy: AgentActionDetailsCopy,
  language: Language
): ReactElement | null {
  if (!actionRun) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-[#ececf1] pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
        {copy.executionRecord}
      </h3>
      <dl className="mt-2 grid gap-2 text-xs">
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
          <dt className="text-[#8e8ea0]">{copy.status}</dt>
          <dd className="font-medium text-[#202123]">
            {formatAgentActionRunStatus(actionRun.status, language)}
          </dd>
        </div>
        {actionRun.startedAt ? (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-[#8e8ea0]">{copy.startedAt}</dt>
            <dd className="min-w-0 break-words font-medium text-[#202123]">
              {formatActionTimestamp(actionRun.startedAt)}
            </dd>
          </div>
        ) : null}
        {actionRun.completedAt ? (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-[#8e8ea0]">{copy.completedAt}</dt>
            <dd className="min-w-0 break-words font-medium text-[#202123]">
              {formatActionTimestamp(actionRun.completedAt)}
            </dd>
          </div>
        ) : null}
        {typeof actionRun.durationMs === "number" ? (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-[#8e8ea0]">{copy.duration}</dt>
            <dd className="font-medium text-[#202123]">
              {formatActionDuration(actionRun.durationMs)}
            </dd>
          </div>
        ) : null}
      </dl>
      {actionRunMessage ? (
        <p className="mt-2 rounded-[12px] bg-[#f7f7f8] px-2.5 py-2 text-xs leading-5 text-[#565869]">
          {actionRunMessage}
        </p>
      ) : null}
    </div>
  );
}

function renderCommandResult(
  commandResult: CommandRunResult | null,
  copy: AgentActionDetailsCopy
): ReactElement | null {
  if (!commandResult) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-[#ececf1] pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
        {copy.commandOutput}
      </h3>
      <dl className="mt-2 grid gap-2 text-xs">
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
          <dt className="text-[#8e8ea0]">{copy.exitCode}</dt>
          <dd className="font-medium text-[#202123]">
            {commandResult.exitCode === null ? "null" : commandResult.exitCode}
          </dd>
        </div>
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
          <dt className="text-[#8e8ea0]">{copy.cwd}</dt>
          <dd className="min-w-0 break-words font-medium text-[#202123]">
            {commandResult.cwd}
          </dd>
        </div>
        {commandResult.timedOut ? (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-[#8e8ea0]">{copy.timedOut}</dt>
            <dd className="font-medium text-[#9a3412]">true</dd>
          </div>
        ) : null}
      </dl>
      {renderCommandOutputBlock(copy.stdout, commandResult.stdout, "dark")}
      {renderCommandOutputBlock(copy.stderr, commandResult.stderr, "warning")}
    </div>
  );
}

function renderToolResult(
  toolResult: TaskThreadEvent | null,
  copy: AgentActionDetailsCopy
): ReactElement | null {
  if (!toolResult) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-[#ececf1] pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
        {copy.toolResult}
      </h3>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#f7f7f8] p-2 font-mono text-[11px] leading-4 text-[#202123]">
        {formatCommandOutputSnippet(toolResult.message)}
      </pre>
    </div>
  );
}

function renderCommandOutputBlock(
  label: string,
  value: string,
  tone: "dark" | "warning"
): ReactElement | null {
  if (!value.trim()) {
    return null;
  }

  const toneClassName =
    tone === "dark"
      ? "bg-[#111827] text-[#f8fafc]"
      : "bg-[#fff7ed] text-[#9a3412]";

  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-medium text-[#8e8ea0]">{label}</div>
      <pre
        className={`max-h-28 overflow-auto whitespace-pre-wrap rounded-[12px] p-2 font-mono text-[11px] leading-4 ${toneClassName}`}
      >
        {formatCommandOutputSnippet(value)}
      </pre>
    </div>
  );
}

function formatFailureRecoveryAttemptSource(
  attempt: FailureRecoveryAttemptView,
  copy: AgentActionDetailsCopy
): string {
  return attempt.source === "auto" ? copy.autoRecovery : copy.manualRecovery;
}

function formatFailureRecoveryAttemptProgress(
  attempt: FailureRecoveryAttemptView,
  copy: AgentActionDetailsCopy
): string {
  if (attempt.attempt === undefined) {
    return attempt.source === "auto" ? copy.autoRecovery : copy.manualRecovery;
  }

  return copy.recoveryAttempt(attempt.attempt, attempt.limit);
}
