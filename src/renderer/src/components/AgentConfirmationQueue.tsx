// 本文件说明: 渲染 Agent 确认队列和紧凑等待提示, 父组件只负责传入线程状态和动作回调
import type { ReactElement } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  FileText,
  SkipForward,
  Terminal,
  type LucideIcon
} from "lucide-react";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { Language } from "@shared/modelTypes";
import { resolveAgentCommandRisk, type AgentCommandSafetyPolicy } from "@/agent/agentActionExecutor";
import {
  type AgentConfirmationItem,
  type AgentConfirmationItemKind
} from "@/agent/agentConfirmationQueue";
import { formatAgentCommandRiskReason } from "@/i18n/agentMessages";
import { Tooltip } from "./Tooltip";

type AgentConfirmationCallbacks = {
  onAllowAgentCommand?: (threadId: string, action: AgentAction) => void;
  onApplyAllChanges?: () => void;
  onApproveAgentCommand?: (threadId: string, action: AgentAction) => void;
  onConfirmAgentExtension?: (threadId: string, action: AgentAction) => void;
  onCompleteAgentAction?: (threadId: string, action: AgentAction) => void;
  onDiscardAllChanges?: () => void;
  onOpenChangesTab?: () => void;
  onOpenFiles?: () => void;
  onOpenSourceControl?: () => void;
  onPreviewFile?: (relativePath: string) => void;
  onSkipAgentAction?: (threadId: string, action: AgentAction) => void;
  onViewAction?: (actionId: string) => void;
};

type AgentConfirmationQueueProps = AgentConfirmationCallbacks & {
  commandSafetyPolicy: AgentCommandSafetyPolicy;
  fullAccess: boolean;
  items: AgentConfirmationItem[];
  language: Language;
  threadId: string | null;
  variant?: "compact" | "full";
};

type CompactAgentAttentionStripProps = AgentConfirmationCallbacks & {
  items: AgentConfirmationItem[];
  language: Language;
  threadId: string | null;
};

type AgentConfirmationCopy = ReturnType<typeof getCompactAgentControlCopy>;

