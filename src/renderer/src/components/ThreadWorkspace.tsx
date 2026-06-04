// 本文件说明: 渲染单个任务线程的回答, 操作队列, 命令输出和反馈控件
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  ChevronDown,
  Circle,
  Code2,
  Copy,
  ExternalLink,
  FilePenLine,
  FileSearch,
  FileText,
  Globe,
  Layers,
  ListChecks,
  Play,
  RotateCcw,
  Search,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import type { Language } from "@shared/modelTypes";
import type { AgentAction } from "@shared/agentExecutionPlan";
import type { AgentMemoryContext } from "@shared/agentTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import {
  annotateLineDiffHunks,
  createTextFromLineDiffHunkDecision,
  type LineDiffHunkDecision
} from "@shared/textDiff";
import {
  isRunnableAgentAction,
  resolveAgentCommandRisk,
  type AgentCommandSafetyPolicy
} from "@/agent/agentActionExecutor";
import {
  getBlockingFileChangePreviews,
  getAgentConfirmationItems,
  getAgentQueueControlState,
  getQueueStats,
  type AgentConfirmationItem
} from "@/agent/agentConfirmationQueue";
import {
  formatCommandOutputSnippet,
  formatCommandResultForClipboard
} from "@/agent/agentActionDetails";
import { getAutoFailureRecoverySkipEventPrefix } from "@/agent/autoFailureRecovery";
import { getFailureRecoveryAttemptsForAction } from "@/agent/failureRecoveryAttempts";
import { getProcessedRecoverySummary } from "@/agent/processedRecoverySummary";
import { extractSourceUrlsFromText } from "@/agent/agentSources";
import { getThreadActivitySummary as getThreadActivitySummaryFromEvents } from "@/agent/threadActivitySummary";
import { formatAgentCommandRiskReason } from "@/i18n/agentMessages";
import { useI18n } from "@/i18n/useI18n";
import type { CommandSafetyRule } from "@/state/generalPreferences";
import type {
  CommandRunResult,
  TaskThread,
  TaskThreadEvent
} from "@/state/taskThreads";
import {
  AgentConfirmationQueue,
  CompactAgentAttentionStrip,
  canSkipAgentAction
} from "./AgentConfirmationQueue";
import { AgentActionDetailsPanel } from "./AgentActionDetailsPanel";
import { MarkdownPreview } from "./MarkdownPreview";
import { ProjectFileIcon } from "./ProjectFileIcon";
import { Tooltip } from "./Tooltip";

type ThreadWorkspaceProps = {
  compact?: boolean;
  language: Language;
  hasProject?: boolean;
  selectedThreadId: string | null;
  threads: TaskThread[];
  commandSafetyRules?: CommandSafetyRule[];
  fullAccess?: boolean;
  agentPaused?: boolean;
  showActivityHeartbeat?: boolean;
  showProcessedSummary?: boolean;
  defaultExpandProcessedSummary?: boolean;
  projectScan?: ProjectScanResult | null;
  previewFile?: ProjectTextFile | null;
  changePreview?: ProjectFileChangePreview | null;
  changePreviews?: ProjectFileChangePreview[];
  onSelectThread: (threadId: string) => void;
  onPickProject?: () => void;
  onOpenRecentProject?: () => void;
  onRunAgentAction?: (threadId: string, action: AgentAction) => void;
  onRunAgentActions?: (threadId: string, actions: AgentAction[]) => void;
  onApproveAgentCommand?: (threadId: string, action: AgentAction) => void;
  onAllowAgentCommand?: (threadId: string, action: AgentAction) => void;
  onConfirmAgentExtension?: (threadId: string, action: AgentAction) => void;
  onGenerateCommandFix?: (threadId: string, result: CommandRunResult) => void;
  onGenerateContinuationPlan?: (threadId: string) => void;
  onCompleteAgentAction?: (threadId: string, action: AgentAction) => void;
  onSkipAgentAction?: (threadId: string, action: AgentAction) => void;
  onResumeAgent?: (threadId: string) => void;
  onOpenSourceControl?: () => void;
  onOpenFiles?: () => void;
  onRunCommand?: (threadId: string, command: string) => void;
  onCancelCommand?: (threadId: string, runId: string) => void;
  onPreviewFile?: (relativePath: string) => void;
  onPreviewChange?: (relativePath: string, nextContent: string) => void;
  onApplyChange?: (relativePath: string, nextContent: string) => void;
  onDiscardChange?: (relativePath: string) => void;
  onApplyAllChanges?: () => void;
  onDiscardAllChanges?: () => void;
  onGenerateFileChange?: (relativePath: string, currentContent: string) => void;
  onGenerateSelectedFileChanges?: (relativePaths: string[]) => void;
  onDeleteFile?: (relativePath: string) => void;
};

type WorkspaceTab = "plan" | "changes" | "commands" | "logs";

type CommandHistoryEntry = {
  id: string;
  createdAt: string;
  status: "finished" | "running";
  result: CommandRunResult;
};

type ThreadActivitySummary = {
  kind: "running" | "failure";
  activityKind: CompactProcessedGroupKind;
  label: string;
  command: string;
  meta: string | null;
};

type CompactProcessedSummary = {
  hiddenEvents: TaskThreadEvent[];
  groups: CompactProcessedGroup[];
  sourceUrls: string[];
  livePreview?: string;
  recoverySummary?: string;
};

type CompactProcessedGroupKind =
  | "web"
  | "command"
  | "edit"
  | "search"
  | "file"
  | "error"
  | "plan"
  | "other";

type CompactProcessedItem = {
  id: string;
  kind: CompactProcessedGroupKind;
  label: string;
  detail: string;
  createdAt: string;
  urls: string[];
  dedupeKey?: string;
};

type CompactProcessedGroup = {
  kind: CompactProcessedGroupKind;
  label: string;
  summaryLabel: string;
  items: CompactProcessedItem[];
};

// 紧凑主屏只保留人能直接阅读的消息, 详细执行流水留在 Agent 详情视图里
function shouldShowCompactTranscriptEvent(event: TaskThreadEvent): boolean {
  if (event.agentActionRun || event.commandRun?.actionId || event.commandResult?.actionId) {
    return false;
  }

  return event.kind === "user" || event.kind === "result";
}

