import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Circle,
  Code2,
  FileText,
  GitPullRequest,
  Layers,
  Play,
  Terminal,
} from "lucide-react";
import type { Language } from "@shared/modelTypes";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import {
  findNextPendingAgentAction,
  getRunnablePendingAgentActions,
  isRunnableAgentAction
} from "@/agent/agentActionExecutor";
import { useI18n } from "@/i18n/useI18n";
import type { CommandRunResult, TaskThread, TaskThreadEvent } from "@/state/taskThreads";

type ThreadWorkspaceProps = {
  language: Language;
  hasProject?: boolean;
  selectedThreadId: string | null;
  threads: TaskThread[];
  projectScan: ProjectScanResult | null;
  previewFile: ProjectTextFile | null;
  changePreview: ProjectFileChangePreview | null;
  changePreviews?: ProjectFileChangePreview[];
  onSelectThread: (threadId: string) => void;
  onPickProject?: () => void;
  onOpenRecentProject?: () => void;
  onRunAgentAction?: (threadId: string, action: AgentAction) => void;
  onRunAgentActions?: (threadId: string, actions: AgentAction[]) => void;
  onGenerateFailureFix?: (threadId: string, action: AgentAction) => void;
  onGenerateCommandFix?: (threadId: string, result: CommandRunResult) => void;
  onRunCommand: (threadId: string, command: string) => void;
  onPreviewFile: (relativePath: string) => void;
  onPreviewChange?: (relativePath: string, nextContent: string) => void;
  onApplyChange?: (relativePath: string, nextContent: string) => void;
  onDiscardChange?: (relativePath: string) => void;
  onApplyAllChanges?: () => void;
  onDiscardAllChanges?: () => void;
  onGenerateFileChange?: (relativePath: string, currentContent: string) => void;
  onGenerateSelectedFileChanges?: (relativePaths: string[]) => void;
};

type WorkspaceTab = "plan" | "changes" | "commands" | "logs";