// 确认队列把当前门禁和后续门禁放到同一个可操作面板, 避免用户只看到等待提示
export function AgentConfirmationQueue({
  commandSafetyPolicy,
  fullAccess,
  items,
  language,
  threadId,
  variant = "full",
  onAllowAgentCommand,
  onApplyAllChanges,
  onApproveAgentCommand,
  onConfirmAgentExtension,
  onCompleteAgentAction,
  onDiscardAllChanges,
  onOpenChangesTab,
  onOpenFiles,
  onOpenSourceControl,
  onPreviewFile,
  onSkipAgentAction,
  onViewAction
}: AgentConfirmationQueueProps): ReactElement | null {
  const copy = getCompactAgentControlCopy(language);

  if (!threadId || items.length === 0) {
    return null;
  }

  const activeThreadId = threadId;
  const panelClassName =
    variant === "compact"
      ? "mt-4 rounded-[14px] border border-[#d9d9e3] bg-[#fafafa] px-3 py-3"
      : "rounded-[18px] border border-[#f4c7ab] bg-[#fffaf5] p-4";

  function renderMetadata(item: AgentConfirmationItem): ReactElement | null {
    const rows = getAgentConfirmationMetadataRows(item, copy, language);

    if (rows.length === 0) {
      return null;
    }

    return (
      <dl className="mt-3 grid gap-1.5 rounded-[10px] bg-[#fafafa] px-2.5 py-2 text-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
            <dt className="text-[#8e8ea0]">{row.label}</dt>
            <dd className="min-w-0 break-words font-medium text-[#202123]">{row.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  // 当前确认项提供真实按钮, 后续项只允许定位动作, 避免越过队列顺序执行
  function renderControls(item: AgentConfirmationItem): ReactElement | null {
    const controls: ReactElement[] = [];

    controls.push(
      <button
        key="copy-approval-summary"
        type="button"
        aria-label={`${copy.copyApprovalSummary} ${item.label}`}
        onClick={() =>
          void navigator.clipboard?.writeText(
            formatAgentConfirmationSummary(item, copy, commandSafetyPolicy, fullAccess, language)
          )
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 text-[11px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
      >
        <Copy className="h-3.5 w-3.5" />
        {copy.copyApprovalSummary}
      </button>
    );

    if (item.action) {
      controls.push(
        <button
          key="view-action"
          type="button"
          aria-label={`${copy.viewAction} ${item.action.label}`}
          onClick={() => onViewAction?.(item.action!.id)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#d9d9e3] bg-white px-2.5 text-[11px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          {copy.viewAction}
        </button>
      );
    }

    if (!item.active) {
      return controls.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{controls}</div> : null;
    }

    if (item.kind === "pending-changes") {
      if (item.previewPath && onPreviewFile) {
        controls.push(
          <button
            key="review-changes"
            type="button"
            aria-label={`${copy.reviewQueuedChanges} ${item.previewPath}`}
            onClick={() => {
              onPreviewFile(item.previewPath!);
              onOpenFiles?.();
              onOpenChangesTab?.();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#9a3412] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
          >
            <FileText className="h-3.5 w-3.5" />
            {copy.reviewChanges}
          </button>
        );
      }

      if (onApplyAllChanges) {
        controls.push(
          <button
            key="apply-all"
            type="button"
            aria-label={copy.applyQueuedChanges}
            onClick={onApplyAllChanges}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#f4c7ab] bg-white px-2.5 text-[11px] font-semibold text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {copy.applyAllChanges}
          </button>
        );
      }

      if (onDiscardAllChanges) {
        controls.push(
          <button
            key="discard-all"
            type="button"
            aria-label={copy.discardQueuedChanges}
            onClick={onDiscardAllChanges}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#f4c7ab] bg-white px-2.5 text-[11px] font-semibold text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
          >
            <SkipForward className="h-3.5 w-3.5" />
            {copy.discardAllChanges}
          </button>
        );
      }

      return controls.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{controls}</div> : null;
    }

    const action = item.action;

    if (!action) {
      return controls.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{controls}</div> : null;
    }

    if (item.kind === "command-approval" && action.command && onApproveAgentCommand) {
      controls.push(
        <button
          key="approve-command"
          type="button"
          aria-label={`${copy.approveQueuedCommand} ${action.command}`}
          onClick={() => onApproveAgentCommand(activeThreadId, action)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#9a3412] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {copy.approveCommand}
        </button>
      );
    }

    if (item.kind === "command-approval" && action.command && onAllowAgentCommand) {
      controls.push(
        <button
          key="allow-command"
          type="button"
          aria-label={`${copy.allowQueuedCommand} ${action.command}`}
          onClick={() => onAllowAgentCommand(activeThreadId, action)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#f4c7ab] bg-white px-2.5 text-[11px] font-semibold text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {copy.allowExactCommand}
        </button>
      );
    }

    if (item.kind === "extension-confirmation" && onConfirmAgentExtension) {
      controls.push(
        <button
          key="confirm-extension"
          type="button"
          aria-label={`${copy.confirmExtensionAction} ${action.label}`}
          onClick={() => onConfirmAgentExtension(activeThreadId, action)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#9a3412] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {copy.confirmExtensionAction}
        </button>
      );
    }

    if (item.kind === "manual-gate" && onCompleteAgentAction) {
      controls.push(
        <button
          key="complete-manual"
          type="button"
          aria-label={`${copy.confirmQueuedAction} ${action.label}`}
          onClick={() => onCompleteAgentAction(activeThreadId, action)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#9a3412] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {copy.markReviewComplete}
        </button>
      );
    }

    if (item.kind === "commit-gate" && onOpenSourceControl) {
      controls.push(
        <button
          key="open-source-control"
          type="button"
          aria-label={`${copy.openQueuedSourceControl} ${action.label}`}
          onClick={onOpenSourceControl}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#9a3412] px-2.5 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
        >
          <Terminal className="h-3.5 w-3.5" />
          {copy.openSourceControl}
        </button>
      );
    }

    if (onSkipAgentAction && canSkipAgentAction(action)) {
      controls.push(
        <button
          key="skip-action"
          type="button"
          aria-label={`${copy.skipQueuedAction} ${action.label}`}
          onClick={() => onSkipAgentAction(activeThreadId, action)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#f4c7ab] bg-white px-2.5 text-[11px] font-semibold text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
        >
          <SkipForward className="h-3.5 w-3.5" />
          {copy.skipAction}
        </button>
      );
    }

    return controls.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{controls}</div> : null;
  }

  function renderItem(item: AgentConfirmationItem): ReactElement {
    const toneClassName = item.active
      ? "border-[#f4c7ab] bg-white"
      : "border-[#ececf1] bg-white";

    return (
      <article key={item.id} className={`rounded-[12px] border px-3 py-2 ${toneClassName}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              item.active
                ? "border-[#f4c7ab] bg-[#fff7ed] text-[#9a3412]"
                : "border-[#d9d9e3] bg-[#f7f7f8] text-[#565869]"
            }`}
          >
            {item.active ? copy.currentApproval : copy.upcomingApproval}
          </span>
          <span className="text-[11px] font-medium text-[#8e8ea0]">
            {getAgentConfirmationKindLabel(item.kind, copy)}
          </span>
        </div>
        <p className="mt-2 break-words text-sm font-semibold leading-5 text-[#202123]">
          {getAgentConfirmationTitle(item, copy)}
        </p>
        <p className="mt-1 break-words text-[12px] leading-5 text-[#565869]">
          {getAgentConfirmationBody(item, copy, commandSafetyPolicy, fullAccess, language)}
        </p>
        {renderMetadata(item)}
        {renderControls(item)}
      </article>
    );
  }

  return (
    <section role="region" aria-label={copy.confirmationQueue} className={panelClassName}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#202123]">
          <CheckCircle2 className="h-4 w-4 text-[#9a3412]" />
          {copy.confirmationQueue}
        </h3>
        <span className="rounded-full border border-[#f4c7ab] bg-white px-2 py-0.5 text-[11px] font-medium text-[#9a3412]">
          {copy.confirmationCount(items.length)}
        </span>
      </div>
      <div className="mt-3 grid gap-2">{items.map((item) => renderItem(item))}</div>
    </section>
  );
}

// compact 主屏只露出当前阻塞点, 保持确认入口可见但不铺开完整队列
export function CompactAgentAttentionStrip({
  items,
  language,
  threadId,
  onApproveAgentCommand,
  onConfirmAgentExtension,
  onCompleteAgentAction,
  onOpenFiles,
  onOpenSourceControl,
  onPreviewFile,
  onSkipAgentAction
}: CompactAgentAttentionStripProps): ReactElement | null {
  const copy = getCompactAgentControlCopy(language);
  const item = items.find((candidate) => candidate.active);

  if (!threadId || !item) {
    return null;
  }

  const action = item.action;
  const actions: ReactElement[] = [];

  if (item.kind === "pending-changes" && item.previewPath && onPreviewFile) {
    actions.push(
      renderCompactIconAction({
        key: "review-changes",
        label: copy.reviewChanges,
        icon: FileText,
        onClick: () => {
          onPreviewFile(item.previewPath!);
          onOpenFiles?.();
        }
      })
    );
  }

  if (item.kind === "command-approval" && action?.command && onApproveAgentCommand) {
    actions.push(
      renderCompactIconAction({
        key: "approve-command",
        label: copy.approveCommand,
        icon: CheckCircle2,
        onClick: () => onApproveAgentCommand(threadId, action)
      })
    );
  }

  if (item.kind === "extension-confirmation" && action && onConfirmAgentExtension) {
    actions.push(
      renderCompactIconAction({
        key: "confirm-extension",
        label: copy.confirmExtensionAction,
        icon: CheckCircle2,
        onClick: () => onConfirmAgentExtension(threadId, action)
      })
    );
  }

  if (item.kind === "manual-gate" && action && onCompleteAgentAction) {
    actions.push(
      renderCompactIconAction({
        key: "complete-manual",
        label: copy.markReviewComplete,
        icon: CheckCircle2,
        onClick: () => onCompleteAgentAction(threadId, action)
      })
    );
  }

  if (item.kind === "commit-gate" && onOpenSourceControl) {
    actions.push(
      renderCompactIconAction({
        key: "open-source-control",
        label: copy.openSourceControl,
        icon: Terminal,
        onClick: onOpenSourceControl
      })
    );
  }

  if (action && onSkipAgentAction && canSkipAgentAction(action)) {
    actions.push(
      renderCompactIconAction({
        key: "skip-action",
        label: copy.skipAction,
        icon: SkipForward,
        onClick: () => onSkipAgentAction(threadId, action),
        quiet: true
      })
    );
  }

  return (
    <section className="mx-auto flex min-h-11 w-full max-w-[880px] items-center gap-2 border-b border-[#ececf1] pb-2 text-[14px] leading-5 text-[#565869]">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#9a3412]" />
      <span className="inline-flex h-7 shrink-0 items-center font-medium text-[#8e8ea0]">
        {copy.currentApproval}
      </span>
      <span className="flex min-h-7 min-w-0 flex-1 items-center whitespace-pre-wrap break-words font-medium text-[#202123]">
        {getAgentConfirmationTitle(item, copy)}
      </span>
      <span className="hidden h-7 shrink-0 items-center text-[12px] text-[#8e8ea0] sm:inline-flex">
        {getAgentConfirmationKindLabel(item.kind, copy)}
      </span>
      <div className="flex shrink-0 items-center gap-1">{actions.length > 0 ? actions : null}</div>
    </section>
  );
}

function renderCompactIconAction({
  icon: Icon,
  key,
  label,
  onClick,
  quiet = false
}: {
  icon: LucideIcon;
  key: string;
  label: string;
  onClick: () => void;
  quiet?: boolean;
}): ReactElement {
  return (
    <Tooltip key={key} label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-[9px] border transition active:scale-[0.98] ${
          quiet
            ? "border-[#d9d9e3] bg-white text-[#565869] hover:bg-[#f7f7f8]"
            : "border-[#f4c7ab] bg-[#fff7ed] text-[#9a3412] hover:bg-[#ffedd5]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

// 把确认项类型转成短标签, 让队列可以快速扫读
function getAgentConfirmationKindLabel(
  kind: AgentConfirmationItemKind,
  copy: AgentConfirmationCopy
): string {
  switch (kind) {
    case "pending-changes":
      return copy.reviewGate;
    case "failed-action":
      return copy.failedActionTitle;
    case "manual-gate":
      return copy.manualGateTitle;
    case "extension-confirmation":
      return copy.extensionConfirmationTitle;
    case "command-approval":
      return copy.commandApprovalTitle;
    case "command-blocked":
      return copy.commandBlockedTitle;
    case "commit-gate":
      return copy.commitGateTitle;
  }
}

// 生成确认项标题, 文件审查使用统一标题避免把路径当成动作名
function getAgentConfirmationTitle(
  item: AgentConfirmationItem,
  copy: AgentConfirmationCopy
): string {
  if (item.kind === "pending-changes") {
    return copy.pendingChangesTitle;
  }

  if (item.kind === "extension-confirmation") {
    return copy.extensionConfirmationHeading(item.label);
  }

  return item.label;
}

// 生成确认项说明, 当前项解释要处理什么, 后续项提示等待队列推进
function getAgentConfirmationBody(
  item: AgentConfirmationItem,
  copy: AgentConfirmationCopy,
  commandSafetyPolicy: AgentCommandSafetyPolicy,
  fullAccess: boolean,
  language: Language
): string {
  if (!item.active) {
    return copy.queuedGateBody;
  }

  if (item.kind === "pending-changes") {
    return copy.pendingChangesBody(
      item.pendingChangeCount ?? 0,
      item.previewPath ?? copy.pendingChangesTitle
    );
  }

  if (item.kind === "failed-action") {
    return getFailedActionBody(item, copy);
  }

  if (item.kind === "extension-confirmation") {
    return item.extensionConfirmation?.inputSummary ?? copy.extensionConfirmationBody(item.label);
  }

  const action = item.action;

  if (!action) {
    return item.label;
  }

  if (item.kind === "command-approval" || item.kind === "command-blocked") {
    const commandRisk =
      action.kind === "run-command" && action.command
        ? resolveAgentCommandRisk(action.command, { ...commandSafetyPolicy, fullAccess })
        : null;

    return commandRisk?.level === "ask" || commandRisk?.level === "deny"
      ? `${action.command ?? action.label}: ${formatAgentCommandRiskReason(language, commandRisk.reason)}`
      : action.command ?? action.label;
  }

  if (item.kind === "commit-gate") {
    return copy.openSourceControl;
  }

  return copy.manualGateBody(action.label);
}

function getFailedActionBody(
  item: AgentConfirmationItem,
  copy: AgentConfirmationCopy
): string {
  if (item.failureRecoveryPolicy === "manual") {
    return copy.failedActionManualBody;
  }

  if (item.failureRecoveryPolicy === "suggest") {
    return copy.failedActionSuggestBody;
  }

  if (item.autoFailureRecoveryExhausted) {
    return copy.failedActionAutoExhaustedBody(item.maxFailureRecoveryAttempts);
  }

  return copy.failedActionAutoBody(
    item.maxFailureRecoveryAttempts,
    item.autoFailureRecoveryAttemptsUsed
  );
}

function getFailureRecoveryPolicyLabel(
  policy: AgentConfirmationItem["failureRecoveryPolicy"],
  copy: AgentConfirmationCopy
): string {
  if (policy === "manual") {
    return copy.failureRecoveryManual;
  }

  if (policy === "auto") {
    return copy.failureRecoveryAuto;
  }

  return copy.failureRecoverySuggest;
}

function formatExtensionConfirmationDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

// 为确认项生成结构化上下文行, 保持 UI 和复制摘要使用同一份信息
function getAgentConfirmationMetadataRows(
  item: AgentConfirmationItem,
  copy: AgentConfirmationCopy,
  language: Language
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if (item.command) {
    rows.push({ label: copy.commandLabel, value: item.command });
  }

  if (item.cwd) {
    rows.push({ label: copy.cwdLabel, value: item.cwd });
  }

  if (item.riskReason) {
    rows.push({
      label: copy.riskLabel,
      value: formatAgentCommandRiskReason(language, item.riskReason)
    });
  }

  if (item.extensionConfirmation) {
    rows.push({
      label: copy.extensionLabel,
      value: item.extensionConfirmation.extensionId
    });
    rows.push({
      label: copy.extensionActionLabel,
      value: item.extensionConfirmation.actionId
    });
    rows.push({
      label: copy.extensionRiskLabel,
      value: item.extensionConfirmation.risk
    });
    rows.push({
      label: copy.extensionExpiresAtLabel,
      value: formatExtensionConfirmationDate(item.extensionConfirmation.expiresAt)
    });
  }

  if (item.kind === "failed-action") {
    rows.push({
      label: copy.failureRecoveryPolicyLabel,
      value: getFailureRecoveryPolicyLabel(item.failureRecoveryPolicy, copy)
    });

    if (item.maxFailureRecoveryAttempts !== undefined) {
      rows.push({
        label: copy.failureRecoveryAttemptLimitLabel,
        value: copy.failureRecoveryAttemptLimit(item.maxFailureRecoveryAttempts)
      });
      rows.push({
        label: copy.failureRecoveryAttemptProgressLabel,
        value: copy.failureRecoveryAttemptProgress(
          item.autoFailureRecoveryAttemptsUsed ?? 0,
          item.maxFailureRecoveryAttempts
        )
      });
    }
  }

  if (item.active) {
    rows.push({
      label: copy.afterApprovalLabel,
      value: item.afterApprovalActionLabel ?? copy.noNextQueuedAction
    });
  }

  return rows;
}

// 生成可复制的审批摘要, 方便用户把批准依据贴给模型或留作审计记录
function formatAgentConfirmationSummary(
  item: AgentConfirmationItem,
  copy: AgentConfirmationCopy,
  commandSafetyPolicy: AgentCommandSafetyPolicy,
  fullAccess: boolean,
  language: Language
): string {
  const lines = [
    `${copy.confirmationQueue}: ${getAgentConfirmationTitle(item, copy)}`,
    `${copy.confirmationType}: ${getAgentConfirmationKindLabel(item.kind, copy)}`,
    `${copy.confirmationStatus}: ${item.active ? copy.currentApproval : copy.upcomingApproval}`,
    `${copy.confirmationContext}: ${getAgentConfirmationBody(
      item,
      copy,
      commandSafetyPolicy,
      fullAccess,
      language
    )}`
  ];

  for (const row of getAgentConfirmationMetadataRows(item, copy, language)) {
    lines.push(`${row.label}: ${row.value}`);
  }

  return lines.join("\n");
}

// 提供 compact/full 确认面板共享的中英文文案
export function getCompactAgentControlCopy(language: Language) {
  if (language === "zh-CN") {
    return {
      aria: "Agent 操作确认",
      title: "Agent 下一步",
      confirmationQueue: "确认队列",
      confirmationCount: (count: number) => `${count} 项`,
      confirmationContext: "上下文",
      confirmationStatus: "状态",
      confirmationType: "类型",
      currentApproval: "当前等待",
      upcomingApproval: "稍后停止",
      viewAction: "查看动作",
      copyApprovalSummary: "复制审批摘要",
      pendingChangesTitle: "待审查修改",
      pendingChangesBody: (count: number, path: string) =>
        count > 1 ? `先处理 ${path} 等 ${count} 个修改, Forge 才会继续` : `先处理 ${path}, Forge 才会继续`,
      failedActionTitle: "失败动作",
      failedActionBody: "Forge 会自动尝试自修复; 只有权限、依赖或跳过需要你介入",
      failedActionManualBody: "当前恢复策略为手动处理, 请查看日志后重试、生成修复计划或跳过",
      failedActionSuggestBody: "Forge 会根据失败上下文自动准备恢复步骤, 必要时再等待人工审批",
      failedActionAutoExhaustedBody: (count?: number) =>
        count === undefined
          ? "自动恢复已停止, 请查看日志后重试、生成修复计划或跳过"
          : `自动恢复已达到 ${count} 次上限, 请查看日志后重试、生成修复计划或跳过`,
      failedActionAutoBody: (count?: number, used = 0) =>
        count === undefined
          ? "Forge 会按上限自动尝试恢复, 权限或依赖类步骤会等待人工审批"
          : `Forge 已自动尝试 ${used} / ${count} 次恢复, 后续只在权限、依赖或跳过时需要介入`,
      manualGateTitle: "人工确认",
      commandApprovalTitle: "命令批准",
      commandBlockedTitle: "命令被阻止",
      extensionConfirmationTitle: "扩展确认",
      extensionConfirmationHeading: (label: string) => `确认扩展操作: ${label}`,
      extensionConfirmationBody: (label: string) =>
        `请确认是否允许 Forge 执行 ${label}, 该操作会访问或修改外部服务数据`,
      commitGateTitle: "提交门禁",
      queuedGateBody: "这是后续停止点, 当前队列推进到这里后才会开放确认按钮",
      commandLabel: "命令",
      cwdLabel: "目录",
      riskLabel: "风险",
      extensionLabel: "扩展",
      extensionActionLabel: "动作",
      extensionRiskLabel: "风险",
      extensionExpiresAtLabel: "过期",
      failureRecoveryPolicyLabel: "恢复策略",
      failureRecoveryAttemptLimitLabel: "自动上限",
      failureRecoveryAttemptProgressLabel: "已尝试",
      failureRecoveryManual: "手动处理",
      failureRecoverySuggest: "提示修复",
      failureRecoveryAuto: "自动恢复",
      failureRecoveryAttemptLimit: (count: number) => `${count} 次`,
      failureRecoveryAttemptProgress: (used: number, count: number) => `${used} / ${count} 次`,
      afterApprovalLabel: "批准后",
      noNextQueuedAction: "没有后续队列动作",
      reviewQueuedChanges: "审查队列修改",
      applyQueuedChanges: "应用队列修改",
      discardQueuedChanges: "丢弃队列修改",
      approveQueuedCommand: "批准队列命令",
      allowQueuedCommand: "始终允许队列命令",
      confirmExtensionAction: "确认扩展操作",
      confirmQueuedAction: "确认队列动作",
      openQueuedSourceControl: "打开队列源码管理",
      retryQueuedAction: "重试队列动作",
      generateQueuedFixPlan: "生成队列修复计划",
      skipQueuedAction: "跳过队列动作",
      current: "当前",
      progress: "进度",
      progressValue: (completed: number, total: number) => `已完成 ${completed} / ${total}`,
      nextGate: "下一门禁",
      noGate: "没有待处理门禁",
      noCurrent: "没有待处理动作",
      waiting: "等待下一步",
      running: "正在运行",
      ready: "可继续执行",
      paused: "Agent 已暂停",
      complete: "动作队列已完成",
      manualGate: "等待人工确认",
      manualGateBody: (label: string) => `请确认已处理 ${label}, Forge 才会继续执行队列`,
      reviewGate: "审查门禁",
      reviewChangesTitle: "审查生成的修改",
      reviewChangesBody: "先查看 diff, 再应用或丢弃生成的修改, Forge 才会继续后续步骤",
      reviewChanges: "查看修改",
      applyAllChanges: "应用全部",
      discardAllChanges: "丢弃全部",
      pendingChanges: (count: number) => `${count} 个待应用修改`,
      safeReady: (count: number) => `可连续执行 ${count} 个安全动作`,
      stopsBefore: (label: string) => `将在 ${label} 前停止`,
      continueSafe: "继续安全动作",
      runNext: "运行下一步",
      approveCommand: "批准命令",
      allowExactCommand: "始终允许精确命令",
      commandNeedsApproval: "命令需要批准",
      commandBlocked: "命令已被安全策略阻止",
      openSourceControl: "打开源代码管理",
      markReviewComplete: "确认已完成审查",
      skipAction: "跳过动作",
      resumeAgent: "恢复 Agent",
      pausedTitle: "Agent 队列已暂停",
      pausedBody: "恢复后 Forge 会继续执行后续安全动作, 仍会在审查和命令门禁前停止",
      failedTitle: "动作失败, 队列已暂停",
      retryAction: "重试动作",
      generateFixPlan: "生成修复计划",
      generateNextPlan: "生成后续计划",
      generateNextPlanBody: "根据当前线程状态, 已完成动作和工具结果继续规划下一批步骤",
      readyStatus: "就绪",
      pendingStatus: "待执行"
    };
  }

  return {
    aria: "Agent action confirmation",
    title: "Agent next step",
    confirmationQueue: "Confirmation queue",
    confirmationCount: (count: number) => `${count} ${count === 1 ? "item" : "items"}`,
    confirmationContext: "Context",
    confirmationStatus: "Status",
    confirmationType: "Type",
    currentApproval: "Current",
    upcomingApproval: "Upcoming",
    viewAction: "View action",
    copyApprovalSummary: "Copy approval summary",
    pendingChangesTitle: "Pending file review",
    pendingChangesBody: (count: number, path: string) =>
      count > 1
        ? `Review ${path} and ${count - 1} other changes before Forge continues.`
        : `Review ${path} before Forge continues.`,
    failedActionTitle: "Failed action",
    failedActionBody: "Forge will attempt auto-recovery; only permissions, dependencies, or skipping need your input.",
    failedActionManualBody:
      "Recovery is set to manual. Review logs, retry, generate a fix plan, or skip this action.",
    failedActionSuggestBody:
      "Forge will prepare recovery steps from the failure context and stop for approval when needed.",
    failedActionAutoExhaustedBody: (count?: number) =>
      count === undefined
        ? "Automatic recovery has stopped. Review logs, retry, generate a fix plan, or skip this action."
        : `Automatic recovery reached its ${count} ${count === 1 ? "attempt" : "attempts"} limit. Review logs, retry, generate a fix plan, or skip this action.`,
    failedActionAutoBody: (count?: number, used = 0) =>
      count === undefined
        ? "Forge will auto-recover within its attempt limit and stop for permission or dependency approval."
        : `Forge has auto-recovered ${used} / ${count} ${count === 1 ? "time" : "times"}. It will only stop for permissions, dependencies, or skip decisions.`,
    manualGateTitle: "Manual confirmation",
    commandApprovalTitle: "Command approval",
    commandBlockedTitle: "Blocked command",
    extensionConfirmationTitle: "Extension confirmation",
    extensionConfirmationHeading: (label: string) => `Confirm extension action: ${label}`,
    extensionConfirmationBody: (label: string) =>
      `Confirm whether Forge may run ${label}. This action can read or mutate external service data.`,
    commitGateTitle: "Commit gate",
    queuedGateBody: "This is an upcoming stop. Forge will expose its approval controls when the queue reaches it.",
    commandLabel: "Command",
    cwdLabel: "cwd",
    riskLabel: "Risk",
    extensionLabel: "Extension",
    extensionActionLabel: "Action",
    extensionRiskLabel: "Risk",
    extensionExpiresAtLabel: "Expires",
    failureRecoveryPolicyLabel: "Recovery",
    failureRecoveryAttemptLimitLabel: "Auto limit",
    failureRecoveryAttemptProgressLabel: "Attempted",
    failureRecoveryManual: "Manual",
    failureRecoverySuggest: "Suggest fix",
    failureRecoveryAuto: "Auto recovery",
    failureRecoveryAttemptLimit: (count: number) =>
      `${count} automatic ${count === 1 ? "attempt" : "attempts"}`,
    failureRecoveryAttemptProgress: (used: number, count: number) => `${used} / ${count}`,
    afterApprovalLabel: "After approval",
    noNextQueuedAction: "No later queued action",
    reviewQueuedChanges: "Review queued changes",
    applyQueuedChanges: "Apply queued changes",
    discardQueuedChanges: "Discard queued changes",
    approveQueuedCommand: "Approve queued command",
    allowQueuedCommand: "Always allow queued command",
    confirmExtensionAction: "Confirm extension",
    confirmQueuedAction: "Confirm queued action",
    openQueuedSourceControl: "Open queued source control",
    retryQueuedAction: "Retry queued action",
    generateQueuedFixPlan: "Generate queued fix plan",
    skipQueuedAction: "Skip queued action",
    current: "Current",
    progress: "Progress",
    progressValue: (completed: number, total: number) => `${completed} / ${total} completed`,
    nextGate: "Next gate",
    noGate: "No pending gate",
    noCurrent: "No pending action",
    waiting: "Waiting for next step",
    running: "Running",
    ready: "Ready to continue",
    paused: "Agent paused",
    complete: "Action queue complete",
    manualGate: "Waiting for manual confirmation",
    manualGateBody: (label: string) => `Confirm ${label} before Forge continues the queue.`,
    reviewGate: "Review gate",
    reviewChangesTitle: "Review generated changes",
    reviewChangesBody: "Inspect the diff, then apply or discard the generated changes before Forge continues.",
    reviewChanges: "Review changes",
    applyAllChanges: "Apply all",
    discardAllChanges: "Discard all",
    pendingChanges: (count: number) => `${count} pending ${count === 1 ? "change" : "changes"}`,
    safeReady: (count: number) => `${count} safe ${count === 1 ? "action" : "actions"} ready`,
    stopsBefore: (label: string) => `Stops before ${label}`,
    continueSafe: "Continue safe actions",
    runNext: "Run next action",
    approveCommand: "Approve command",
    allowExactCommand: "Always allow exact command",
    commandNeedsApproval: "Command needs approval",
    commandBlocked: "Command blocked by safety policy",
    openSourceControl: "Open source control",
    markReviewComplete: "Mark review complete",
    skipAction: "Skip action",
    resumeAgent: "Resume agent",
    pausedTitle: "Agent queue paused",
    pausedBody: "Resume to continue later safe actions. Forge will still stop at review and command gates.",
    failedTitle: "Action failed, queue paused",
    retryAction: "Retry action",
    generateFixPlan: "Generate fix plan",
    generateNextPlan: "Generate next plan",
    generateNextPlanBody:
      "Continue from the current thread state, completed actions, and tool results.",
    readyStatus: "Ready",
    pendingStatus: "Pending"
  };
}

// 用户可以显式跳过未完成动作, 但不能跳过正在运行或已经终态的动作
export function canSkipAgentAction(action: AgentAction): boolean {
  return action.status === "pending" || action.status === "failed";
}