// 把线程状态拆成简洁对话视图, 复杂执行细节只在需要的标签里展示
export function ThreadWorkspace({
  compact = false,
  language,
  hasProject = true,
  selectedThreadId,
  threads,
  commandSafetyRules = [],
  fullAccess = false,
  agentPaused = false,
  showActivityHeartbeat = true,
  showProcessedSummary = true,
  defaultExpandProcessedSummary = false,
  projectScan = null,
  previewFile = null,
  changePreview = null,
  changePreviews,
  onSelectThread,
  onPickProject,
  onOpenRecentProject,
  onRunAgentAction,
  onRunAgentActions,
  onApproveAgentCommand,
  onAllowAgentCommand,
  onConfirmAgentExtension,
  onGenerateCommandFix,
  onGenerateContinuationPlan,
  onCompleteAgentAction,
  onSkipAgentAction,
  onResumeAgent,
  onOpenSourceControl,
  onOpenFiles,
  onRunCommand = () => undefined,
  onCancelCommand,
  onPreviewFile = () => undefined,
  onPreviewChange,
  onApplyChange,
  onDiscardChange,
  onApplyAllChanges,
  onDiscardAllChanges,
  onGenerateFileChange,
  onGenerateSelectedFileChanges,
  onDeleteFile
}: ThreadWorkspaceProps): ReactElement {
  const { t } = useI18n(language);
  const [command, setCommand] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("plan");
  const [selectedAgentActionId, setSelectedAgentActionId] = useState<string | null>(null);
  const [compactProcessedExpanded, setCompactProcessedExpanded] = useState(
    defaultExpandProcessedSummary
  );
  const [compactProcessedGroupExpanded, setCompactProcessedGroupExpanded] = useState<
    Record<string, boolean>
  >({});
  const commandSafetyPolicy = useMemo<AgentCommandSafetyPolicy>(
    () => ({ fullAccess, rules: commandSafetyRules }),
    [commandSafetyRules, fullAccess]
  );
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const selectedThreadIsLive =
    selectedThread?.status === "running" || selectedThread?.status === "planned";
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const allChangePreviews = changePreviews ?? (changePreview ? [changePreview] : []);
  const blockingChangePreviews = getBlockingFileChangePreviews(allChangePreviews, { fullAccess });
  const visibleChangePreview = previewFile
    ? (allChangePreviews.find((preview) => preview.relativePath === previewFile.relativePath) ??
      null)
    : null;
  const canEditPreview = Boolean(onPreviewChange || onApplyChange || onGenerateFileChange);
  const diffHunkCopy = getDiffHunkCopy(language);
  const threadActivitySummary = useMemo(
    () =>
      selectedThread
        ? getThreadActivitySummaryFromEvents(selectedThread.events, language, liveNow)
        : null,
    [language, liveNow, selectedThread]
  );
  const activeCommandEntry = useMemo(
    () => (selectedThread ? findLatestRunningCommandHistoryEntry(selectedThread.events) : null),
    [selectedThread]
  );
  const visibleCompactEvents = useMemo(
    () => selectedThread?.events.filter(shouldShowCompactTranscriptEvent) ?? [],
    [selectedThread]
  );
  const hasCompactSourceEvents = (selectedThread?.events.length ?? 0) > 0;
  const compactProcessedSummary = useMemo(
    () =>
      showProcessedSummary && selectedThread
        ? getCompactProcessedSummary(selectedThread, visibleCompactEvents, language)
        : null,
    [language, selectedThread, showProcessedSummary, visibleCompactEvents.length]
  );
  const duration = useMemo(() => {
    if (!selectedThread) {
      return "0m";
    }

    const started = Date.parse(selectedThread.createdAt);

    if (Number.isNaN(started)) {
      return "0m";
    }

    const minutes = Math.max(0, Math.round((liveNow - started) / 60000));
    return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }, [liveNow, selectedThread]);

  useEffect(() => {
    setDraftContent(visibleChangePreview?.nextContent ?? previewFile?.content ?? "");
  }, [previewFile, visibleChangePreview?.relativePath, visibleChangePreview?.nextContent]);

  useEffect(() => {
    if (!projectScan) {
      setSelectedFilePaths([]);
    }
  }, [projectScan]);

  useEffect(() => {
    setCompactProcessedExpanded(defaultExpandProcessedSummary);
    setCompactProcessedGroupExpanded({});
  }, [defaultExpandProcessedSummary, selectedThread?.id]);

  useEffect(() => {
    if (!selectedThreadIsLive) {
      return undefined;
    }

    setLiveNow(Date.now());
    const timer = window.setInterval(() => setLiveNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [selectedThread?.id, selectedThreadIsLive]);

  // 从命令输入区创建运行请求, 交给主流程负责真实执行
  function submitCommand(): void {
    const normalizedCommand = command.trim();

    if (!selectedThread || !normalizedCommand) {
      return;
    }

    onRunCommand(selectedThread.id, normalizedCommand);
    setCommand("");
  }

  function getCompactConfirmationItems(thread: TaskThread): AgentConfirmationItem[] {
    const actions = thread.agentActions ?? [];
    const hasPendingFileChanges = blockingChangePreviews.length > 0;
    const { activeGateAction, queueBlockerAction } = getAgentQueueControlState({
      actions,
      commandSafetyPolicy,
      agentPaused: Boolean(agentPaused),
      hasPendingFileChanges
    });

    return getAgentConfirmationItems({
      actions,
      changePreviews: blockingChangePreviews,
      commandSafetyPolicy,
      fullAccess,
      activeGateAction,
      projectPath: thread.projectPath ?? projectScan?.rootPath ?? null,
      queueBlockerAction,
      failureRecoveryPolicy: thread.agentProfile?.failureRecoveryPolicy,
      maxFailureRecoveryAttempts: thread.agentProfile?.maxFailureRecoveryAttempts,
      events: thread.events
    });
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

  if (compact) {
    const confirmationItems = selectedThread ? getCompactConfirmationItems(selectedThread) : [];

    return (
      <section className="h-full min-h-0 overflow-auto px-5 py-7">
        <div className="mx-auto flex min-h-full max-w-[920px] flex-col gap-7">
          <article className="ml-auto max-w-[68%] rounded-[16px] bg-[#f3f3f3] px-3 py-1.5 text-sm leading-5 text-[#202123]">
            <p className="whitespace-pre-wrap">{selectedThread.prompt}</p>
          </article>

          {renderCompactMemoryContext(selectedThread.contextMemories ?? [])}

          {compactProcessedSummary ? renderCompactProcessedSummary(compactProcessedSummary) : null}

          <CompactAgentAttentionStrip
            items={confirmationItems}
            language={language}
            threadId={selectedThread.id}
            onApproveAgentCommand={onApproveAgentCommand}
            onConfirmAgentExtension={onConfirmAgentExtension}
            onCompleteAgentAction={onCompleteAgentAction}
            onOpenFiles={onOpenFiles}
            onOpenSourceControl={onOpenSourceControl}
            onPreviewFile={onPreviewFile}
            onSkipAgentAction={onSkipAgentAction}
          />

          {showActivityHeartbeat && threadActivitySummary
            ? renderCompactActivityHeartbeat(threadActivitySummary)
            : null}

          <section
            role="region"
            aria-label="Conversation transcript"
            className="grid gap-5"
          >
            {visibleCompactEvents.length > 0 ? (
              visibleCompactEvents.map((event) => renderCompactEvent(event))
            ) : !hasCompactSourceEvents ? (
              <div className="text-sm text-[#8e8ea0]">
                {language === "zh-CN" ? "等待 Forge 开始执行" : "Waiting for Forge to start"}
              </div>
            ) : null}
          </section>
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
          {threads.map((thread) => {
            const threadListActivity = getThreadActivitySummaryFromEvents(
              thread.events,
              language,
              liveNow
            );

            return (
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
                <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[#8e8ea0]">
                  {threadListActivity ? (
                    <>
                      <span
                        className={`shrink-0 font-medium ${
                          threadListActivity.kind === "running" ? "text-[#1d4ed8]" : "text-[#9a3412]"
                        }`}
                      >
                        {threadListActivity.label}
                      </span>
                      <span className="min-w-0 truncate font-mono text-[11px]">
                        {threadListActivity.command}
                      </span>
                      {threadListActivity.meta ? (
                        <span className="shrink-0">{threadListActivity.meta}</span>
                      ) : null}
                    </>
                  ) : (
                    thread.status
                  )}
                </span>
              </button>
            );
          })}
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
                {threadActivitySummary ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab("commands")}
                    className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left transition hover:shadow-sm active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202123] ${
                      threadActivitySummary.kind === "running"
                        ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                        : "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]"
                    }`}
                  >
                    <Terminal className="h-3.5 w-3.5 shrink-0" />
                    <span className="shrink-0 font-medium">{threadActivitySummary.label}</span>
                    <span className="max-w-[220px] truncate font-mono text-[11px]">
                      {threadActivitySummary.command}
                    </span>
                    {threadActivitySummary.meta ? (
                      <span className="shrink-0 opacity-80">{threadActivitySummary.meta}</span>
                    ) : null}
                  </button>
                ) : null}
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
          {activeCommandEntry ? renderActiveCommandPanel(activeCommandEntry) : null}
          <div className={activeCommandEntry ? "mt-4" : ""}>
            {activeTab === "plan" ? renderPlanTab() : null}
            {activeTab === "changes" ? renderChangesTab() : null}
            {activeTab === "commands" ? renderCommandsTab() : null}
            {activeTab === "logs" ? renderLogsTab() : null}
          </div>
        </div>
      </div>
    </section>
  );

  // 只展示本次注入的记忆摘要, 避免把来源信息做成新负担
  function renderCompactMemoryContext(memories: AgentMemoryContext[]): ReactElement | null {
    if (memories.length === 0) {
      return null;
    }

    const copy =
      language === "zh-CN"
        ? {
            aria: "Agent 记忆上下文",
            used: (count: number) => `已使用 ${count} 条记忆`,
            global: "全局",
            project: "项目"
          }
        : {
            aria: "Agent memory context",
            used: (count: number) => `${count} ${count === 1 ? "memory" : "memories"} used`,
            global: "Global",
            project: "Project"
          };

    return (
      <section
        role="group"
        aria-label={copy.aria}
        className="mx-auto w-full max-w-[680px] rounded-[14px] border border-[#ececf1] bg-[#fafafa] px-3 py-2 text-[12px] text-[#565869]"
      >
        <div className="flex items-center gap-2 font-medium text-[#202123]">
          <Brain className="h-3.5 w-3.5 text-[#8e8ea0]" />
          <span>{copy.used(memories.length)}</span>
        </div>
        <ul className="mt-1.5 grid gap-1">
          {memories.slice(0, 4).map((memory) => (
            <li key={memory.id} className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-[#8e8ea0]">
                {memory.scope === "global" ? copy.global : copy.project}
              </span>
              <span className="min-w-0 truncate">{memory.content}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // 把线程事件压成对话区可读条目, 事件源头不再生成旧模板流水账
  function renderCompactEvent(event: TaskThreadEvent): ReactElement {
    if (event.kind === "user") {
      return (
        <article
          key={event.id}
          className="ml-auto max-w-[68%] rounded-[16px] bg-[#f3f3f3] px-3 py-1.5 text-[14px] leading-6 text-[#202123]"
        >
          <p className="whitespace-pre-wrap">{event.message}</p>
        </article>
      );
    }

    const result = event.commandResult;
    const runningCommand = event.commandRun;
    const approvedCommand = event.commandApproval;
    const failed = Boolean(result && !result.cancelled && (result.timedOut || result.exitCode !== 0));
    const passed = Boolean(result && result.exitCode === 0 && !result.timedOut);
    const label = getCompactEventLabel(event, language);

    return (
      <article key={event.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
        <span
          className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            failed
              ? "bg-[#fff7ed] text-[#b45309]"
              : passed || approvedCommand || event.kind === "result"
                ? "bg-[#effaf6] text-[#087443]"
                : "bg-[#f7f7f8] text-[#565869]"
          }`}
        >
          {failed ? (
            <Circle className="h-3.5 w-3.5" />
          ) : passed || approvedCommand || event.kind === "result" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : runningCommand ? (
            <Activity className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-1.5 text-[12px] leading-5 text-[#8e8ea0]">
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[#f7f7f8] px-2 font-medium text-[#565869]">
              {label}
            </span>
            <span className="inline-flex h-6 min-w-0 items-center truncate rounded-full bg-[#f7f7f8] px-2">
              {formatEventTimestamp(event.completedAt ?? event.createdAt)}
            </span>
            {event.kind === "result" ? (
              <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[#f7f7f8] px-2 font-medium">
                {formatLlmWorkDuration(event)}
              </span>
            ) : null}
          </div>
          <div className="mt-2 text-[14px] leading-6 text-[#202123]">
            {event.kind === "result" && !runningCommand && !result ? (
              <>
                <MarkdownPreview compact content={stripAssistantSourceBlock(event.message)} />
                {renderAssistantSourceLinks(event.message)}
              </>
            ) : (
              <p className="whitespace-pre-wrap">{event.message}</p>
            )}
          </div>
          {event.kind === "result" && !runningCommand && !result ? renderAssistantResponseActions(event) : null}

          {runningCommand ? (
            <pre className="mt-2 overflow-auto rounded-[12px] bg-[#111827] p-3 font-mono text-[11px] leading-4 text-[#f8fafc]">
              {runningCommand.command}
              {runningCommand.stdout ? `\n${formatCommandOutputSnippet(runningCommand.stdout)}` : ""}
              {runningCommand.stderr ? `\n${formatCommandOutputSnippet(runningCommand.stderr)}` : ""}
            </pre>
          ) : null}

          {result ? (
            <div className="mt-2 grid gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] leading-5 text-[#6e6e80]">
                <code className="inline-flex h-7 max-w-full items-center truncate rounded-[8px] bg-[#f7f7f8] px-2 font-mono text-[11px] text-[#202123]">
                  {result.command}
                </code>
                <span
                  className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-medium ${
                    failed ? "bg-[#fff7ed] text-[#b45309]" : "bg-[#effaf6] text-[#087443]"
                  }`}
                >
                  {result.timedOut
                    ? language === "zh-CN"
                      ? "已超时"
                      : "timed out"
                    : `exit ${result.exitCode}`}
                </span>
                {failed ? (
                  <>
                    {onGenerateCommandFix ? (
                      <button
                        type="button"
                        onClick={() => onGenerateCommandFix(selectedThread.id, result)}
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[9px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        {language === "zh-CN" ? "生成修复计划" : "Generate fix plan"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onRunCommand(selectedThread.id, result.command)}
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[9px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {language === "zh-CN" ? "重试" : "Retry"}
                    </button>
                  </>
                ) : null}
              </div>
              {result.stdout.trim() || result.stderr.trim() ? (
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#111827] p-3 font-mono text-[11px] leading-4 text-[#f8fafc]">
                  {formatCommandOutputSnippet([result.stdout, result.stderr].filter(Boolean).join("\n"))}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  // 为模型回答提供复制和反馈入口, 反馈先只保留交互位置
  function renderAssistantResponseActions(event: TaskThreadEvent): ReactElement {
    const actionCopy = getAssistantResponseActionCopy(language);
    const actions = [
      {
        key: "copy",
        label: actionCopy.copy,
        Icon: Copy,
        onClick: () => void navigator.clipboard?.writeText(event.message)
      },
      {
        key: "like",
        label: actionCopy.like,
        Icon: ThumbsUp,
        onClick: () => undefined
      },
      {
        key: "dislike",
        label: actionCopy.dislike,
        Icon: ThumbsDown,
        onClick: () => undefined
      }
    ];

    return (
      <div className="mt-2 flex items-center gap-1 text-[#8e8ea0]">
        {actions.map((action) => (
          <Tooltip key={action.key} label={action.label}>
            <button
              type="button"
              aria-label={action.label}
              onClick={action.onClick}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] outline-none transition hover:bg-[#f7f7f8] hover:text-[#202123] active:scale-[0.97] focus:outline-none focus-visible:outline-none"
            >
              <action.Icon className="h-4 w-4" />
            </button>
          </Tooltip>
        ))}
      </div>
    );
  }

  // 在主屏保留一条低噪声活动心跳, 避免隐藏细节后看起来没有响应
  function renderCompactActivityHeartbeat(summary: ThreadActivitySummary): ReactElement {
    const isRunning = summary.kind === "running";
    const Icon = getCompactProcessedGroupIcon(summary.activityKind);

    return (
      <section
        role="status"
        aria-live="polite"
        className={`mx-auto flex w-full max-w-[880px] items-center gap-2 rounded-[12px] border px-3 py-2 text-[12px] ${
          isRunning
            ? "border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]"
            : "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            isRunning ? "bg-white/70 text-[#2563eb]" : "bg-white/70 text-[#f97316]"
          }`}
        >
          <Icon className={`h-3.5 w-3.5 ${isRunning ? "animate-pulse" : ""}`} />
        </span>
        <span className="shrink-0 font-medium">{summary.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-5">
          {summary.command}
        </span>
        {summary.meta ? <span className="shrink-0 opacity-80">{summary.meta}</span> : null}
      </section>
    );
  }

  // 将内部执行流水折叠进一条已处理摘要, 正文只保留最终可读输出
  function renderCompactProcessedSummary(summary: CompactProcessedSummary): ReactElement {
    const sourceCopy = language === "zh-CN" ? "来源" : "Sources";

    return (
      <section className="mx-auto w-full max-w-[880px] border-b border-[#ececf1] pb-2">
        <button
          type="button"
          aria-label={language === "zh-CN" ? "查看已处理详情" : "View processed details"}
          aria-expanded={compactProcessedExpanded}
          onClick={() => setCompactProcessedExpanded((expanded) => !expanded)}
          className="flex min-h-7 w-full flex-wrap items-center gap-x-2 gap-y-1 text-left text-sm font-medium text-[#8e8ea0] transition hover:text-[#565869]"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {summary.recoverySummary ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-[#9a3412]">
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{summary.recoverySummary}</span>
              </span>
            ) : null}
            {summary.groups.length > 0
              ? summary.groups.slice(0, 4).map((group) => {
                  const Icon = getCompactProcessedGroupIcon(group.kind);

                  return (
                    <span
                      key={group.kind}
                      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{group.summaryLabel}</span>
                    </span>
                  );
                })
              : summary.recoverySummary ? null : (
                <span className="truncate text-[12px] font-normal">
                  {summary.livePreview ?? (language === "zh-CN" ? "处理详情" : "Processed details")}
                </span>
              )}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition ${
              compactProcessedExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
        {!compactProcessedExpanded && summary.livePreview ? (
          <p className="mt-1 max-w-full whitespace-pre-wrap break-words text-[12px] leading-5 text-[#8e8ea0]">
            {summary.livePreview}
          </p>
        ) : null}
        {compactProcessedExpanded ? (
          <div className="mt-2 grid gap-2 text-[12px] text-[#6e6e80]">
            {summary.groups.map((group) => renderCompactProcessedGroup(group))}
            {summary.sourceUrls.length > 0 ? (
              <div className="rounded-[12px] bg-[#f7f7f8] p-2">
                <div className="mb-1.5 flex items-center gap-1.5 font-medium text-[#565869]">
                  <Globe className="h-3.5 w-3.5" />
                  {sourceCopy}
                </div>
                <div className="grid gap-1">
                  {summary.sourceUrls.slice(0, 8).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 items-center gap-1 text-[#0b57d0] transition hover:text-[#063b91]"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{formatSourceUrlLabel(url)}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  function renderCompactProcessedGroup(group: CompactProcessedGroup): ReactElement {
    const Icon = getCompactProcessedGroupIcon(group.kind);
    const visibleItems = group.items.slice(-12);
    const groupExpanded = compactProcessedGroupExpanded[group.kind] ?? true;

    return (
      <details
        key={group.kind}
        className="group rounded-[12px] bg-[#f7f7f8] p-2"
        open={groupExpanded}
        onToggle={(event) => {
          const nextExpanded = event.currentTarget.open;

          setCompactProcessedGroupExpanded((current) =>
            current[group.kind] === nextExpanded
              ? current
              : {
                  ...current,
                  [group.kind]: nextExpanded
                }
          );
        }}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[#565869] [&::-webkit-details-marker]:hidden">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">{group.label}</span>
          <span className="shrink-0 text-[#8e8ea0]">{group.summaryLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
        </summary>
        <div className="mt-2 grid gap-1.5">
          {visibleItems.map((item) => (
            <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
              <span className="text-[#8e8ea0]">{formatEventTimestamp(item.createdAt)}</span>
              <div className="min-w-0">
                <div className="whitespace-pre-wrap break-words font-medium leading-5 text-[#565869]">
                  {item.label}
                </div>
                <p
                  className={`mt-0.5 whitespace-pre-wrap break-words leading-5 ${
                    item.kind === "command" ? "font-mono text-[11px]" : ""
                  }`}
                >
                  {item.detail}
                </p>
                {item.urls.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                    {item.urls.slice(0, 3).map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1 text-[#0b57d0] transition hover:text-[#063b91]"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{formatSourceUrlLabel(url)}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </details>
    );
  }

  function renderAssistantSourceLinks(message: string): ReactElement | null {
    const urls = extractSourceUrls(message);

    if (urls.length === 0) {
      return null;
    }

    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] leading-5">
        <span className="inline-flex h-6 items-center gap-1 text-[#8e8ea0]">
          <Globe className="h-3.5 w-3.5" />
          {language === "zh-CN" ? "参考资料" : "Sources"}
        </span>
        {urls.slice(0, 6).map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 max-w-full items-center gap-1 text-[#0b57d0] transition hover:text-[#063b91]"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatSourceUrlLabel(url)}</span>
          </a>
        ))}
      </div>
    );
  }

  // 展示正在运行的命令和可终止操作, 避免命令信息散落在正文
  function renderActiveCommandPanel(entry: CommandHistoryEntry): ReactElement {
    const copy =
      language === "zh-CN"
        ? {
            title: "活动命令",
            running: "运行中",
            stopCommand: "停止命令",
            openCommands: "打开命令页",
            waiting: "等待命令输出",
            stdout: "stdout",
            stderr: "stderr"
          }
        : {
            title: "Active run",
            running: "running",
            stopCommand: "Stop command",
            openCommands: "Open commands",
            waiting: "Waiting for command output",
            stdout: "stdout",
            stderr: "stderr"
          };
    const stdout = entry.result.stdout.trim();
    const stderr = entry.result.stderr.trim();

    return (
      <section className="rounded-[18px] border border-[#bfdbfe] bg-[#f8fbff] p-4 shadow-[0_12px_32px_rgba(29,78,216,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1d4ed8]">
                <Activity className="h-3.5 w-3.5" />
                {copy.title}
              </span>
              <span className="rounded-full border border-[#d9d9e3] bg-white px-2.5 py-1 text-[11px] text-[#565869]">
                {copy.running}
              </span>
            </div>
            <p className="break-words font-mono text-sm font-semibold leading-5 text-[#202123]">
              {entry.result.command}
            </p>
            <p className="mt-1 text-[11px] text-[#6e6e80]">{entry.createdAt}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("commands")}
              className="inline-flex h-8 items-center justify-center rounded-[11px] border border-[#d9d9e3] bg-white px-2.5 text-[11px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
            >
              {copy.openCommands}
            </button>
            {selectedThread && entry.result.runId && onCancelCommand ? (
              <button
                type="button"
                onClick={() => onCancelCommand(selectedThread.id, entry.result.runId!)}
                className="inline-flex h-8 items-center justify-center rounded-[11px] border border-[#f4c7ab] bg-[#fff7ed] px-2.5 text-[11px] font-semibold text-[#9a3412] transition hover:bg-[#ffedd5] active:scale-[0.99]"
              >
                {copy.stopCommand}
              </button>
            ) : null}
          </div>
        </div>
        {stdout || stderr ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {stdout ? (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e6e80]">
                  {copy.stdout}
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#111827] p-3 font-mono text-[11px] leading-4 text-[#f8fafc]">
                  {formatCommandOutputSnippet(stdout)}
                </pre>
              </div>
            ) : null}
            {stderr ? (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9a3412]">
                  {copy.stderr}
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#fff7ed] p-3 font-mono text-[11px] leading-4 text-[#9a3412]">
                  {formatCommandOutputSnippet(stderr)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 rounded-[12px] border border-dashed border-[#bfdbfe] bg-white px-3 py-3 text-[12px] text-[#6e6e80]">
            {copy.waiting}
          </div>
        )}
      </section>
    );
  }

  // 保留计划标签的动作队列视图, 只在用户需要查看细节时出现
  function renderPlanTab(): ReactElement {
    const timelineEvents = selectedThread?.events.slice(-8) ?? [];
    const agentActions = selectedThread?.agentActions ?? [];
    const latestVerificationResult = findLatestCommandRunResult(selectedThread?.events ?? []);
    const latestVerificationSucceeded = Boolean(
      latestVerificationResult &&
        latestVerificationResult.exitCode === 0 &&
        !latestVerificationResult.timedOut
    );
    const planCopy =
      language === "zh-CN"
        ? {
            runTranscript: "运行记录",
            userRequest: "用户请求",
            commandRunning: "正在运行命令",
            commandSucceeded: "命令已通过",
            commandFailed: "命令失败",
            commandCancelled: "命令已取消",
            viewOutput: "查看输出",
            retryCommand: "重试命令",
            generateFixPlan: "生成修复计划",
            verification: "验证",
            noVerification: "还没有完成的验证命令",
            exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`,
            stdout: "stdout",
            stderr: "stderr",
            timedOut: "已超时"
          }
        : {
            runTranscript: "Run transcript",
            userRequest: "Request",
            commandRunning: "Running command",
            commandSucceeded: "Command passed",
            commandFailed: "Command failed",
            commandCancelled: "Command cancelled",
            viewOutput: "View output",
            retryCommand: "Retry command",
            generateFixPlan: "Generate fix plan",
            verification: "Verification",
            noVerification: "No verification commands have finished yet",
            exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`,
            stdout: "stdout",
            stderr: "stderr",
            timedOut: "timed out"
          };
    const actionQueueCopy =
      language === "zh-CN"
        ? {
            title: "步骤",
            empty: "等待模型生成可执行动作",
            pending: "待执行",
            open: "打开",
            run: "运行",
            runNext: "运行下一步",
            continueSafe: "继续安全动作",
            paused: "Agent 已暂停",
            resumeAgent: "恢复 Agent",
            pausedBody: "恢复后 Forge 会继续执行后续安全动作, 仍会在审查和命令门禁前停止",
            safeReady: (count: number) => `可连续执行 ${count} 个安全动作`,
            stopsBefore: (label: string) => `将在 ${label} 前停止`,
            manualGate: "需要人工审查",
            manualGateBody: (label: string) => `请先处理 ${label}, Forge 不会自动越过这个门禁`,
            reviewGate: "审查门禁",
            approveCommand: "批准命令",
            approveExtension: "确认扩展操作",
            commandNeedsApproval: "命令需要批准",
            commandBlocked: "命令已被安全策略阻止",
            extensionNeedsConfirmation: "扩展操作需要确认",
            extensionGateBody: (label: string) => `请确认 ${label}, Forge 不会静默执行外部服务写操作`,
            markReviewComplete: "完成审查",
            skipAction: "跳过动作",
            openSourceControl: "打开源代码管理",
            ready: "就绪",
            progress: (completed: number, total: number) => `已完成 ${completed} / ${total} 个动作`,
            failedCount: (count: number) => `${count} 个失败`,
            queueStoppedAt: (label: string) => `队列停止在 ${label}`,
            generateEdit: "生成修改",
            generateNextPlan: "生成后续计划",
            generateNextPlanBody: "根据当前线程状态继续规划下一批步骤"
          }
        : {
            title: "Steps",
            empty: "Waiting for executable agent actions",
            pending: "Pending",
            open: "Open",
            run: "Run",
            runNext: "Run next action",
            continueSafe: "Continue safe agent actions",
            paused: "Agent paused",
            resumeAgent: "Resume agent",
            pausedBody:
              "Resume to continue later safe actions. Forge will still stop at review and command gates.",
            safeReady: (count: number) => `${count} safe actions ready`,
            stopsBefore: (label: string) => `Stops before ${label}`,
            manualGate: "Manual review required",
            manualGateBody: (label: string) =>
              `Handle ${label} before Forge continues. This gate will not be auto-run.`,
            reviewGate: "Review gate",
            approveCommand: "Approve command",
            approveExtension: "Confirm extension",
            commandNeedsApproval: "Command needs approval",
            commandBlocked: "Command blocked by policy",
            extensionNeedsConfirmation: "Extension action needs confirmation",
            extensionGateBody: (label: string) =>
              `Confirm ${label}. Forge will not silently run external write actions.`,
            markReviewComplete: "Mark review complete",
            skipAction: "Skip action",
            openSourceControl: "Open source control",
            ready: "Ready",
            progress: (completed: number, total: number) =>
              `${completed} / ${total} actions completed`,
            failedCount: (count: number) => `${count} failed`,
            queueStoppedAt: (label: string) => `Queue stopped at ${label}`,
            generateEdit: "Generate edit",
            generateNextPlan: "Generate next plan",
            generateNextPlanBody: "Continue from the current thread state"
          };
    const agentRunCopy =
      language === "zh-CN"
        ? {
            title: "Agent 运行状态",
            running: "正在运行",
            stopped: "已停止, 需要处理",
            gate: "等待人工门禁",
            ready: "可执行安全批次",
            complete: "动作队列已完成",
            waiting: "等待下一步",
            progress: "进度",
            safeBatch: "安全批次",
            nextGate: "下一门禁",
            current: "当前动作",
            reviewGeneratedChanges: "审查生成的修改",
            reviewChanges: "审查修改",
            pendingChanges: (count: number) => `${count} 个待应用修改`,
            pendingChangesGate: "请先应用或丢弃生成的修改, 再继续执行队列",
            noSafeBatch: "没有可连续执行的安全动作",
            noGate: "没有待处理门禁",
            noCurrent: "没有待处理动作"
          }
        : {
            title: "Agent run",
            running: "Running",
            stopped: "Stopped for review",
            gate: "Waiting at manual gate",
            ready: "Ready for safe batch",
            complete: "Action queue complete",
            waiting: "Waiting for next step",
            progress: "Progress",
            safeBatch: "Safe batch",
            nextGate: "Next gate",
            current: "Current action",
            reviewGeneratedChanges: "Review generated changes",
            reviewChanges: "Review changes",
            pendingChanges: (count: number) =>
              `${count} pending ${count === 1 ? "change" : "changes"}`,
            pendingChangesGate: "Apply or discard generated changes before continuing",
            noSafeBatch: "No safe batch ready",
            noGate: "No pending gate",
            noCurrent: "No pending action"
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
            toolResult: "工具结果",
            recoveryDecision: "恢复决策",
            recoveryHistory: "恢复历史",
            copyContext: "复制动作上下文",
            executionRecord: "执行记录",
            autoRecovery: "自动恢复",
            manualRecovery: "手动恢复",
            recoveryAttempt: (attempt: number, limit?: number) =>
              limit === undefined ? `第 ${attempt} 次` : `第 ${attempt} / ${limit} 次`,
            startedAt: "开始",
            completedAt: "结束",
            duration: "耗时",
            exitCode: "退出码",
            cwd: "目录",
            stdout: "stdout",
            stderr: "stderr",
            timedOut: "已超时",
            completed: "已完成",
            failed: "等待 Forge 自动自修复, 必要时查看日志或跳过",
            running: "正在等待命令或文件操作完成",
            ready: "可以运行",
            manualGate: "需要人工审查",
            commandNeedsApproval: "需要批准后运行",
            commandBlocked: "命令已被安全策略阻止",
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
            toolResult: "Tool result",
            recoveryDecision: "Recovery decision",
            recoveryHistory: "Recovery history",
            copyContext: "Copy action context",
            executionRecord: "Execution record",
            autoRecovery: "Automatic recovery",
            manualRecovery: "Manual recovery",
            recoveryAttempt: (attempt: number, limit?: number) =>
              limit === undefined ? `Attempt ${attempt}` : `Attempt ${attempt} / ${limit}`,
            startedAt: "Started",
            completedAt: "Completed",
            duration: "Duration",
            exitCode: "Exit code",
            cwd: "cwd",
            stdout: "stdout",
            stderr: "stderr",
            timedOut: "Timed out",
            completed: "Completed",
            failed: "Wait for Forge auto-recovery, or review logs / skip if needed",
            running: "Waiting for the command or file operation to finish",
            ready: "Ready to run",
            manualGate: "Manual review required",
            commandNeedsApproval: "Approve this command before running it",
            commandBlocked: "Command blocked by safety policy",
            skipped: "Skipped"
          };
    const queueStats = getQueueStats(agentActions);
    const pendingChangeCount = blockingChangePreviews.length;
    const hasPendingFileChanges = pendingChangeCount > 0;
    const {
      queueBlockerAction,
      nextPendingAction,
      runnablePendingActions,
      nextRunnableAction,
      nextGateAction,
      activeGateAction
    } = getAgentQueueControlState({
      actions: agentActions,
      commandSafetyPolicy,
      agentPaused: Boolean(agentPaused),
      hasPendingFileChanges
    });
    const queueComplete = queueStats.total > 0 && queueStats.completed === queueStats.total;
    const canGenerateContinuationPlan =
      Boolean(onGenerateContinuationPlan && selectedThread) &&
      agentActions.length > 0 &&
      !agentPaused &&
      !hasPendingFileChanges &&
      !queueBlockerAction &&
      runnablePendingActions.length === 0 &&
      !activeGateAction;
    const confirmationItems = getAgentConfirmationItems({
      actions: agentActions,
      changePreviews: blockingChangePreviews,
      commandSafetyPolicy,
      fullAccess,
      activeGateAction,
      projectPath: selectedThread?.projectPath ?? projectScan?.rootPath ?? null,
      queueBlockerAction,
      failureRecoveryPolicy: selectedThread?.agentProfile?.failureRecoveryPolicy,
      maxFailureRecoveryAttempts: selectedThread?.agentProfile?.maxFailureRecoveryAttempts,
      events: selectedThread?.events
    });
    const agentRunStatus =
      hasPendingFileChanges
        ? agentRunCopy.reviewGeneratedChanges
        : agentPaused
          ? actionQueueCopy.paused
        : queueBlockerAction?.status === "running"
          ? agentRunCopy.running
          : queueBlockerAction?.status === "failed"
            ? agentRunCopy.stopped
            : runnablePendingActions.length > 0
              ? agentRunCopy.ready
              : activeGateAction
                ? agentRunCopy.gate
                : queueComplete
                  ? agentRunCopy.complete
                  : agentRunCopy.waiting;
    const agentRunFocus =
      (hasPendingFileChanges ? agentRunCopy.pendingChanges(pendingChangeCount) : null) ??
      (agentPaused ? actionQueueCopy.paused : null) ??
      queueBlockerAction?.label ??
      nextPendingAction?.label ??
      activeGateAction?.label ??
      agentRunCopy.noCurrent;
    const selectedAgentAction =
      agentActions.find((action) => action.id === selectedAgentActionId) ??
      queueBlockerAction ??
      nextPendingAction ??
      agentActions[0] ??
      null;
    const selectedCommandResult = selectedAgentAction?.command
      ? findLatestCommandResult(selectedThread?.events ?? [], selectedAgentAction)
      : null;
    const selectedToolResult = selectedAgentAction
      ? findLatestToolResultEvent(selectedThread?.events ?? [], selectedAgentAction)
      : null;
    const selectedActionRunEvent = selectedAgentAction
      ? findLatestAgentActionRunEvent(selectedThread?.events ?? [], selectedAgentAction)
      : null;
    const selectedRecoveryDecisionEvent = selectedAgentAction
      ? findLatestAutoFailureRecoverySkipEvent(
          selectedThread?.events ?? [],
          selectedThread?.id ?? "",
          selectedAgentAction
        )
      : null;
    const selectedRecoveryAttempts = selectedAgentAction
      ? getFailureRecoveryAttemptsForAction(selectedThread?.events ?? [], selectedAgentAction.id)
      : [];

    // 读取命令动作的风险等级, 非命令动作不参与审批判断
    function getCommandRiskForAction(action: AgentAction): ReturnType<typeof resolveAgentCommandRisk> | null {
      return action.kind === "run-command" && action.command
        ? resolveAgentCommandRisk(action.command, commandSafetyPolicy)
        : null;
    }

    // 把动作状态转换成中文标签, 供队列和详情区复用
    function getActionStatusLabel(action: AgentAction): string {
      const commandRisk = getCommandRiskForAction(action);

      if (action.status === "pending" && commandRisk?.level === "ask" && !fullAccess) {
        return actionQueueCopy.commandNeedsApproval;
      }

      if (action.status === "pending" && commandRisk?.level === "deny") {
        return actionQueueCopy.commandBlocked;
      }

      if (
        action.status === "pending" &&
        (action.kind === "manual" || action.kind === "commit") &&
        !fullAccess
      ) {
        return actionQueueCopy.reviewGate;
      }

      if (action.status === "pending" && isRunnableAgentAction(action, commandSafetyPolicy)) {
        return actionQueueCopy.ready;
      }

      if (action.status === "pending") {
        return actionQueueCopy.pending;
      }

      return action.status;
    }

    // 根据动作状态渲染运行或打开按钮, 不让不可执行动作误触
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

      if (
        (action.kind === "list-directory" ||
          action.kind === "glob-project" ||
          action.kind === "search-project" ||
          action.kind === "git-status") &&
        (action.kind === "git-status" || action.target) &&
        selectedThread &&
        onRunAgentAction
      ) {
        const query = action.target ?? action.label;

        return (
          <button
            type="button"
            aria-label={`Run ${action.kind} action ${query}`}
            onClick={() => onRunAgentAction(selectedThread.id, action)}
            className="mt-2 h-7 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-medium text-[#202123] transition hover:bg-[#f7f7f8]"
          >
            {actionQueueCopy.run}
          </button>
        );
      }

      if (action.kind === "run-command" && action.command && selectedThread) {
        const commandToRun = action.command;
        const commandRisk = resolveAgentCommandRisk(commandToRun, commandSafetyPolicy);

        if (commandRisk.level === "ask" && !fullAccess && onApproveAgentCommand) {
          return (
            <button
              type="button"
              aria-label={`Approve command ${commandToRun}`}
              onClick={() => onApproveAgentCommand(selectedThread.id, action)}
              className="mt-2 h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
            >
              {actionQueueCopy.approveCommand}
            </button>
          );
        }

        if (commandRisk.level === "deny") {
          return null;
        }

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

      if (
        action.kind === "invoke-extension" &&
        action.extensionConfirmation &&
        selectedThread &&
        onConfirmAgentExtension
      ) {
        return (
          <button
            type="button"
            aria-label={`Confirm extension action ${action.label}`}
            onClick={() => onConfirmAgentExtension(selectedThread.id, action)}
            className="mt-2 h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
          >
            {actionQueueCopy.approveExtension}
          </button>
        );
      }

      return null;
    }

    // 为动作详情生成下一步提示, 帮助用户理解为什么被阻塞
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

      if ((action.kind === "manual" || action.kind === "commit") && !fullAccess) {
        return actionDetailsCopy.manualGate;
      }

      const commandRisk = getCommandRiskForAction(action);

      if (commandRisk?.level === "ask" && !fullAccess) {
        return `${actionDetailsCopy.commandNeedsApproval}: ${formatAgentCommandRiskReason(
          language,
          commandRisk.reason
        )}`;
      }

      if (commandRisk?.level === "deny") {
        return `${actionDetailsCopy.commandBlocked}: ${formatAgentCommandRiskReason(
          language,
          commandRisk.reason
        )}`;
      }

      if (action.kind === "invoke-extension" && action.extensionConfirmation) {
        return actionQueueCopy.extensionGateBody(action.label);
      }

      if (isRunnableAgentAction(action, commandSafetyPolicy)) {
        return actionDetailsCopy.ready;
      }

      return actionQueueCopy.pending;
    }

    // 生成人工门禁或命令审批门禁标题
    function getGateTitle(action: AgentAction): string {
      const commandRisk = getCommandRiskForAction(action);

      if (commandRisk?.level === "ask" && !fullAccess) {
        return actionQueueCopy.commandNeedsApproval;
      }

      if (commandRisk?.level === "deny") {
        return actionQueueCopy.commandBlocked;
      }

      if (action.kind === "invoke-extension" && action.extensionConfirmation) {
        return actionQueueCopy.extensionNeedsConfirmation;
      }

      return fullAccess ? actionQueueCopy.ready : actionQueueCopy.manualGate;
    }

    // 生成人工门禁或命令审批门禁说明
    function getGateBody(action: AgentAction): string {
      const commandRisk = getCommandRiskForAction(action);

      if (commandRisk?.level === "ask" && !fullAccess) {
        return actionDetailsCopy.commandNeedsApproval;
      }

      if (commandRisk?.level === "deny") {
        return actionDetailsCopy.commandBlocked;
      }

      if (action.kind === "invoke-extension" && action.extensionConfirmation) {
        return actionQueueCopy.extensionGateBody(action.label);
      }

      return fullAccess ? actionDetailsCopy.ready : actionQueueCopy.manualGateBody(action.label);
    }

    // 动作详情也提供门禁和恢复操作, 避免用户看完详情后还要回到队列顶部找确认入口
    function renderAgentActionDetailControls(action: AgentAction): ReactElement | null {
      if (!selectedThread) {
        return null;
      }

      const commandRisk = getCommandRiskForAction(action);
      const controls: ReactElement[] = [];

      if (
        action.status === "pending" &&
        action.kind === "run-command" &&
        action.command &&
        commandRisk?.level === "ask" &&
        onApproveAgentCommand
      ) {
        controls.push(
          <button
            key="approve-command"
            type="button"
            onClick={() => onApproveAgentCommand(selectedThread.id, action)}
            className="h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
          >
            {actionQueueCopy.approveCommand}
          </button>
        );
      }

      if (action.status === "pending" && action.kind === "commit" && onOpenSourceControl) {
        controls.push(
          <button
            key="open-source-control"
            type="button"
            onClick={onOpenSourceControl}
            className="h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
          >
            {actionQueueCopy.openSourceControl}
          </button>
        );
      }

      if (
        action.status === "pending" &&
        action.kind === "invoke-extension" &&
        action.extensionConfirmation &&
        onConfirmAgentExtension
      ) {
        controls.push(
          <button
            key="confirm-extension"
            type="button"
            onClick={() => onConfirmAgentExtension(selectedThread.id, action)}
            className="h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
          >
            {actionQueueCopy.approveExtension}
          </button>
        );
      }

      if (action.status === "pending" && action.kind === "manual" && onCompleteAgentAction) {
        controls.push(
          <button
            key="complete-manual"
            type="button"
            onClick={() => onCompleteAgentAction(selectedThread.id, action)}
            className="h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
          >
            {actionQueueCopy.markReviewComplete}
          </button>
        );
      }

      if (onSkipAgentAction && canSkipAgentAction(action)) {
        controls.push(
          <button
            key="skip-action"
            type="button"
            aria-label={`${actionQueueCopy.skipAction} ${action.label}`}
            onClick={() => onSkipAgentAction(selectedThread.id, action)}
            className="h-7 rounded-[10px] border border-[#f4c7ab] bg-white px-2 text-[11px] font-medium text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
          >
            {actionQueueCopy.skipAction}
          </button>
        );
      }

      return controls.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{controls}</div> : null;
    }

    // 展示单个动作的输入, 输出和恢复入口
    function renderAgentActionDetails(
      action: AgentAction,
      commandResult: CommandRunResult | null,
      toolResult: TaskThreadEvent | null,
      actionRunEvent: TaskThreadEvent | null,
      recoveryDecisionEvent: TaskThreadEvent | null,
      recoveryAttempts: ReturnType<typeof getFailureRecoveryAttemptsForAction>
    ): ReactElement {
      const detailRows = [
        { label: actionDetailsCopy.kind, value: action.kind },
        { label: actionDetailsCopy.status, value: getActionStatusLabel(action) },
        { label: actionDetailsCopy.target, value: action.target ?? actionDetailsCopy.noTarget },
        ...(action.command ? [{ label: actionDetailsCopy.command, value: action.command }] : [])
      ];
      const actionStatusLabel = getActionStatusLabel(action);
      const nextStep = getActionNextStep(action);

      return (
        <AgentActionDetailsPanel
          action={action}
          actionRun={actionRunEvent?.agentActionRun ?? null}
          actionRunMessage={actionRunEvent?.message}
          commandResult={commandResult}
          controls={renderAgentActionDetailControls(action)}
          copy={actionDetailsCopy}
          detailRows={detailRows}
          language={language}
          nextStep={nextStep}
          recoveryDecision={recoveryDecisionEvent}
          recoveryAttempts={recoveryAttempts}
          statusLabel={actionStatusLabel}
          toolResult={toolResult}
        />
      );
    }

    // 渲染模型回答和命令结果, Markdown 输出在这里保持连续
    function renderTranscriptOutput(label: string, value: string, tone: "dark" | "warning"): ReactElement | null {
      const output = value.trim();

      if (!output) {
        return null;
      }

      return (
        <div className="mt-2">
          <div
            className={`mb-1 text-[11px] font-medium ${
              tone === "warning" ? "text-[#9a3412]" : "text-[#8e8ea0]"
            }`}
          >
            {label}
          </div>
          <pre
            className={`max-h-28 overflow-auto whitespace-pre-wrap rounded-[12px] p-2 font-mono text-[11px] leading-4 ${
              tone === "warning"
                ? "bg-[#fff7ed] text-[#9a3412]"
                : "bg-[#111827] text-[#f8fafc]"
            }`}
          >
            {formatCommandOutputSnippet(output)}
          </pre>
        </div>
      );
    }

    // 失败命令下方展示恢复入口, 用户可以沿同一线程继续修复
    function renderCommandRecovery(result: CommandRunResult): ReactElement | null {
      const failed = !result.cancelled && (result.timedOut || result.exitCode !== 0);
      const canRetry = result.cancelled || result.timedOut || result.exitCode !== 0;

      if (!selectedThread || !canRetry) {
        return null;
      }

      const viewOutputLabel =
        language === "zh-CN"
          ? `${planCopy.viewOutput} ${result.command}`
          : `${planCopy.viewOutput} for ${result.command}`;
      const generateFixLabel =
        language === "zh-CN"
          ? `${planCopy.generateFixPlan} ${result.command}`
          : `${planCopy.generateFixPlan} for ${result.command}`;

      return (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            aria-label={viewOutputLabel}
            onClick={() => setActiveTab("commands")}
            className="h-7 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-medium text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
          >
            {planCopy.viewOutput}
          </button>
          {failed && onGenerateCommandFix ? (
            <button
              type="button"
              aria-label={generateFixLabel}
              onClick={() => onGenerateCommandFix(selectedThread.id, result)}
              className="h-7 rounded-[10px] bg-[#202123] px-2 text-[11px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
            >
              <span className="inline-flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                {planCopy.generateFixPlan}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`${planCopy.retryCommand} ${result.command}`}
            onClick={() => onRunCommand(selectedThread.id, result.command)}
            className="h-7 rounded-[10px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-medium text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
          >
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              {planCopy.retryCommand}
            </span>
          </button>
        </div>
      );
    }

    // 把不同类型事件映射成简洁对话消息, 普通用户只看必要内容
    function renderTranscriptEvent(event: TaskThreadEvent, index: number): ReactElement {
      const isLast = index === timelineEvents.length - 1;
      const isActive = isLast && selectedThread?.status === "running";

      if (event.commandApproval) {
        return (
          <article key={event.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <CheckCircle2 className="h-5 w-5 text-[#087443]" />
              {!isLast ? <span className="mt-2 h-full w-px bg-[#ececf1]" /> : null}
            </div>
            <div className="min-w-0 pb-4">
              <div className="text-sm font-semibold leading-5 text-[#087443]">
                {language === "zh-CN" ? "命令已批准" : "Command approved"}
              </div>
              <p className="mt-1 break-words font-mono text-[12px] leading-5 text-[#202123]">
                {event.commandApproval.command}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[#6e6e80]">
                {formatAgentCommandRiskReason(language, event.commandApproval.reason)}
              </p>
            </div>
          </article>
        );
      }

      if (event.commandRun) {
        return (
          <article key={event.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <Activity className="h-5 w-5 text-[#202123]" />
              {!isLast ? <span className="mt-2 h-full w-px bg-[#ececf1]" /> : null}
            </div>
            <div className="min-w-0 pb-4">
              <div className="text-sm font-semibold leading-5 text-[#202123]">
                {planCopy.commandRunning}
              </div>
              <p className="mt-1 break-words font-mono text-[12px] leading-5 text-[#202123]">
                {event.commandRun.command}
              </p>
              {renderTranscriptOutput(planCopy.stdout, event.commandRun.stdout ?? "", "dark")}
              {renderTranscriptOutput(planCopy.stderr, event.commandRun.stderr ?? "", "warning")}
            </div>
          </article>
        );
      }

      if (event.commandResult) {
        const result = event.commandResult;
        const failed = !result.cancelled && (result.timedOut || result.exitCode !== 0);
        const title = result.cancelled
          ? planCopy.commandCancelled
          : failed
            ? planCopy.commandFailed
            : planCopy.commandSucceeded;

        return (
          <article key={event.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              {failed ? (
                <Terminal className="h-5 w-5 text-[#9a3412]" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-[#087443]" />
              )}
              {!isLast ? <span className="mt-2 h-full w-px bg-[#ececf1]" /> : null}
            </div>
            <div className="min-w-0 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm font-semibold leading-5 ${
                    failed ? "text-[#9a3412]" : "text-[#087443]"
                  }`}
                >
                  {title}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    failed ? "bg-[#fff7ed] text-[#9a3412]" : "bg-[#effaf6] text-[#087443]"
                  }`}
                >
                  {planCopy.exit(result.exitCode)}
                </span>
                {result.timedOut ? (
                  <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] text-[#9a3412]">
                    {planCopy.timedOut}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 break-words font-mono text-[12px] leading-5 text-[#202123]">
                {result.command}
              </p>
              {renderTranscriptOutput(planCopy.stdout, result.stdout, "dark")}
              {renderTranscriptOutput(planCopy.stderr, result.stderr, "warning")}
              {renderCommandRecovery(result)}
            </div>
          </article>
        );
      }

      return (
        <article key={event.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
          <div className="flex flex-col items-center">
            {isActive ? (
              <Activity className="h-5 w-5 text-[#202123]" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-[#10a37f]" />
            )}
            {!isLast ? <span className="mt-2 h-full w-px bg-[#ececf1]" /> : null}
          </div>
          <div className="min-w-0 pb-4">
            <p className="text-sm leading-6 text-[#202123]">{event.message}</p>
          </div>
        </article>
      );
    }

    return (
      <div className="space-y-4">
        {queueStats.total > 0 ? (
          <section
            aria-label={agentRunCopy.title}
            className="rounded-[18px] border border-[#d9d9e3] bg-[#f7f7f8] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d9d9e3] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#565869]">
                  <Activity className="h-3.5 w-3.5 text-[#202123]" />
                  {agentRunCopy.title}
                </div>
                <p className="mt-2 text-base font-semibold leading-6 text-[#202123]">
                  {agentRunStatus}
                </p>
                <p className="mt-1 break-words text-sm leading-5 text-[#565869]">
                  {agentRunCopy.current}: {agentRunFocus}
                </p>
              </div>
              <div className="grid min-w-[260px] flex-1 gap-3 sm:grid-cols-3">
                <div className="border-l border-[#d9d9e3] pl-3">
                  <div className="text-[11px] font-medium text-[#8e8ea0]">
                    {agentRunCopy.progress}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#202123]">
                    {actionQueueCopy.progress(queueStats.completed, queueStats.total)}
                  </div>
                </div>
                <div className="border-l border-[#d9d9e3] pl-3">
                  <div className="text-[11px] font-medium text-[#8e8ea0]">
                    {agentRunCopy.safeBatch}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#202123]">
                    {hasPendingFileChanges
                      ? agentRunCopy.pendingChanges(pendingChangeCount)
                      : runnablePendingActions.length > 0
                      ? actionQueueCopy.safeReady(runnablePendingActions.length)
                      : agentRunCopy.noSafeBatch}
                  </div>
                </div>
                <div className="border-l border-[#d9d9e3] pl-3">
                  <div className="text-[11px] font-medium text-[#8e8ea0]">
                    {agentRunCopy.nextGate}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[#202123]">
                    {hasPendingFileChanges
                      ? agentRunCopy.pendingChangesGate
                      : nextGateAction
                      ? actionQueueCopy.stopsBefore(nextGateAction.label)
                      : activeGateAction
                        ? actionQueueCopy.manualGateBody(activeGateAction.label)
                        : agentRunCopy.noGate}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label={planCopy.runTranscript} className="min-w-0 bg-white px-1 py-1">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#202123]">
              <Activity className="h-4 w-4 text-[#565869]" />
              {planCopy.runTranscript}
            </h2>
            <div className="space-y-1">
              <article className="flex justify-end">
                <div className="max-w-[78%] rounded-[18px] bg-[#f2f2f2] px-4 py-3 text-sm leading-6 text-[#202123]">
                  <div className="mb-1 text-[11px] font-medium text-[#8e8ea0]">
                    {planCopy.userRequest}
                  </div>
                  {selectedThread.prompt}
                </div>
              </article>
              <div className="pt-4">
                {timelineEvents.map((event, index) => renderTranscriptEvent(event, index))}
                <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                  <div className="flex justify-center">
                    <Circle className="h-5 w-5 text-[#8e8ea0]" />
                  </div>
                  <div>
                    <p className="text-sm leading-6 text-[#6e6e80]">{t("threads.command")}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

        <aside className="space-y-4">
          <AgentConfirmationQueue
            commandSafetyPolicy={commandSafetyPolicy}
            fullAccess={fullAccess}
            items={confirmationItems}
            language={language}
            threadId={selectedThread.id}
            variant="full"
            onAllowAgentCommand={onAllowAgentCommand}
            onApplyAllChanges={onApplyAllChanges}
            onApproveAgentCommand={onApproveAgentCommand}
            onConfirmAgentExtension={onConfirmAgentExtension}
            onCompleteAgentAction={onCompleteAgentAction}
            onDiscardAllChanges={onDiscardAllChanges}
            onOpenChangesTab={() => setActiveTab("changes")}
            onOpenFiles={onOpenFiles}
            onOpenSourceControl={onOpenSourceControl}
            onPreviewFile={onPreviewFile}
            onSkipAgentAction={onSkipAgentAction}
            onViewAction={(actionId) => {
              setSelectedAgentActionId(actionId);
              setActiveTab("plan");
            }}
          />
          <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#202123]">
                <ListChecks className="h-4 w-4 text-[#565869]" />
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
            {agentPaused ? (
              <div className="mb-3 rounded-[14px] border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2">
                <p className="text-sm font-medium leading-5 text-[#1d4ed8]">
                  {actionQueueCopy.paused}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-[#1d4ed8]">
                  {actionQueueCopy.pausedBody}
                </p>
                {selectedThread && onResumeAgent ? (
                  <button
                    type="button"
                    aria-label={actionQueueCopy.resumeAgent}
                    onClick={() => onResumeAgent(selectedThread.id)}
                    className="mt-2 h-7 rounded-[10px] bg-[#1d4ed8] px-2 text-[11px] font-semibold text-white transition hover:bg-[#1e40af] active:scale-[0.99]"
                  >
                    {actionQueueCopy.resumeAgent}
                  </button>
                ) : null}
              </div>
            ) : null}
            {!agentPaused && queueBlockerAction?.status === "failed" ? (
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
                  {selectedThread && onSkipAgentAction && canSkipAgentAction(queueBlockerAction) ? (
                    <button
                      type="button"
                      aria-label={`${actionQueueCopy.skipAction} ${queueBlockerAction.label}`}
                      onClick={() => onSkipAgentAction(selectedThread.id, queueBlockerAction)}
                      className="h-7 rounded-[10px] border border-[#f4c7ab] bg-white px-2 text-[11px] font-medium text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
                    >
                      {actionQueueCopy.skipAction}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!agentPaused && hasPendingFileChanges ? (
              <div className="mb-3 rounded-[14px] border border-[#f4c7ab] bg-[#fff7ed] px-3 py-2">
                <p className="text-sm font-medium leading-5 text-[#9a3412]">
                  {agentRunCopy.reviewGeneratedChanges}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-[#b45309]">
                  {agentRunCopy.pendingChangesGate}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("changes")}
                  className="mt-2 h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
                >
                  {agentRunCopy.reviewChanges}
                </button>
              </div>
            ) : null}
            {!agentPaused && runnablePendingActions.length > 0 ? (
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
            {canGenerateContinuationPlan ? (
              <div className="mb-3 rounded-[14px] border border-[#d9d9e3] bg-[#f7f7f8] px-3 py-2">
                <p className="text-sm font-medium leading-5 text-[#202123]">
                  {actionQueueCopy.generateNextPlan}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-[#6e6e80]">
                  {actionQueueCopy.generateNextPlanBody}
                </p>
                <button
                  type="button"
                  aria-label={actionQueueCopy.generateNextPlan}
                  onClick={() => selectedThread && onGenerateContinuationPlan?.(selectedThread.id)}
                  className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-[10px] bg-[#202123] px-2 text-[11px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                >
                  <Brain className="h-3.5 w-3.5" />
                  {actionQueueCopy.generateNextPlan}
                </button>
              </div>
            ) : null}
            {!agentPaused && runnablePendingActions.length === 0 && activeGateAction ? (
              <div className="mb-3 rounded-[14px] border border-[#f4c7ab] bg-[#fff7ed] px-3 py-2">
                <p className="text-sm font-medium leading-5 text-[#9a3412]">
                  {getGateTitle(activeGateAction)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-[#b45309]">
                  {getGateBody(activeGateAction)}
                </p>
                {activeGateAction.kind === "run-command" &&
                activeGateAction.command &&
                getCommandRiskForAction(activeGateAction)?.level === "ask" &&
                selectedThread &&
                onApproveAgentCommand ? (
                  <button
                    type="button"
                    onClick={() => onApproveAgentCommand(selectedThread.id, activeGateAction)}
                    className="mt-2 h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
                  >
                    {actionQueueCopy.approveCommand}
                  </button>
                ) : null}
                {activeGateAction.kind === "commit" && onOpenSourceControl ? (
                  <button
                    type="button"
                    onClick={onOpenSourceControl}
                    className="mt-2 h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
                  >
                    {actionQueueCopy.openSourceControl}
                  </button>
                ) : null}
                {activeGateAction.kind === "invoke-extension" &&
                activeGateAction.extensionConfirmation &&
                selectedThread &&
                onConfirmAgentExtension ? (
                  <button
                    type="button"
                    onClick={() => onConfirmAgentExtension(selectedThread.id, activeGateAction)}
                    className="mt-2 h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
                  >
                    {actionQueueCopy.approveExtension}
                  </button>
                ) : null}
                {activeGateAction.kind === "manual" && selectedThread && onCompleteAgentAction ? (
                  <button
                    type="button"
                    onClick={() => onCompleteAgentAction(selectedThread.id, activeGateAction)}
                    className="mt-2 h-7 rounded-[10px] bg-[#9a3412] px-2 text-[11px] font-semibold text-white transition hover:bg-[#7c2d12] active:scale-[0.99]"
                  >
                    {actionQueueCopy.markReviewComplete}
                  </button>
                ) : null}
                {selectedThread && onSkipAgentAction && canSkipAgentAction(activeGateAction) ? (
                  <button
                    type="button"
                    aria-label={`${actionQueueCopy.skipAction} ${activeGateAction.label}`}
                    onClick={() => onSkipAgentAction(selectedThread.id, activeGateAction)}
                    className="mt-2 h-7 rounded-[10px] border border-[#f4c7ab] bg-white px-2 text-[11px] font-medium text-[#9a3412] transition hover:bg-[#fffaf5] active:scale-[0.99]"
                  >
                    {actionQueueCopy.skipAction}
                  </button>
                ) : null}
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
          {selectedAgentAction
            ? renderAgentActionDetails(
                selectedAgentAction,
                selectedCommandResult,
                selectedToolResult,
                selectedActionRunEvent,
                selectedRecoveryDecisionEvent,
                selectedRecoveryAttempts
              )
            : null}
          <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-[#202123]">{planCopy.verification}</h2>
            {latestVerificationResult ? (
              <div
                className={`rounded-[14px] border px-3 py-2 text-sm ${
                  latestVerificationResult.exitCode === 0 && !latestVerificationResult.timedOut
                    ? "border-[#c3eadc] bg-[#effaf6] text-[#087443]"
                    : "border-[#f4c7ab] bg-[#fff7ed] text-[#9a3412]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {latestVerificationSucceeded ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Terminal className="h-4 w-4" />
                  )}
                  <span className="break-words font-mono text-[12px] font-semibold">
                    {latestVerificationResult.command}
                  </span>
                </div>
                <div className="mt-1 text-[12px] font-medium">
                  {planCopy.exit(latestVerificationResult.exitCode)}
                  {latestVerificationResult.timedOut ? `, ${planCopy.timedOut}` : ""}
                </div>
                {latestVerificationResult.stdout.trim() ? (
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#111827] p-2 font-mono text-[11px] leading-4 text-[#f8fafc]">
                    {formatCommandOutputSnippet(latestVerificationResult.stdout)}
                  </pre>
                ) : null}
                {latestVerificationResult.stderr.trim() ? (
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-[12px] bg-[#fff7ed] p-2 font-mono text-[11px] leading-4 text-[#9a3412]">
                    {formatCommandOutputSnippet(latestVerificationResult.stderr)}
                  </pre>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[14px] border border-dashed border-[#d9d9e3] px-3 py-3 text-sm leading-5 text-[#6e6e80]">
                {planCopy.noVerification}
              </div>
            )}
          </section>
        </aside>
      </div>
      </div>
    );
  }

  // 展示待审查文件变更, 所有写入动作都需要用户确认
  function renderChangesTab(): ReactElement {
    const annotatedDiff = visibleChangePreview
      ? annotateLineDiffHunks(visibleChangePreview.diff)
      : [];

    // 按单个 diff 块重建草稿并通知上层刷新预览
    function updateDiffHunk(
      preview: ProjectFileChangePreview,
      hunkIndex: number,
      decision: LineDiffHunkDecision
    ): void {
      const nextContent = createTextFromLineDiffHunkDecision(preview.diff, hunkIndex, decision);

      setDraftContent(nextContent);
      onPreviewChange?.(preview.relativePath, nextContent);
    }

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
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[12px] px-2 py-1.5 text-left text-xs text-[#202123]"
                >
                  <ProjectFileIcon relativePath={file.relativePath} />
                  <span className="min-w-0 truncate">{file.relativePath}</span>
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
                    className={`flex w-full items-center gap-1.5 rounded-[12px] px-2 py-1.5 text-left text-xs ${
                      previewFile?.relativePath === preview.relativePath
                        ? "bg-[#ececf1] text-[#202123]"
                        : "text-[#202123] hover:bg-[#f7f7f8]"
                    }`}
                  >
                    <ProjectFileIcon relativePath={preview.relativePath} />
                    <span className="min-w-0 truncate">{preview.relativePath}</span>
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
                    {onDeleteFile ? (
                      <button
                        type="button"
                        onClick={() => onDeleteFile(previewFile.relativePath)}
                        className="h-9 rounded-[13px] border border-[#f4c7ab] bg-[#fff7ed] px-3 text-sm font-semibold text-[#b45309] hover:bg-[#ffedd5]"
                      >
                        {language === "zh-CN" ? "删除文件" : "Delete file"}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-3 text-xs leading-5 text-[#202123]">
                  {previewFile.content}
                </pre>
              )}
              {visibleChangePreview ? (
                <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[16px] border border-[#ececf1] bg-[#f7f7f8] p-3 font-mono text-xs leading-5 text-[#6e6e80]">
                  {annotatedDiff.map((line, index) => {
                    const prefix =
                      line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  ";
                    const hunkIndex = line.hunkIndex;

                    return (
                      <div key={`${line.kind}-${index}`}>
                        {line.hunkStart && hunkIndex !== null && canEditPreview ? (
                          <div className="mb-1 mt-2 flex flex-wrap items-center gap-1.5 border-t border-[#ececf1] pt-2 font-sans first:mt-0 first:border-t-0 first:pt-0">
                            <span className="rounded-[8px] border border-[#d9d9e3] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#565869]">
                              {diffHunkCopy.hunkLabel(hunkIndex + 1)}
                            </span>
                            <button
                              type="button"
                              aria-label={diffHunkCopy.keepOnlyAria(
                                hunkIndex + 1,
                                visibleChangePreview.relativePath
                              )}
                              onClick={() => updateDiffHunk(visibleChangePreview, hunkIndex, "keep-only")}
                              className="rounded-[8px] border border-[#b7dfc8] bg-[#effaf6] px-2 py-0.5 text-[11px] font-semibold text-[#087443] hover:bg-[#dff5ec]"
                            >
                              {diffHunkCopy.keepOnly}
                            </button>
                            <button
                              type="button"
                              aria-label={diffHunkCopy.rejectAria(
                                hunkIndex + 1,
                                visibleChangePreview.relativePath
                              )}
                              onClick={() => updateDiffHunk(visibleChangePreview, hunkIndex, "discard")}
                              className="rounded-[8px] border border-[#f4c7ab] bg-[#fff7ed] px-2 py-0.5 text-[11px] font-semibold text-[#b45309] hover:bg-[#ffedd5]"
                            >
                              {diffHunkCopy.reject}
                            </button>
                          </div>
                        ) : null}
                        <div
                          className={
                            line.kind === "add"
                              ? "text-[#087443]"
                              : line.kind === "remove"
                                ? "text-[#b45309]"
                                : "text-[#6e6e80]"
                          }
                        >
                          {prefix}
                          {line.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
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

  // 展示命令历史和实时输出, 便于复盘 Agent 做过什么
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
            generateFixPlan: "生成修复计划",
            retryCommand: "重试命令",
            cancelCommand: "取消命令",
            cancelled: "已取消"
          }
        : {
            title: "Command history",
            empty: "No command output yet",
            exit: (exitCode: number | null) => `exit ${exitCode === null ? "null" : exitCode}`,
            timedOut: "Timed out",
            stdout: "stdout",
            stderr: "stderr",
            generateFixPlan: "Generate fix plan",
            retryCommand: "Retry command",
            cancelCommand: "Cancel command",
            cancelled: "Cancelled"
          };
    const commandRunningCopy = language === "zh-CN" ? "运行中" : "running";
    const commandCopyOutput = language === "zh-CN" ? "复制输出" : "Copy output";
    const commandEvents = selectedThread?.events ?? [];
    const commandHistory = getCommandHistoryEntries(commandEvents);
    const commandApprovals = commandEvents.filter((event) => event.commandApproval);
    const commandApprovalCopy =
      language === "zh-CN"
        ? {
            title: "命令审批记录",
            reason: "原因"
          }
        : {
            title: "Command approvals",
            reason: "Reason"
          };

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
        {commandApprovals.length > 0 ? (
          <section
            aria-label={commandApprovalCopy.title}
            className="rounded-[18px] border border-[#ececf1] bg-white p-4"
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202123]">
              <CheckCircle2 className="h-4 w-4 text-[#087443]" />
              {commandApprovalCopy.title}
            </h2>
            <div className="space-y-3">
              {commandApprovals.map((event) => {
                const approval = event.commandApproval;

                if (!approval) {
                  return null;
                }

                return (
                  <article
                    key={event.id}
                    className="rounded-[16px] border border-[#c3eadc] bg-[#effaf6] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-mono text-sm font-semibold text-[#202123]">
                        {approval.command}
                      </p>
                      <span className="shrink-0 text-[11px] text-[#087443]">
                        {formatEventTimestamp(approval.approvedAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-[#565869]">
                      <span className="font-semibold text-[#202123]">
                        {commandApprovalCopy.reason}:{" "}
                      </span>
                      {formatAgentCommandRiskReason(language, approval.reason)}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
        <section className="rounded-[18px] border border-[#ececf1] bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202123]">
            <Terminal className="h-4 w-4 text-[#565869]" />
            {commandHistoryCopy.title}
          </h2>
          {commandHistory.length > 0 ? (
            <div className="space-y-3">
              {commandHistory.map(({ id, createdAt, result, status }) => {
                const hasCommandOutput = Boolean(result.stdout.trim() || result.stderr.trim());

                return (
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
                      {status === "finished" && result.cancelled ? (
                        <span className="rounded-full border border-[#d9d9e3] bg-white px-2 py-0.5 text-[11px] text-[#565869]">
                          {commandHistoryCopy.cancelled}
                        </span>
                      ) : null}
                      {status === "finished" && !result.cancelled ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            result.exitCode === 0 && !result.timedOut
                              ? "border-[#c3eadc] bg-[#effaf6] text-[#087443]"
                              : "border-[#f4c7ab] bg-[#fff7ed] text-[#9a3412]"
                          }`}
                        >
                          {commandHistoryCopy.exit(result.exitCode)}
                        </span>
                      ) : null}
                      {result.timedOut ? (
                        <span className="rounded-full border border-[#f4c7ab] bg-[#fff7ed] px-2 py-0.5 text-[11px] text-[#9a3412]">
                          {commandHistoryCopy.timedOut}
                        </span>
                      ) : null}
                      {status === "running" ? (
                        <span className="rounded-full border border-[#d9d9e3] bg-white px-2 py-0.5 text-[11px] text-[#565869]">
                          {commandRunningCopy}
                        </span>
                      ) : null}
                      {hasCommandOutput ? (
                        <Tooltip label={commandCopyOutput}>
                          <button
                            type="button"
                            aria-label={commandCopyOutput}
                            onClick={() =>
                              void navigator.clipboard?.writeText(formatCommandResultForClipboard(result))
                            }
                            className="flex h-6 w-6 items-center justify-center rounded-[8px] border border-[#d9d9e3] bg-white text-[#565869] transition hover:bg-[#f7f7f8] hover:text-[#202123] active:scale-[0.97]"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </Tooltip>
                      ) : null}
                      {selectedThread && status === "running" && result.runId && onCancelCommand ? (
                        <button
                          type="button"
                          onClick={() => onCancelCommand(selectedThread.id, result.runId!)}
                          className="h-6 rounded-[9px] border border-[#f4c7ab] bg-[#fff7ed] px-2 text-[11px] font-semibold text-[#9a3412] transition hover:bg-[#ffedd5] active:scale-[0.99]"
                        >
                          {commandHistoryCopy.cancelCommand}
                        </button>
                      ) : null}
                      {selectedThread &&
                      onGenerateCommandFix &&
                      status === "finished" &&
                      !result.cancelled &&
                      (result.timedOut || result.exitCode !== 0) ? (
                        <button
                          type="button"
                          onClick={() => onGenerateCommandFix(selectedThread.id, result)}
                          className="h-6 rounded-[9px] bg-[#202123] px-2 text-[11px] font-semibold text-white transition hover:bg-black active:scale-[0.99]"
                        >
                          {commandHistoryCopy.generateFixPlan}
                        </button>
                      ) : null}
                      {selectedThread &&
                      status === "finished" &&
                      (result.cancelled || result.timedOut || result.exitCode !== 0) ? (
                        <button
                          type="button"
                          onClick={() => onRunCommand(selectedThread.id, result.command)}
                          className="h-6 rounded-[9px] border border-[#d9d9e3] bg-white px-2 text-[11px] font-semibold text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
                        >
                          {commandHistoryCopy.retryCommand}
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
                );
              })}
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

  // 展示原始事件日志, 作为调试入口而不是默认视图
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

function getCompactProcessedSummary(
  thread: TaskThread,
  visibleEvents: TaskThreadEvent[],
  language: Language
): CompactProcessedSummary | null {
  const visibleEventIds = new Set(visibleEvents.map((event) => event.id));
  const hiddenEvents = thread.events.filter((event) => !visibleEventIds.has(event.id));

  if (
    hiddenEvents.length === 0 &&
    thread.status !== "running" &&
    thread.status !== "planned"
  ) {
    return null;
  }

  return {
    hiddenEvents,
    groups: buildCompactProcessedGroups(hiddenEvents, language),
    sourceUrls: extractSourceUrlsFromEvents(hiddenEvents),
    livePreview: getCompactProcessedLivePreview(thread, hiddenEvents),
    recoverySummary: getProcessedRecoverySummary(thread, language) ?? undefined
  };
}

function buildCompactProcessedGroups(
  hiddenEvents: TaskThreadEvent[],
  language: Language
): CompactProcessedGroup[] {
  const buckets = new Map<CompactProcessedGroupKind, CompactProcessedItem[]>();

  for (const event of hiddenEvents) {
    const item = createCompactProcessedItem(event, language);
    const current = buckets.get(item.kind) ?? [];

    if (item.dedupeKey) {
      const existingIndex = current.findIndex((candidate) => candidate.dedupeKey === item.dedupeKey);

      if (existingIndex >= 0) {
        current[existingIndex] = {
          ...current[existingIndex],
          ...item,
          id: current[existingIndex].id,
          urls: mergeUniqueStrings([...current[existingIndex].urls, ...item.urls])
        };
        buckets.set(item.kind, current);
        continue;
      }
    }

    buckets.set(item.kind, [...current, item]);
  }

  const order: CompactProcessedGroupKind[] = [
    "web",
    "command",
    "edit",
    "search",
    "file",
    "error",
    "plan",
    "other"
  ];

  return order.flatMap((kind) => {
    const items = buckets.get(kind) ?? [];

    if (items.length === 0) {
      return [];
    }

    return [
      {
        kind,
        label: getCompactProcessedGroupTitle(kind, language),
        summaryLabel: getCompactProcessedGroupSummary(kind, items.length, language),
        items
      }
    ];
  });
}

function createCompactProcessedItem(
  event: TaskThreadEvent,
  language: Language
): CompactProcessedItem {
  const urls = extractSourceUrls(event.message);
  const command = event.commandResult?.command ?? event.commandRun?.command ?? event.commandApproval?.command;
  const actionLabel = event.agentActionRun?.label ?? "";
  const text = `${event.message}\n${actionLabel}`;

  if (command) {
    const runId = event.commandResult?.runId ?? event.commandRun?.runId;

    return {
      id: event.id,
      kind: "command",
      label: getCompactEventLabel(event, language),
      detail: compactProcessedDetail(command),
      createdAt: event.completedAt ?? event.createdAt,
      urls,
      dedupeKey: `command:${getCommandRunKey(command, runId)}`
    };
  }

  const kind = getCompactProcessedEventKind(event, text, urls);
  const label = getCompactEventLabel(event, language);
  const detailSource = getCompactProcessedDetailSource(event, actionLabel);
  const dedupeKey = event.agentActionRun?.actionId
    ? `${kind}:action:${event.agentActionRun.actionId}`
    : undefined;

  return {
    id: event.id,
    kind,
    label,
    detail: compactProcessedDetail(detailSource),
    createdAt: event.completedAt ?? event.createdAt,
    urls,
    dedupeKey
  };
}

function getCompactProcessedEventKind(
  event: TaskThreadEvent,
  text: string,
  urls: string[]
): CompactProcessedGroupKind {
  if (event.kind === "error") {
    return "error";
  }

  if (urls.length > 0 || isWebSearchTranscript(text)) {
    return "web";
  }

  if (isEditTranscript(text)) {
    return "edit";
  }

  if (isProjectSearchTranscript(text)) {
    return "search";
  }

  if (event.kind === "file" || isFileReadTranscript(text)) {
    return "file";
  }

  if (event.kind === "plan") {
    return "plan";
  }

  return "other";
}

function getCompactProcessedDetailSource(event: TaskThreadEvent, actionLabel: string): string {
  const message = event.message.trim();

  if (message && actionLabel && message.includes(actionLabel)) {
    return message;
  }

  if (actionLabel && message) {
    return `${actionLabel}: ${message}`;
  }

  return actionLabel || message || event.id;
}

function isWebSearchTranscript(value: string): boolean {
  return /网页搜索|搜索网页|已搜索网页|web search|searched web|webpage search|browser search/iu.test(value);
}

function isEditTranscript(value: string): boolean {
  return /文件修改|文件写入|文件创建|生成文件|已应用文件|正在编辑|已编辑|Edit |Write |Create |generate file change|file change|patch|diff/iu.test(
    value
  );
}

function isProjectSearchTranscript(value: string): boolean {
  return /项目搜索|文件匹配|Search |grep|rg |glob|Project search|File glob|search-project/iu.test(
    value
  );
}

function isFileReadTranscript(value: string): boolean {
  return /文件读取|目录列表|Git 状态|Inspect |Read |List |Directory list|File read|Git status|inspect-file|list-directory/iu.test(
    value
  );
}

function getCompactProcessedGroupTitle(kind: CompactProcessedGroupKind, language: Language): string {
  if (language === "zh-CN") {
    return {
      web: "网页搜索",
      command: "命令",
      edit: "编辑",
      search: "项目检索",
      file: "文件观察",
      error: "需要恢复",
      plan: "思考",
      other: "其他记录"
    }[kind];
  }

  return {
    web: "Web search",
    command: "Commands",
    edit: "Edits",
    search: "Project search",
    file: "File reads",
    error: "Needs recovery",
    plan: "Reasoning",
    other: "Other records"
  }[kind];
}

function getCompactProcessedGroupSummary(
  kind: CompactProcessedGroupKind,
  count: number,
  language: Language
): string {
  if (language === "zh-CN") {
    return {
      web: `已搜索网页 ${count} 次`,
      command: `已运行 ${count} 条命令`,
      edit: `已编辑 ${count} 个文件`,
      search: `已检索 ${count} 次`,
      file: `已读取 ${count} 项`,
      error: `需要恢复 ${count} 条`,
      plan: `已思考 ${count} 次`,
      other: `已处理 ${count} 条记录`
    }[kind];
  }

  return {
    web: `searched web ${count} ${count === 1 ? "time" : "times"}`,
    command: `ran ${count} command${count === 1 ? "" : "s"}`,
    edit: `edited ${count} file${count === 1 ? "" : "s"}`,
    search: `searched project ${count} ${count === 1 ? "time" : "times"}`,
    file: `read ${count} item${count === 1 ? "" : "s"}`,
    error: `needs recovery ${count}`,
    plan: `reasoned ${count} ${count === 1 ? "time" : "times"}`,
    other: `processed ${count} record${count === 1 ? "" : "s"}`
  }[kind];
}

function getCompactProcessedGroupIcon(kind: CompactProcessedGroupKind): typeof Terminal {
  return {
    web: Globe,
    command: Terminal,
    edit: FilePenLine,
    search: Search,
    file: FileSearch,
    error: Wrench,
    plan: Brain,
    other: ListChecks
  }[kind];
}

function compactProcessedDetail(value: string): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, 260);
}

function extractSourceUrlsFromEvents(events: TaskThreadEvent[]): string[] {
  return mergeUniqueStrings(events.flatMap((event) => extractSourceUrlsFromText(event.message)));
}

function stripAssistantSourceBlock(message: string): string {
  return message
    .replace(
      /\n{2,}(?:参考来源|参考资料|Sources):\s*\n(?:[-*]\s+https?:\/\/[^\n]+\n?)+\s*$/iu,
      ""
    )
    .trim();
}

function extractSourceUrls(value: string): string[] {
  return extractSourceUrlsFromText(value);
}

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatSourceUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const label = `${parsed.hostname}${path}`;

    return label.length > 76 ? `${label.slice(0, 73)}...` : label;
  } catch {
    return url.length > 76 ? `${url.slice(0, 73)}...` : url;
  }
}

function getCompactProcessedLivePreview(
  thread: TaskThread,
  hiddenEvents: TaskThreadEvent[]
): string | undefined {
  if (thread.status !== "running") {
    return undefined;
  }

  const liveEvent = [...hiddenEvents]
    .reverse()
    .find((event) => !event.completedAt && event.message.trim());

  if (!liveEvent) {
    return undefined;
  }

  return liveEvent.message.trim().replace(/\s+/gu, " ").slice(0, 180);
}

// 把事件类型压成短标签, 避免对话区出现内部术语
function getCompactEventLabel(event: TaskThreadEvent, language: Language): string {
  if (event.commandApproval) {
    return language === "zh-CN" ? "命令已批准" : "Command approved";
  }

  if (event.commandRun) {
    return language === "zh-CN" ? "正在运行命令" : "Running command";
  }

  if (event.commandResult) {
    const failed =
      event.commandResult.timedOut ||
      event.commandResult.cancelled ||
      event.commandResult.exitCode !== 0;

    return failed
      ? language === "zh-CN"
        ? "命令失败"
        : "Command failed"
      : language === "zh-CN"
        ? "命令已通过"
        : "Command passed";
  }

  if (event.kind === "error") {
    return language === "zh-CN" ? "需要恢复" : "Needs recovery";
  }

  if (event.kind === "result") {
    return language === "zh-CN" ? "输出" : "Output";
  }

  return language === "zh-CN" ? "执行记录" : "Run transcript";
}

// 查找最近命令结果, 成功和失败都可以用于上下文
function findLatestCommandResult(
  events: TaskThreadEvent[],
  action: AgentAction
): CommandRunResult | null {
  if (!action.command) {
    return null;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const result = events[index]?.commandResult;

    if (result?.actionId === action.id) {
      return result;
    }
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const result = events[index]?.commandResult;

    if (result?.command === action.command && !result.actionId) {
      return result;
    }
  }

  return null;
}

// 把受控读类工具的线程事件重新关联回队列动作, 方便用户查看每一步真实观察结果
function findLatestToolResultEvent(
  events: TaskThreadEvent[],
  action: AgentAction
): TaskThreadEvent | null {
  if (!isControlledToolResultAction(action)) {
    return null;
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (
      event?.kind === "file" &&
      event.id.includes(`-${action.id}-`) &&
      isControlledToolResultMessage(event.message)
    ) {
      return event;
    }
  }

  return null;
}

// 查找指定动作最近一次结构化执行记录, 动作详情据此展示开始, 结束和耗时
function findLatestAgentActionRunEvent(
  events: TaskThreadEvent[],
  action: AgentAction
): TaskThreadEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event?.agentActionRun?.actionId === action.id) {
      return event;
    }
  }

  return null;
}

// 查找自动恢复被门禁跳过时写入的说明, 让用户在动作详情里直接看到原因
function findLatestAutoFailureRecoverySkipEvent(
  events: TaskThreadEvent[],
  threadId: string,
  action: AgentAction
): TaskThreadEvent | null {
  const prefix = getAutoFailureRecoverySkipEventPrefix(threadId, action.id);

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event?.id.startsWith(prefix)) {
      return event;
    }
  }

  return null;
}

// 判断当前动作是否会生成可回看的受控工具输出
function isControlledToolResultAction(action: AgentAction): boolean {
  return (
    action.kind === "inspect-file" ||
    action.kind === "list-directory" ||
    action.kind === "glob-project" ||
    action.kind === "search-project" ||
    action.kind === "git-status"
  );
}

// 只接收 Agent 读类工具写入的结果事件, 避免把普通文件日志误显示成工具观察
function isControlledToolResultMessage(message: string): boolean {
  return /^(文件读取完成|File read complete|目录列表完成|Directory list complete|文件匹配完成|File glob complete|项目搜索完成|Project search complete|Git 状态完成|Git status complete):/u.test(
    message.trim()
  );
}

// 在命令历史里按 runId 找结果, 支持实时输出和最终结果对齐
function findLatestCommandRunResult(events: TaskThreadEvent[]): CommandRunResult | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const result = events[index]?.commandResult;

    if (result) {
      return result;
    }
  }

  return null;
}

// 查找命令历史里仍在运行的记录, 供命令面板持续显示
function findLatestRunningCommandHistoryEntry(
  events: TaskThreadEvent[]
): CommandHistoryEntry | null {
  return getCommandHistoryEntries(events).find((entry) => entry.status === "running") ?? null;
}

// 把命令开始和结束事件整理成时间线, 相同 runId 合并展示
function getCommandHistoryEntries(events: TaskThreadEvent[]): CommandHistoryEntry[] {
  return events
    .flatMap<CommandHistoryEntry>((event, index) => {
      if (event.commandResult) {
        return [
          {
            id: event.id,
            createdAt: event.createdAt,
            status: "finished" as const,
            result: event.commandResult
          }
        ];
      }

      if (!event.commandRun) {
        return [];
      }

      const commandRun = event.commandRun;
      const runKey = getCommandRunKey(commandRun.command, commandRun.runId);
      const hasFinishedAfter = events.slice(index + 1).some((candidate) => {
        const result = candidate.commandResult;

        return result ? getCommandRunKey(result.command, result.runId) === runKey : false;
      });

      if (hasFinishedAfter) {
        return [];
      }

      return [
        {
          id: event.id,
          createdAt: event.createdAt,
          status: "running" as const,
          result: {
            runId: commandRun.runId,
            command: commandRun.command,
            cwd: "",
            exitCode: null,
            stdout: commandRun.stdout ?? "",
            stderr: commandRun.stderr ?? "",
            timedOut: false
          }
        }
      ];
    })
    .reverse();
}

// 生成命令事件的稳定 key, 没有 runId 时回退到命令和目录
function getCommandRunKey(command: string, runId?: string): string {
  return runId ? `run:${runId}` : `command:${command}`;
}

// 把 ISO 时间格式化到秒, 不在界面暴露 T 分隔符
function formatEventTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").replace(/\.\d{3}Z$/, "");
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 把 LLM 工作耗时压成短文本, 用于输出元信息
function formatLlmWorkDuration(event: TaskThreadEvent): string {
  const started = Date.parse(event.createdAt);
  const completed = Date.parse(event.completedAt ?? event.createdAt);

  if (Number.isNaN(started) || Number.isNaN(completed)) {
    return "LLM 0s";
  }

  const seconds = Math.max(0, Math.ceil((completed - started) / 1000));

  if (seconds < 60) {
    return `LLM ${seconds}s`;
  }

  return `LLM ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// 根据反馈状态生成按钮文案, 后续反馈系统可以接入
// 把 diff 变更块操作文案集中在这里, 避免审查 UI 混入硬编码英文
function getDiffHunkCopy(language: Language): {
  hunkLabel: (index: number) => string;
  keepOnly: string;
  reject: string;
  keepOnlyAria: (index: number, relativePath: string) => string;
  rejectAria: (index: number, relativePath: string) => string;
} {
  if (language === "zh-CN") {
    return {
      hunkLabel: (index) => `变更块 ${index}`,
      keepOnly: "只接受此块",
      reject: "拒绝此块",
      keepOnlyAria: (index, relativePath) => `只接受变更块 ${index} ${relativePath}`,
      rejectAria: (index, relativePath) => `拒绝变更块 ${index} ${relativePath}`
    };
  }

  return {
    hunkLabel: (index) => `Hunk ${index}`,
    keepOnly: "Keep only hunk",
    reject: "Reject hunk",
    keepOnlyAria: (index, relativePath) => `Keep only hunk ${index} ${relativePath}`,
    rejectAria: (index, relativePath) => `Reject hunk ${index} ${relativePath}`
  };
}

// 根据反馈状态生成回答操作文案, 后续反馈系统可以接入
function getAssistantResponseActionCopy(language: Language): {
  copy: string;
  like: string;
  dislike: string;
} {
  if (language === "zh-CN") {
    return {
      copy: "复制回答",
      like: "赞同回答",
      dislike: "不赞同回答"
    };
  }

  return {
    copy: "Copy response",
    like: "Like response",
    dislike: "Dislike response"
  };
}