export function ThreadWorkspace({
  language,
  hasProject = true,
  selectedThreadId,
  threads,
  projectScan,
  previewFile,
  changePreview,
  changePreviews,
  onSelectThread,
  onPickProject,
  onOpenRecentProject,
  onRunAgentAction,
  onRunAgentActions,
  onGenerateFailureFix,
  onGenerateCommandFix,
  onRunCommand,
  onPreviewFile,
  onPreviewChange,
  onApplyChange,
  onDiscardChange,
  onApplyAllChanges,
  onDiscardAllChanges,
  onGenerateFileChange,
  onGenerateSelectedFileChanges
}: ThreadWorkspaceProps): ReactElement {
  const { t } = useI18n(language);
  const [command, setCommand] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("plan");
  const [selectedAgentActionId, setSelectedAgentActionId] = useState<string | null>(null);
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const allChangePreviews = changePreviews ?? (changePreview ? [changePreview] : []);
  const visibleChangePreview = previewFile
    ? (allChangePreviews.find((preview) => preview.relativePath === previewFile.relativePath) ??
      null)
    : null;
  const canEditPreview = Boolean(onPreviewChange || onApplyChange || onGenerateFileChange);
  const duration = useMemo(() => {
    if (!selectedThread) {
      return "0m";
    }

    const started = Date.parse(selectedThread.createdAt);

    if (Number.isNaN(started)) {
      return "0m";
    }

    const minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
    return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }, [selectedThread]);

  useEffect(() => {
    setDraftContent(visibleChangePreview?.nextContent ?? previewFile?.content ?? "");
  }, [previewFile, visibleChangePreview?.relativePath, visibleChangePreview?.nextContent]);

  useEffect(() => {
    if (!projectScan) {
      setSelectedFilePaths([]);
    }
  }, [projectScan]);

  function submitCommand(): void {
    const normalizedCommand = command.trim();

    if (!selectedThread || !normalizedCommand) {
      return;
    }

    onRunCommand(selectedThread.id, normalizedCommand);
    setCommand("");
  }

  if (!hasProject) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center px-6 py-8">
        <div className="w-full max-w-[680px] text-center">
          <div>
            <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] text-[#565869]">
              <Layers className="h-6 w-6" />
            </div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-normal text-[#202123] md:text-[30px]">
              {t("dashboard.title")}
            </h1>
            <p className="mx-auto mt-3 max-w-[540px] text-sm leading-6 text-[#6e6e80]">
              {t("dashboard.description")}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={onPickProject}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#202123] px-4 text-[12px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
              >
                {t("dashboard.pickProject")}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenRecentProject}
                className="inline-flex h-10 items-center rounded-[12px] border border-[#d9d9e3] bg-white px-4 text-[12px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
              >
                {t("dashboard.openRecent")}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!selectedThread) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center rounded-[20px] border border-[#ececf1] bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] text-[#565869]">
            <Layers className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold tracking-normal text-[#202123]">{t("threads.emptyTitle")}</h1>
          <p className="mt-2 text-[12px] leading-5 text-[#6e6e80]">{t("threads.emptyBody")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-[#ececf1] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      <aside className="min-h-0 overflow-auto border-r border-[#ececf1] bg-[#fafafa] p-3">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
          {t("threads.listTitle")}
        </h2>
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
                onClick={() => onSelectThread(thread.id)}
                className={`w-full rounded-[14px] border px-3 py-2.5 text-left text-[12px] transition active:scale-[0.99] ${
                  thread.id === selectedThread.id
                  ? "border-transparent bg-[#ececf1] text-[#202123]"
                  : "border-transparent text-[#565869] hover:bg-[#f7f7f8] hover:text-[#202123]"
              }`}
            >
              <span className="block truncate font-medium">{thread.title}</span>
              <span className="mt-1 block text-xs text-[#8e8ea0]">{thread.status}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <header className="border-b border-[#ececf1] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[#c3eadc] bg-[#effaf6] px-2.5 py-1 font-medium text-[#087443]">
                  {selectedThread.status}
                </span>
                <span className="rounded-full border border-[#ececf1] bg-[#f7f7f8] px-2.5 py-1 text-[#6e6e80]">
                  {t("thread.duration")}: {duration}
                </span>
                <span className="rounded-full border border-[#ececf1] bg-[#f7f7f8] px-2.5 py-1 text-[#6e6e80]">
                  {t("threads.model")}: {selectedThread.modelId}
                </span>
              </div>
              <h1 className="truncate text-xl font-semibold leading-7 tracking-normal text-[#202123]">
                {selectedThread.title}
              </h1>
            </div>
            <div className="flex rounded-[14px] border border-[#ececf1] bg-[#f7f7f8] p-1">
              {[
                { id: "plan", label: t("thread.tabs.plan") },
                { id: "changes", label: t("thread.tabs.changes") },
                { id: "commands", label: t("thread.tabs.commands") },
                { id: "logs", label: t("thread.tabs.logs") }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as WorkspaceTab)}
                  className={`h-8 rounded-[10px] px-3 text-[12px] transition active:scale-[0.99] ${
                    activeTab === tab.id
                      ? "bg-white text-[#202123] shadow-sm"
                      : "text-[#6e6e80] hover:text-[#202123]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="min-h-0 overflow-auto p-5">
          {activeTab === "plan" ? renderPlanTab() : null}
          {activeTab === "changes" ? renderChangesTab() : null}
          {activeTab === "commands" ? renderCommandsTab() : null}
          {activeTab === "logs" ? renderLogsTab() : null}
        </div>
      </div>
    </section>
  );

  function renderPlanTab(): ReactElement {
    const timelineEvents = selectedThread?.events.slice(0, 5) ?? [];
    const agentActions = selectedThread?.agentActions ?? [];
    const actionQueueCopy =
      language === "zh-CN"
        ? {
            title: "Agent 动作队列",
            empty: "等待模型生成可执行动作",
            pending: "待执行",
            open: "打开",
            run: "运行",
            runNext: "运行下一步",
            continueSafe: "继续安全动作",
            safeReady: (count: number) => `可连续执行 ${count} 个安全动作`,
            stopsBefore: (label: string) => `将在 ${label} 前停止`,
            manualGate: "需要人工审查",
            manualGateBody: (label: string) => `请先处理 ${label}, Forge 不会自动越过这个门禁`,
            reviewGate: "审查门禁",
            ready: "就绪",
            progress: (completed: number, total: number) => `已完成 ${completed} / ${total} 个动作`,
            failedCount: (count: number) => `${count} 个失败`,
            queueStoppedAt: (label: string) => `队列停止在 ${label}`,
            generateEdit: "生成修改"
          }
        : {
            title: "Agent action queue",
            empty: "Waiting for executable agent actions",
            pending: "Pending",
            open: "Open",
            run: "Run",
            runNext: "Run next action",
            continueSafe: "Continue safe agent actions",
            safeReady: (count: number) => `${count} safe actions ready`,
            stopsBefore: (label: string) => `Stops before ${label}`,
            manualGate: "Manual review required",
            manualGateBody: (label: string) =>
              `Handle ${label} before Forge continues. This gate will not be auto-run.`,
            reviewGate: "Review gate",
            ready: "Ready",
            progress: (completed: number, total: number) =>
              `${completed} / ${total} actions completed`,
            failedCount: (count: number) => `${count} failed`,
            queueStoppedAt: (label: string) => `Queue stopped at ${label}`,
            generateEdit: "Generate edit"
          };
    const recoveryActionCopy =
      language === "zh-CN"
        ? {
            viewLogs: "查看日志",
            retryFailed: "重试失败动作",
            generateFixPlan: "生成修复计划"
          }
        : {
            viewLogs: "View logs",
            retryFailed: "Retry failed action",
            generateFixPlan: "Generate fix plan"
          };
    const actionDetailsCopy =
      language === "zh-CN"
        ? {
            title: "动作详情",
            kind: "类型",
            status: "状态",
            target: "目标",
            command: "命令",
            nextStep: "下一步",
            noTarget: "无目标",
            selectAction: (label: string) => `选择动作 ${label}`,
            commandOutput: "最近命令输出",
            exitCode: "退出码",
            cwd: "目录",
            stdout: "stdout",
            stderr: "stderr",
            timedOut: "已超时",
            completed: "已完成",
            failed: "查看日志, 重试, 或生成修复计划",
            running: "正在等待命令或文件操作完成",
            ready: "可以运行",
            manualGate: "需要人工审查",
            skipped: "已跳过"
          }
        : {
            title: "Action details",
            kind: "Kind",
            status: "Status",
            target: "Target",
            command: "Command",
            nextStep: "Next step",
            noTarget: "No target",
            selectAction: (label: string) => `Select action ${label}`,
            commandOutput: "Last command output",
            exitCode: "Exit code",
            cwd: "cwd",
            stdout: "stdout",
            stderr: "stderr",
            timedOut: "Timed out",
            completed: "Completed",
            failed: "Review logs, retry, or generate a fix plan",
            running: "Waiting for the command or file operation to finish",
            ready: "Ready to run",
            manualGate: "Manual review required",
            skipped: "Skipped"
          };
    const queueStats = getQueueStats(agentActions);
    const queueBlockerAction = getQueueBlockerAction(agentActions);
    const queueBlocked =
      queueBlockerAction?.status === "failed" || queueBlockerAction?.status === "running";
    const nextPendingAction = queueBlocked ? null : findNextPendingAgentAction(agentActions);
    const runnablePendingActions = queueBlocked ? [] : getRunnablePendingAgentActions(agentActions);
    const nextRunnableAction =
      nextPendingAction && isRunnableAgentAction(nextPendingAction) ? nextPendingAction : null;
    const nextGateAction = getNextGateAction(agentActions, runnablePendingActions);
    const activeGateAction =
      nextPendingAction && !isRunnableAgentAction(nextPendingAction) ? nextPendingAction : nextGateAction;
    const selectedAgentAction =
      agentActions.find((action) => action.id === selectedAgentActionId) ??
      queueBlockerAction ??
      nextPendingAction ??
      agentActions[0] ??
      null;
    const selectedCommandResult = selectedAgentAction?.command
      ? findLatestCommandResult(selectedThread?.events ?? [], selectedAgentAction.command)
      : null;

    function getActionStatusLabel(action: AgentAction): string {
      if (action.status === "pending" && (action.kind === "manual" || action.kind === "commit")) {
        return actionQueueCopy.reviewGate;
      }

      if (action.status === "pending" && isRunnableAgentAction(action)) {
        return actionQueueCopy.ready;
      }

      if (action.status === "pending") {
        return actionQueueCopy.pending;
      }

      return action.status;
    }

    function renderAgentActionControl(action: AgentAction): ReactElement | null {
      if ((action.kind === "inspect-file" || action.kind === "edit-file") && action.target) {
        const target = action.target;
        const canGenerateEdit =
          action.kind === "edit-file" &&
          onGenerateFileChange &&
          previewFile?.relativePath === target;

        if (canGenerateEdit) {
          return (
            <button
              type="button"
              aria-label={`Generate edit action ${target}`}
              onClick={() => onGenerateFileChange(target, previewFile.content)}
              className="mt-2 h-7 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-medium text-[#202123] transition hover:bg-[#f7f7f8]"
            >
              {actionQueueCopy.generateEdit}
            </button>
          );
        }

        return (
          <button
            type="button"
            aria-label={`Open action ${target}`}
            onClick={() => {
              if (onRunAgentAction && selectedThread) {
                onRunAgentAction(selectedThread.id, action);
                return;
              }

              onPreviewFile(target);
            }}
            className="mt-2 h-7 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-medium text-[#202123] transition hover:bg-[#f7f7f8]"
          >
            {actionQueueCopy.open}
          </button>
        );
      }

      if (action.kind === "run-command" && action.command && selectedThread) {
        const commandToRun = action.command;

        return (
          <button
            type="button"
            aria-label={`Run action ${commandToRun}`}
            onClick={() => {
              if (onRunAgentAction) {
                onRunAgentAction(selectedThread.id, action);
                return;
              }

              onRunCommand(selectedThread.id, commandToRun);
            }}
            className="mt-2 h-7 rounded-[10px] bg-[#202123] px-2 text-[11px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
          >
            {actionQueueCopy.run}
          </button>
        );
      }

      return null;
    }

    function getActionNextStep(action: AgentAction): string {
      if (action.status === "completed") {
        return actionDetailsCopy.completed;
      }

      if (action.status === "failed") {
        return actionDetailsCopy.failed;
      }

      if (action.status === "running") {
        return actionDetailsCopy.running;
      }

      if (action.status === "skipped") {
        return actionDetailsCopy.skipped;
      }

      if (action.kind === "manual" || action.kind === "commit") {
        return actionDetailsCopy.manualGate;
      }

      if (isRunnableAgentAction(action)) {
        return actionDetailsCopy.ready;
      }

      return actionQueueCopy.pending;
    }

    function renderAgentActionDetails(
      action: AgentAction,
      commandResult: CommandRunResult | null
    ): ReactElement {
      const detailRows = [
        { label: actionDetailsCopy.kind, value: action.kind },
        { label: actionDetailsCopy.status, value: getActionStatusLabel(action) },
        { label: actionDetailsCopy.target, value: action.target ?? actionDetailsCopy.noTarget },
        ...(action.command ? [{ label: actionDetailsCopy.command, value: action.command }] : [])
      ];

      return (
        <section
          aria-label={actionDetailsCopy.title}
          className="rounded-[18px] border border-[#ececf1] bg-white p-4"
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202123]">
            <Layers className="h-4 w-4 text-[#565869]" />
            {actionDetailsCopy.title}
          </h2>
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
              {actionDetailsCopy.nextStep}
            </div>
            <p className="mt-1 text-sm leading-5 text-[#202123]">{getActionNextStep(action)}</p>
          </div>
          {commandResult ? (
            <div className="mt-3 border-t border-[#ececf1] pt-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
                {actionDetailsCopy.commandOutput}
              </h3>
              <dl className="mt-2 grid gap-2 text-xs">
                <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                  <dt className="text-[#8e8ea0]">{actionDetailsCopy.exitCode}</dt>
                  <dd className="font-medium text-[#202123]">
                    {commandResult.exitCode === null ? "null" : commandResult.exitCode}
                  </dd>
                </div>
                <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                  <dt className="text-[#8e8ea0]">{actionDetailsCopy.cwd}</dt>
                  <dd className="min-w-0 break-words font-medium text-[#202123]">
                    {commandResult.cwd}
                  </dd>
                </div>
                {commandResult.timedOut ? (
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                    <dt className="text-[#8e8ea0]">{actionDetailsCopy.timedOut}</dt>
                    <dd className="font-medium text-[#9a3412]">true</dd>
                  </div>
                ) : null}
              </dl>
              {commandResult.stdout.trim() ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-medium text-[#8e8ea0]">
                    {actionDetailsCopy.stdout}
                  </div>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#111827] p-2 font-mono text-[11px] leading-4 text-[#f8fafc]">
                    {formatCommandOutputSnippet(commandResult.stdout)}
                  </pre>
                </div>
              ) : null}
              {commandResult.stderr.trim() ? (
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-medium text-[#8e8ea0]">
                    {actionDetailsCopy.stderr}
                  </div>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#fff7ed] p-2 font-mono text-[11px] leading-4 text-[#9a3412]">
                    {formatCommandOutputSnippet(commandResult.stderr)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      );
    }

    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#202123]">
            <GitPullRequest className="h-4 w-4 text-[#565869]" />
            {t("thread.tabs.plan")}
          </h2>
          <div className="space-y-4">
            {timelineEvents.map((event, index) => {
              const isLast = index === timelineEvents.length - 1;
              const isActive = index === timelineEvents.length - 1 && selectedThread?.status === "running";
              const Icon = isActive ? Activity : CheckCircle2;

              return (
                <div key={event.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                  <div className="flex flex-col items-center">
                    <Icon className={`h-5 w-5 ${isActive ? "text-[#202123]" : "text-[#10a37f]"}`} />
                    {!isLast ? <span className="mt-2 h-full w-px bg-[#ececf1]" /> : null}
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-[#8e8ea0]">{event.kind}</div>
                    <p className="mt-1 text-sm leading-6 text-[#202123]">{event.message}</p>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <div className="flex justify-center">
                <Circle className="h-5 w-5 text-[#8e8ea0]" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[#8e8ea0]">waiting</div>
                <p className="mt-1 text-sm leading-6 text-[#6e6e80]">{t("threads.command")}</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#202123]">
                <Play className="h-4 w-4 text-[#565869]" />
                {actionQueueCopy.title}
              </h2>
              {runnablePendingActions.length > 0 && selectedThread && onRunAgentActions ? (
                <button
                  type="button"
                  aria-label="Continue safe agent actions"
                  onClick={() => onRunAgentActions(selectedThread.id, runnablePendingActions)}
                  className="h-7 shrink-0 rounded-[10px] bg-[#202123] px-2 text-[11px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                >
                  {actionQueueCopy.continueSafe}
                </button>
              ) : nextRunnableAction && selectedThread && onRunAgentAction ? (
                <button
                  type="button"
                  aria-label="Run next agent action"
                  onClick={() => onRunAgentAction(selectedThread.id, nextRunnableAction)}
                  className="h-7 shrink-0 rounded-[10px] bg-[#202123] px-2 text-[11px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                >
                  {actionQueueCopy.runNext}
                </button>
              ) : null}
            </div>
            {queueStats.total > 0 ? (
              <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[14px] border border-[#ececf1] bg-white px-3 py-2">
                <p className="truncate text-sm font-medium leading-5 text-[#202123]">
                  {actionQueueCopy.progress(queueStats.completed, queueStats.total)}
                </p>
                {queueStats.failed > 0 ? (
                  <span className="rounded-full border border-[#f4c7ab] bg-[#fff7ed] px-2 py-0.5 text-[11px] text-[#b45309]">
                    {actionQueueCopy.failedCount(queueStats.failed)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {queueBlockerAction?.status === "failed" ? (
              <div className="mb-3 rounded-[14px] border border-[#f4c7ab] bg-[#fff7ed] px-3 py-2">
                <p className="text-sm font-medium leading-5 text-[#9a3412]">
                  {actionQueueCopy.queueStoppedAt(queueBlockerAction.label)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("logs")}
                    className="h-7 rounded-[10px] border border-[#f4c7ab] bg-white px-2 text-[11px] font-medium text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
                  >
                    {recoveryActionCopy.viewLogs}
                  </button>
                  {selectedThread && onRunAgentAction ? (
                    <button
                      type="button"
                      onClick={() => onRunAgentAction(selectedThread.id, queueBlockerAction)}
                      className="h-7 rounded-[10px] border border-[#f4c7ab] bg-white px-2 text-[11px] font-medium text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
                    >
                      {recoveryActionCopy.retryFailed}
                    </button>
                  ) : null}
                  {selectedThread && onGenerateFailureFix ? (
                    <button
                      type="button"
                      onClick={() => onGenerateFailureFix(selectedThread.id, queueBlockerAction)}
                      className="h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
                    >
                      {recoveryActionCopy.generateFixPlan}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {runnablePendingActions.length > 0 ? (
              <div className="mb-3 rounded-[14px] border border-[#d9d9e3] bg-[#f7f7f8] px-3 py-2">
                <p className="text-sm font-medium leading-5 text-[#202123]">
                  {actionQueueCopy.safeReady(runnablePendingActions.length)}
                </p>
                {nextGateAction ? (
                  <p className="mt-0.5 text-[11px] leading-4 text-[#6e6e80]">
                    {actionQueueCopy.stopsBefore(nextGateAction.label)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {runnablePendingActions.length === 0 && activeGateAction ? (
              <div className="mb-3 rounded-[14px] border border-[#f4c7ab] bg-[#fff7ed] px-3 py-2">
                <p className="text-sm font-medium leading-5 text-[#9a3412]">
                  {actionQueueCopy.manualGate}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-[#b45309]">
                  {actionQueueCopy.manualGateBody(activeGateAction.label)}
                </p>
              </div>
            ) : null}
            {agentActions.length > 0 ? (
              <div className="space-y-2">
                {agentActions.map((action) => (
                  <article
                    key={action.id}
                    className={`rounded-[14px] border px-3 py-2 transition ${
                      selectedAgentAction?.id === action.id
                        ? "border-[#202123] bg-white shadow-sm"
                        : action.kind === "manual" || action.kind === "commit"
                          ? "border-[#f4c7ab] bg-[#fffaf5]"
                          : "border-[#ececf1] bg-[#fafafa]"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={actionDetailsCopy.selectAction(action.label)}
                      onClick={() => setSelectedAgentActionId(action.id)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-medium leading-5 text-[#202123]">
                          {action.label}
                        </p>
                        <span
                          className={`shrink-0 rounded-full border bg-white px-2 py-0.5 text-[11px] ${
                            action.kind === "manual" || action.kind === "commit"
                              ? "border-[#f4c7ab] text-[#b45309]"
                              : "border-[#d9d9e3] text-[#6e6e80]"
                          }`}
                        >
                          {getActionStatusLabel(action)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#8e8ea0]">
                        {action.kind}
                      </p>
                    </button>
                    {renderAgentActionControl(action)}
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-[#6e6e80]">{actionQueueCopy.empty}</p>
            )}
          </section>
          {selectedAgentAction ? renderAgentActionDetails(selectedAgentAction, selectedCommandResult) : null}
          <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#202123]">{t("thread.agentOutput")}</h2>
            <p className="text-sm leading-6 text-[#6e6e80]">
              {selectedThread?.events.at(-1)?.message ?? t("threads.emptyBody")}
            </p>
          </section>
          <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#202123]">{t("thread.testResults")}</h2>
            <div className="flex items-center gap-2 rounded-[14px] bg-[#effaf6] px-3 py-2 text-sm text-[#087443]">
              <CheckCircle2 className="h-4 w-4" />
              npm test ready
            </div>
          </section>
        </aside>
      </div>
    );
  }

  function renderChangesTab(): ReactElement {
    return (
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202123]">
            <FileText className="h-4 w-4 text-[#565869]" />
            {t("threads.projectFiles")}
          </h2>
          {selectedFilePaths.length > 0 && onGenerateSelectedFileChanges ? (
            <button
              type="button"
              onClick={() => onGenerateSelectedFileChanges(selectedFilePaths)}
              className="mb-3 w-full rounded-[14px] bg-[#202123] px-2 py-2 text-xs font-semibold text-white transition hover:bg-black active:scale-[0.99]"
            >
              {t("threads.generateSelectedAiChanges")}
            </button>
          ) : null}
          <div className="max-h-64 space-y-1 overflow-auto pr-1">
            {projectScan?.files.slice(0, 32).map((file) => (
              <div key={file.relativePath} className="flex items-center gap-2 rounded-[12px] hover:bg-[#f7f7f8]">
                {onGenerateSelectedFileChanges ? (
                  <input
                    type="checkbox"
                    checked={selectedFilePaths.includes(file.relativePath)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSelectedFilePaths((current) =>
                        checked
                          ? [...current, file.relativePath]
                          : current.filter((relativePath) => relativePath !== file.relativePath)
                      );
                    }}
                    aria-label={`Select ${file.relativePath} for AI edit`}
                    className="ml-2 h-3.5 w-3.5 accent-[#202123]"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onPreviewFile(file.relativePath)}
                  className="block min-w-0 flex-1 truncate rounded-[12px] px-2 py-1.5 text-left text-xs text-[#202123]"
                >
                  {file.relativePath}
                </button>
              </div>
            )) ?? <p className="text-sm text-[#6e6e80]">{t("threads.emptyBody")}</p>}
          </div>
          {allChangePreviews.length > 0 ? (
            <div className="mt-4 border-t border-[#ececf1] pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-[#8e8ea0]">
                {t("threads.pendingChanges")}
              </h3>
              <div className="mb-2 flex flex-wrap gap-2">
                {onApplyAllChanges ? (
                  <button
                    type="button"
                    onClick={onApplyAllChanges}
                    className="rounded-[12px] bg-[#202123] px-2 py-1 text-xs font-semibold text-white hover:bg-black"
                  >
                    {t("threads.applyAllChanges")}
                  </button>
                ) : null}
                {onDiscardAllChanges ? (
                  <button
                    type="button"
                    onClick={onDiscardAllChanges}
                    className="rounded-[12px] border border-[#d9d9e3] px-2 py-1 text-xs text-[#202123] hover:bg-[#f7f7f8]"
                  >
                    {t("threads.discardAllChanges")}
                  </button>
                ) : null}
              </div>
              <div className="space-y-1">
                {allChangePreviews.map((preview) => (
                  <button
                    key={preview.relativePath}
                    type="button"
                    aria-label={`Pending change ${preview.relativePath}`}
                    onClick={() => onPreviewFile(preview.relativePath)}
                    className={`block w-full truncate rounded-[12px] px-2 py-1.5 text-left text-xs ${
                      previewFile?.relativePath === preview.relativePath
                        ? "bg-[#ececf1] text-[#202123]"
                        : "text-[#202123] hover:bg-[#f7f7f8]"
                    }`}
                  >
                    {preview.relativePath}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[14px] border border-dashed border-[#d9d9e3] px-3 py-4 text-sm text-[#6e6e80]">
              {t("thread.noChanges")}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-[18px] border border-[#ececf1] bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202123]">
            <Code2 className="h-4 w-4 text-[#565869]" />
            {t("threads.filePreview")}
          </h2>
          {previewFile ? (
            <div className="grid gap-3">
              {canEditPreview ? (
                <>
                  <label className="grid gap-2 text-sm text-[#202123]">
                    <span>{t("threads.editContent")}</span>
                    <textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.currentTarget.value)}
                      className="min-h-48 resize-y rounded-[16px] border border-[#d9d9e3] bg-[#f7f7f8] p-3 font-mono text-xs leading-5 text-[#202123] outline-none transition focus:border-[#202123]"
                      spellCheck={false}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onPreviewChange?.(previewFile.relativePath, draftContent)}
                      className="h-9 rounded-[13px] border border-[#d9d9e3] bg-white px-3 text-sm font-medium text-[#202123] hover:bg-[#f7f7f8]"
                    >
                      {t("threads.generateDiff")}
                    </button>
                    {onGenerateFileChange ? (
                      <button
                        type="button"
                        onClick={() => onGenerateFileChange(previewFile.relativePath, draftContent)}
                        className="h-9 rounded-[13px] border border-[#d9d9e3] bg-white px-3 text-sm font-medium text-[#202123] hover:bg-[#f7f7f8]"
                      >
                        {t("threads.generateAiChange")}
                      </button>
                    ) : null}
                    {visibleChangePreview && onDiscardChange ? (
                      <button
                        type="button"
                        onClick={() => onDiscardChange(visibleChangePreview.relativePath)}
                        className="h-9 rounded-[13px] border border-[#f4c7ab] bg-[#fff7ed] px-3 text-sm font-medium text-[#b45309] hover:bg-[#ffedd5]"
                      >
                        {t("threads.discardChange")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onApplyChange?.(previewFile.relativePath, draftContent)}
                      className="h-9 rounded-[13px] bg-[#202123] px-3 text-sm font-semibold text-white hover:bg-black"
                    >
                      {t("threads.applyChange")}
                    </button>
                  </div>
                </>
              ) : (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-3 text-xs leading-5 text-[#202123]">
                  {previewFile.content}
                </pre>
              )}
              {visibleChangePreview ? (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-3 font-mono text-xs leading-5 text-[#6e6e80]">
                  {visibleChangePreview.diff.map((line, index) => {
                    const prefix =
                      line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  ";

                    return (
                      <div
                        key={`${line.kind}-${index}`}
                        className={
                          line.kind === "add"
                            ? "text-[#37d67a]"
                            : line.kind === "remove"
                              ? "text-[#ff8d7a]"
                              : "text-[#6e6e80]"
                        }
                      >
                        {prefix}
                        {line.text}
                      </div>
                    );
                  })}
                </pre>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#d9d9e3] px-4 py-10 text-center text-sm text-[#6e6e80]">
              {t("threads.filePreview")}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderCommandsTab(): ReactElement {
    const commandHistoryCopy =
      language === "zh-CN"
        ? {
            title: "命令历史",
            empty: "暂无命令输出",
            exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`,
            timedOut: "已超时",
            stdout: "stdout",
            stderr: "stderr",
            generateFixPlan: "生成修复计划"
          }
        : {
            title: "Command history",
            empty: "No command output yet",
            exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`,
            timedOut: "Timed out",
            stdout: "stdout",
            stderr: "stderr",
            generateFixPlan: "Generate fix plan"
          };
    const commandHistory =
      selectedThread?.events
        .filter((event) => event.commandResult)
        .map((event) => ({
          id: event.id,
          createdAt: event.createdAt,
          result: event.commandResult as CommandRunResult
        }))
        .reverse() ?? [];

    return (
      <div className="space-y-4">
        <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
          <label className="grid gap-3 text-sm text-[#202123]">
            <span className="flex items-center gap-2 font-semibold text-[#202123]">
              <Terminal className="h-4 w-4 text-[#565869]" />
              {t("threads.command")}
            </span>
            <div className="flex gap-2">
              <input
                value={command}
                onChange={(event) => setCommand(event.currentTarget.value)}
                className="h-10 flex-1 rounded-[14px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
                placeholder="npm test"
              />
              <button
                type="button"
                onClick={submitCommand}
                className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-[#202123] px-4 text-sm font-semibold text-white hover:bg-black active:scale-[0.99]"
              >
                <Play className="h-4 w-4 fill-current" />
                {t("threads.runCommand")}
              </button>
            </div>
          </label>
        </section>
        <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202123]">
            <Terminal className="h-4 w-4 text-[#565869]" />
            {commandHistoryCopy.title}
          </h2>
          {commandHistory.length > 0 ? (
            <div className="space-y-3">
              {commandHistory.map(({ id, createdAt, result }) => (
                <article
                  key={id}
                  className="rounded-[16px] border border-[#ececf1] bg-[#fafafa] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-mono text-sm font-semibold text-[#202123]">
                        {result.command}
                      </p>
                      <p className="mt-1 text-[11px] text-[#8e8ea0]">{createdAt}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          result.exitCode === 0 && !result.timedOut
                            ? "border-[#c3eadc] bg-[#effaf6] text-[#087443]"
                            : "border-[#f4c7ab] bg-[#fff7ed] text-[#9a3412]"
                        }`}
                      >
                        {commandHistoryCopy.exit(result.exitCode)}
                      </span>
                      {result.timedOut ? (
                        <span className="rounded-full border border-[#f4c7ab] bg-[#fff7ed] px-2 py-0.5 text-[11px] text-[#9a3412]">
                          {commandHistoryCopy.timedOut}
                        </span>
                      ) : null}
                      {selectedThread &&
                      onGenerateCommandFix &&
                      (result.timedOut || result.exitCode !== 0) ? (
                        <button
                          type="button"
                          onClick={() => onGenerateCommandFix(selectedThread.id, result)}
                          className="h-6 rounded-[9px] bg-[#202123] px-2 text-[11px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                        >
                          {commandHistoryCopy.generateFixPlan}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {result.stdout.trim() ? (
                    <div className="mt-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
                        {commandHistoryCopy.stdout}
                      </div>
                      <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#111827] p-3 font-mono text-[11px] leading-4 text-[#f8fafc]">
                        {formatCommandOutputSnippet(result.stdout)}
                      </pre>
                    </div>
                  ) : null}
                  {result.stderr.trim() ? (
                    <div className="mt-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
                        {commandHistoryCopy.stderr}
                      </div>
                      <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#fff7ed] p-3 font-mono text-[11px] leading-4 text-[#9a3412]">
                        {formatCommandOutputSnippet(result.stderr)}
                      </pre>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#d9d9e3] px-4 py-8 text-center text-sm text-[#6e6e80]">
              {commandHistoryCopy.empty}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderLogsTab(): ReactElement {
    return (
      <div className="space-y-2">
        {selectedThread?.events.map((event) => (
          <article
            key={event.id}
            className="rounded-[16px] border border-[#ececf1] bg-white p-3"
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8e8ea0]">
              {event.kind}
            </div>
            <p className="text-sm leading-6 text-[#202123]">{event.message}</p>
          </article>
        ))}
        {selectedThread?.events.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[#d9d9e3] px-4 py-8 text-center text-sm text-[#6e6e80]">
            {t("thread.noLogs")}
          </div>
        ) : null}
      </div>
    );
  }
}

function getNextGateAction(
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

function getQueueStats(actions: AgentAction[]): {
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

function getQueueBlockerAction(actions: AgentAction[]): AgentAction | null {
  for (const action of actions) {
    if (action.status === "completed" || action.status === "skipped") {
      continue;
    }

    if (action.status === "failed" || action.status === "running") {
      return action;
    }

    if (action.status === "pending" && !isRunnableAgentAction(action)) {
      return action;
    }

    return null;
  }

  return null;
}

function findLatestCommandResult(
  events: TaskThreadEvent[],
  command: string
): CommandRunResult | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const result = events[index]?.commandResult;

    if (result?.command === command) {
      return result;
    }
  }

  return null;
}

function formatCommandOutputSnippet(value: string): string {
  const trimmed = value.trim();
  const maxLength = 900;

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}\n... output truncated`;
}
