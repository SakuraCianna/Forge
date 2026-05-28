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
  SearchCode,
  Terminal,
  TestTube2,
  Wrench
} from "lucide-react";
import type { Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import { useI18n } from "@/i18n/useI18n";
import type { TaskThread } from "@/state/taskThreads";

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
  onQuickTask?: (prompt: string) => void;
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
  onQuickTask,
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
      <section className="h-full min-h-0 overflow-auto rounded-[20px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(15,26,42,0.88),rgba(9,18,32,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center py-8">
          <div className="mb-7 max-w-2xl">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] border border-[#ff6b3d]/30 bg-[#ff6b3d]/12 text-[#ff8d6d] shadow-[0_0_44px_rgba(255,107,61,0.12)]">
              <Layers className="h-7 w-7" />
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-white">
              {t("dashboard.title")}
            </h1>
            <p className="mt-4 text-base leading-7 text-[#9fb0c7]">{t("dashboard.description")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onPickProject}
                className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#ff6b3d] px-4 text-sm font-semibold text-[#08111f] shadow-[0_16px_36px_rgba(255,107,61,0.22)] transition hover:bg-[#ff815a] active:scale-[0.99]"
              >
                {t("dashboard.pickProject")}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenRecentProject}
                className="inline-flex h-11 items-center rounded-[14px] border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a] px-4 text-sm font-semibold text-[#dbe7f5] transition hover:border-[rgba(148,163,184,0.32)] hover:bg-[#16243a] active:scale-[0.99]"
              >
                {t("dashboard.openRecent")}
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-[#dbe7f5]">{t("dashboard.quickTasks")}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: t("dashboard.analyze"), icon: SearchCode },
                { label: t("dashboard.fixBuild"), icon: Wrench },
                { label: t("dashboard.implementFeature"), icon: Code2 },
                { label: t("dashboard.generateTests"), icon: TestTube2 }
              ].map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onQuickTask?.(label)}
                  className="group rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(15,26,42,0.9),rgba(11,22,38,0.9))] p-4 text-left shadow-[0_16px_50px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-[#4f7cff]/48 hover:bg-[#142238] active:translate-y-0"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#4f7cff]/12 text-[#82a1ff] transition group-hover:bg-[#4f7cff]/18">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-semibold text-white">{label}</div>
                  <div className="mt-2 text-xs leading-5 text-[#8ea0b8]">
                    {t("dashboard.description")}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/76 p-4">
            <div className="text-sm font-semibold text-[#dbe7f5]">{t("dashboard.recentTasks")}</div>
            <div className="mt-3 rounded-[14px] border border-dashed border-[rgba(148,163,184,0.18)] bg-[#08111f]/42 px-4 py-5 text-sm text-[#8ea0b8]">
              {t("dashboard.noRecentTasks")}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!selectedThread) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center rounded-[20px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(15,26,42,0.88),rgba(9,18,32,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[16px] border border-[rgba(148,163,184,0.18)] bg-[#0f1a2a] text-[#82a1ff]">
            <Layers className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-normal text-white">{t("threads.emptyTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-[#9fb0c7]">{t("threads.emptyBody")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(15,26,42,0.92),rgba(9,18,32,0.96))] shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <aside className="min-h-0 overflow-auto border-r border-[rgba(148,163,184,0.16)] bg-[#0b1627]/74 p-3">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#718198]">
          {t("threads.listTitle")}
        </h2>
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={`w-full rounded-[14px] border px-3 py-2.5 text-left text-sm transition active:scale-[0.99] ${
                thread.id === selectedThread.id
                  ? "border-[#4f7cff]/42 bg-[#17243a] text-white shadow-[inset_3px_0_0_#4f7cff]"
                  : "border-transparent text-[#9fb0c7] hover:border-[rgba(148,163,184,0.16)] hover:bg-[#121f33]"
              }`}
            >
              <span className="block truncate font-medium">{thread.title}</span>
              <span className="mt-1 block text-xs text-[#718198]">{thread.status}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <header className="border-b border-[rgba(148,163,184,0.16)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[#37d67a]/28 bg-[#37d67a]/10 px-2.5 py-1 font-medium text-[#9df2bd]">
                  {selectedThread.status}
                </span>
                <span className="rounded-full border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a] px-2.5 py-1 text-[#8ea0b8]">
                  {t("thread.duration")}: {duration}
                </span>
                <span className="rounded-full border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a] px-2.5 py-1 text-[#8ea0b8]">
                  {t("threads.model")}: {selectedThread.modelId}
                </span>
              </div>
              <h1 className="truncate text-2xl font-semibold leading-8 tracking-normal text-white">
                {selectedThread.title}
              </h1>
            </div>
            <div className="flex rounded-[14px] border border-[rgba(148,163,184,0.16)] bg-[#0d1828] p-1">
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
                  className={`h-8 rounded-[10px] px-3 text-sm transition active:scale-[0.99] ${
                    activeTab === tab.id
                      ? "bg-[#4f7cff] text-white"
                      : "text-[#8ea0b8] hover:bg-[#142238] hover:text-[#e5edf7]"
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

    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <GitPullRequest className="h-4 w-4 text-[#82a1ff]" />
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
                    <Icon className={`h-5 w-5 ${isActive ? "text-[#4f7cff]" : "text-[#37d67a]"}`} />
                    {!isLast ? <span className="mt-2 h-full w-px bg-[rgba(148,163,184,0.18)]" /> : null}
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="text-xs uppercase tracking-[0.08em] text-[#718198]">{event.kind}</div>
                    <p className="mt-1 text-sm leading-6 text-[#dbe7f5]">{event.message}</p>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <div className="flex justify-center">
                <Circle className="h-5 w-5 text-[#718198]" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.08em] text-[#718198]">waiting</div>
                <p className="mt-1 text-sm leading-6 text-[#9fb0c7]">{t("threads.command")}</p>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">{t("thread.agentOutput")}</h2>
            <p className="text-sm leading-6 text-[#9fb0c7]">
              {selectedThread?.events.at(-1)?.message ?? t("threads.emptyBody")}
            </p>
          </section>
          <section className="rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">{t("thread.testResults")}</h2>
            <div className="flex items-center gap-2 rounded-[14px] bg-[#37d67a]/10 px-3 py-2 text-sm text-[#9df2bd]">
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
        <section className="rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <FileText className="h-4 w-4 text-[#82a1ff]" />
            {t("threads.projectFiles")}
          </h2>
          {selectedFilePaths.length > 0 && onGenerateSelectedFileChanges ? (
            <button
              type="button"
              onClick={() => onGenerateSelectedFileChanges(selectedFilePaths)}
              className="mb-3 w-full rounded-[14px] bg-[#ff6b3d] px-2 py-2 text-xs font-semibold text-[#08111f] transition hover:bg-[#ff815a] active:scale-[0.99]"
            >
              {t("threads.generateSelectedAiChanges")}
            </button>
          ) : null}
          <div className="max-h-64 space-y-1 overflow-auto pr-1">
            {projectScan?.files.slice(0, 32).map((file) => (
              <div key={file.relativePath} className="flex items-center gap-2 rounded-[12px] hover:bg-[#142238]">
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
                    className="ml-2 h-3.5 w-3.5 accent-[#4f7cff]"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onPreviewFile(file.relativePath)}
                  className="block min-w-0 flex-1 truncate rounded-[12px] px-2 py-1.5 text-left text-xs text-[#cbd8e8]"
                >
                  {file.relativePath}
                </button>
              </div>
            )) ?? <p className="text-sm text-[#718198]">{t("threads.emptyBody")}</p>}
          </div>
          {allChangePreviews.length > 0 ? (
            <div className="mt-4 border-t border-[rgba(148,163,184,0.16)] pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase text-[#718198]">
                {t("threads.pendingChanges")}
              </h3>
              <div className="mb-2 flex flex-wrap gap-2">
                {onApplyAllChanges ? (
                  <button
                    type="button"
                    onClick={onApplyAllChanges}
                    className="rounded-[12px] bg-[#37d67a] px-2 py-1 text-xs font-semibold text-[#08111f] hover:bg-[#62e697]"
                  >
                    {t("threads.applyAllChanges")}
                  </button>
                ) : null}
                {onDiscardAllChanges ? (
                  <button
                    type="button"
                    onClick={onDiscardAllChanges}
                    className="rounded-[12px] border border-[rgba(148,163,184,0.18)] px-2 py-1 text-xs text-[#cbd8e8] hover:bg-[#142238]"
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
                        ? "bg-[#ff6b3d]/12 text-[#ffb49c]"
                        : "text-[#cbd8e8] hover:bg-[#142238]"
                    }`}
                  >
                    {preview.relativePath}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[14px] border border-dashed border-[rgba(148,163,184,0.18)] px-3 py-4 text-sm text-[#718198]">
              {t("thread.noChanges")}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Code2 className="h-4 w-4 text-[#82a1ff]" />
            {t("threads.filePreview")}
          </h2>
          {previewFile ? (
            <div className="grid gap-3">
              {canEditPreview ? (
                <>
                  <label className="grid gap-2 text-sm text-[#cbd8e8]">
                    <span>{t("threads.editContent")}</span>
                    <textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.currentTarget.value)}
                      className="min-h-48 resize-y rounded-[16px] border border-[rgba(148,163,184,0.18)] bg-[#08111f]/82 p-3 font-mono text-xs leading-5 text-[#dbe7f5] outline-none transition focus:border-[#4f7cff]"
                      spellCheck={false}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onPreviewChange?.(previewFile.relativePath, draftContent)}
                      className="h-9 rounded-[13px] border border-[rgba(148,163,184,0.18)] bg-[#111e32] px-3 text-sm font-medium text-[#dbe7f5] hover:bg-[#16243a]"
                    >
                      {t("threads.generateDiff")}
                    </button>
                    {onGenerateFileChange ? (
                      <button
                        type="button"
                        onClick={() => onGenerateFileChange(previewFile.relativePath, draftContent)}
                        className="h-9 rounded-[13px] border border-[rgba(148,163,184,0.18)] bg-[#111e32] px-3 text-sm font-medium text-[#dbe7f5] hover:bg-[#16243a]"
                      >
                        {t("threads.generateAiChange")}
                      </button>
                    ) : null}
                    {visibleChangePreview && onDiscardChange ? (
                      <button
                        type="button"
                        onClick={() => onDiscardChange(visibleChangePreview.relativePath)}
                        className="h-9 rounded-[13px] border border-[#ff6b3d]/24 bg-[#ff6b3d]/10 px-3 text-sm font-medium text-[#ffb49c] hover:bg-[#ff6b3d]/16"
                      >
                        {t("threads.discardChange")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onApplyChange?.(previewFile.relativePath, draftContent)}
                      className="h-9 rounded-[13px] bg-[#37d67a] px-3 text-sm font-semibold text-[#08111f] hover:bg-[#62e697]"
                    >
                      {t("threads.applyChange")}
                    </button>
                  </div>
                </>
              ) : (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[16px] border border-[rgba(148,163,184,0.16)] bg-[#08111f]/82 p-3 text-xs leading-5 text-[#dbe7f5]">
                  {previewFile.content}
                </pre>
              )}
              {visibleChangePreview ? (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[16px] border border-[rgba(148,163,184,0.16)] bg-[#08111f]/82 p-3 font-mono text-xs leading-5 text-[#9fb0c7]">
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
                              : "text-[#8ea0b8]"
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
            <div className="rounded-[16px] border border-dashed border-[rgba(148,163,184,0.18)] px-4 py-10 text-center text-sm text-[#718198]">
              {t("threads.filePreview")}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderCommandsTab(): ReactElement {
    return (
      <section className="rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-4">
        <label className="grid gap-3 text-sm text-[#cbd8e8]">
          <span className="flex items-center gap-2 font-semibold text-white">
            <Terminal className="h-4 w-4 text-[#82a1ff]" />
            {t("threads.command")}
          </span>
          <div className="flex gap-2">
            <input
              value={command}
              onChange={(event) => setCommand(event.currentTarget.value)}
              className="h-10 flex-1 rounded-[14px] border border-[rgba(148,163,184,0.18)] bg-[#08111f]/82 px-3 text-sm text-[#dbe7f5] outline-none transition placeholder:text-[#718198] focus:border-[#4f7cff]"
              placeholder="npm test"
            />
            <button
              type="button"
              onClick={submitCommand}
              className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-[#4f7cff] px-4 text-sm font-semibold text-white hover:bg-[#6b91ff] active:scale-[0.99]"
            >
              <Play className="h-4 w-4 fill-current" />
              {t("threads.runCommand")}
            </button>
          </div>
        </label>
      </section>
    );
  }

  function renderLogsTab(): ReactElement {
    return (
      <div className="space-y-2">
        {selectedThread?.events.map((event) => (
          <article
            key={event.id}
            className="rounded-[16px] border border-[rgba(148,163,184,0.16)] bg-[#0f1a2a]/82 p-3"
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#718198]">
              {event.kind}
            </div>
            <p className="text-sm leading-6 text-[#dbe7f5]">{event.message}</p>
          </article>
        ))}
        {selectedThread?.events.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[rgba(148,163,184,0.18)] px-4 py-8 text-center text-sm text-[#718198]">
            {t("thread.noLogs")}
          </div>
        ) : null}
      </div>
    );
  }
}
