import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Code2, FileText, Layers, Terminal } from "lucide-react";
import type { Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import { useI18n } from "@/i18n/useI18n";
import type { TaskThread } from "@/state/taskThreads";

type ThreadWorkspaceProps = {
  language: Language;
  selectedThreadId: string | null;
  threads: TaskThread[];
  projectScan: ProjectScanResult | null;
  previewFile: ProjectTextFile | null;
  changePreview: ProjectFileChangePreview | null;
  changePreviews?: ProjectFileChangePreview[];
  onSelectThread: (threadId: string) => void;
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

export function ThreadWorkspace({
  language,
  selectedThreadId,
  threads,
  projectScan,
  previewFile,
  changePreview,
  changePreviews,
  onSelectThread,
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
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const allChangePreviews = changePreviews ?? (changePreview ? [changePreview] : []);
  const shouldShowChangeSet = Boolean(changePreviews?.length);
  const visibleChangePreview = previewFile
    ? (allChangePreviews.find((preview) => preview.relativePath === previewFile.relativePath) ??
      null)
    : null;
  const canEditPreview = Boolean(onPreviewChange || onApplyChange || onGenerateFileChange);

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

  if (!selectedThread) {
    return (
      <section className="flex h-full min-h-[420px] items-center justify-center rounded-md border border-[#e0e5ec] bg-white p-6 shadow-[0_12px_36px_rgba(31,35,40,0.06)]">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-[#e0e5ec] bg-[#f6f8fb] text-[#3f4752]">
            <Layers className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-normal text-[#202124]">{t("threads.emptyTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("threads.emptyBody")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid h-full min-h-[420px] grid-cols-[268px_minmax(0,1fr)] overflow-hidden rounded-md border border-[#e0e5ec] bg-white shadow-[0_12px_36px_rgba(31,35,40,0.06)]">
      <aside className="min-h-0 overflow-auto border-r border-[#e6ebf1] bg-[#f7f9fc] p-3">
        <h2 className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase text-[#6b7280]">
          <Layers className="h-4 w-4 text-[#596171]" />
          {t("threads.listTitle")}
        </h2>
        <div className="space-y-1.5">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={`w-full rounded-md border px-3 py-2.5 text-left text-sm transition ${
                thread.id === selectedThread.id
                  ? "border-[#d9e0e8] bg-white text-[#202124] shadow-sm"
                  : "border-transparent text-[#4b5563] hover:border-[#e0e5ec] hover:bg-white"
              }`}
            >
              <span className="block truncate font-medium">{thread.title}</span>
              <span className="mt-1 block text-xs text-[#7a828e]">{thread.status}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 overflow-auto p-4">
        <div className="mb-4 rounded-md border border-[#e3e8ef] bg-[#fbfcfe] p-4">
          <p className="text-xs font-semibold uppercase text-[#6b7280]">{t("threads.prompt")}</p>
          <h1 className="mt-1 text-2xl font-semibold leading-8 tracking-normal text-[#202124]">
            {selectedThread.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#4b5563]">
            <span className="rounded-md border border-[#e0e5ec] bg-white px-2 py-1">
              {t("threads.model")}: {selectedThread.modelId}
            </span>
            <span className="rounded-md border border-[#e0e5ec] bg-white px-2 py-1">
              {t("selector.intelligence")}: {selectedThread.intelligence}
            </span>
            <span className="rounded-md border border-[#e0e5ec] bg-white px-2 py-1">
              {t("selector.speed")}: {selectedThread.speed}
            </span>
            <span className="rounded-md border border-[#d9eadf] bg-[#f1fbf4] px-2 py-1 text-[#207344]">
              {t("threads.status")}: {selectedThread.status}
            </span>
          </div>
        </div>

        {projectScan ? (
          <div className="mb-4 grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
            <section className="rounded-md border border-[#e3e8ef] bg-[#fbfcfe] p-3">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202124]">
                <FileText className="h-4 w-4 text-[#596171]" />
                {t("threads.projectFiles")}
              </h2>
              {selectedFilePaths.length > 0 && onGenerateSelectedFileChanges ? (
                <button
                  type="button"
                  onClick={() => onGenerateSelectedFileChanges(selectedFilePaths)}
                  className="mb-3 w-full rounded-md bg-[#1f2328] px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-[#343941]"
                >
                  {t("threads.generateSelectedAiChanges")}
                </button>
              ) : null}
              <div className="max-h-52 space-y-1 overflow-auto pr-1">
                {projectScan.files.slice(0, 24).map((file) => (
                  <div key={file.relativePath} className="flex items-center gap-2 rounded-md hover:bg-[#eef3f8]">
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
                        className="ml-2 h-3.5 w-3.5 accent-[#1f2328]"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onPreviewFile(file.relativePath)}
                      className="block min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs text-[#3f4752]"
                    >
                      {file.relativePath}
                    </button>
                  </div>
                ))}
              </div>
              {shouldShowChangeSet ? (
                <div className="mt-4 border-t border-[#e3e8ef] pt-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-[#6b7280]">
                    {t("threads.pendingChanges")}
                  </h3>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {onApplyAllChanges ? (
                      <button
                        type="button"
                        onClick={onApplyAllChanges}
                        className="rounded-md bg-[#1f2328] px-2 py-1 text-xs font-semibold text-white hover:bg-[#343941]"
                      >
                        {t("threads.applyAllChanges")}
                      </button>
                    ) : null}
                    {onDiscardAllChanges ? (
                      <button
                        type="button"
                        onClick={onDiscardAllChanges}
                        className="rounded-md border border-[#d9e0e8] bg-white px-2 py-1 text-xs text-[#3f4752] hover:bg-[#f3f6f9]"
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
                        className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                          previewFile?.relativePath === preview.relativePath
                            ? "bg-[#fff2e8] text-[#a34a00]"
                            : "text-[#3f4752] hover:bg-[#eef3f8]"
                        }`}
                      >
                        {preview.relativePath}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
            <section className="min-w-0 rounded-md border border-[#e3e8ef] bg-[#fbfcfe] p-3">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202124]">
                <Code2 className="h-4 w-4 text-[#596171]" />
                {t("threads.filePreview")}
              </h2>
              {previewFile ? (
                <div className="grid gap-3">
                  {canEditPreview ? (
                    <>
                      {draftContent !== previewFile.content ? (
                        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-[#e3e8ef] bg-white p-3 text-xs leading-5 text-[#202124]">
                          {previewFile.content}
                        </pre>
                      ) : null}
                      <label className="grid gap-2 text-sm text-[#3f4752]">
                        <span>{t("threads.editContent")}</span>
                        <textarea
                          value={draftContent}
                          onChange={(event) => setDraftContent(event.currentTarget.value)}
                          className="min-h-44 resize-y rounded-md border border-[#d9e0e8] bg-white p-3 font-mono text-xs leading-5 text-[#202124] outline-none transition focus:border-[#1f2328]"
                          spellCheck={false}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onPreviewChange?.(previewFile.relativePath, draftContent)}
                          className="h-9 rounded-md border border-[#d9e0e8] bg-white px-3 text-sm font-medium text-[#3f4752] hover:bg-[#f3f6f9]"
                        >
                          {t("threads.generateDiff")}
                        </button>
                        {onGenerateFileChange ? (
                          <button
                            type="button"
                            onClick={() => onGenerateFileChange(previewFile.relativePath, draftContent)}
                            className="h-9 rounded-md border border-[#d9e0e8] bg-white px-3 text-sm font-medium text-[#3f4752] hover:bg-[#f3f6f9]"
                          >
                            {t("threads.generateAiChange")}
                          </button>
                        ) : null}
                        {visibleChangePreview && onDiscardChange ? (
                          <button
                            type="button"
                            onClick={() => onDiscardChange(visibleChangePreview.relativePath)}
                            className="h-9 rounded-md border border-[#f0c9c5] bg-[#fff5f4] px-3 text-sm font-medium text-[#b42318] hover:bg-[#ffe9e6]"
                          >
                            {t("threads.discardChange")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onApplyChange?.(previewFile.relativePath, draftContent)}
                          className="h-9 rounded-md bg-[#1f2328] px-3 text-sm font-semibold text-white hover:bg-[#343941]"
                        >
                          {t("threads.applyChange")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-[#e3e8ef] bg-white p-3 text-xs leading-5 text-[#202124]">
                      {previewFile.content}
                    </pre>
                  )}
                  {visibleChangePreview ? (
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-[#e3e8ef] bg-white p-3 font-mono text-xs leading-5 text-[#3f4752]">
                      {visibleChangePreview.diff.map((line, index) => {
                        const prefix =
                          line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  ";

                        return (
                          <div
                            key={`${line.kind}-${index}`}
                            className={
                              line.kind === "add"
                                ? "text-[#14883f]"
                                : line.kind === "remove"
                                  ? "text-[#c43b2d]"
                                  : "text-[#7a828e]"
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
              ) : null}
            </section>
          </div>
        ) : null}

        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#202124]">
          <Layers className="h-4 w-4 text-[#596171]" />
          {t("threads.detailTitle")}
        </h2>
        <div className="space-y-2">
          {selectedThread.events.map((event) => (
            <article key={event.id} className="rounded-md border border-[#e3e8ef] bg-[#fbfcfe] p-3">
              <div className="mb-1 text-xs font-semibold uppercase text-[#6b7280]">{event.kind}</div>
              <p className="text-sm leading-6 text-[#202124]">{event.message}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-md border border-[#e3e8ef] bg-[#fbfcfe] p-3">
          <label className="grid gap-2 text-sm text-[#3f4752]">
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#596171]" />
              {t("threads.command")}
            </span>
            <div className="flex gap-2">
              <input
                value={command}
                onChange={(event) => setCommand(event.currentTarget.value)}
                className="h-9 flex-1 rounded-md border border-[#d9e0e8] bg-white px-3 text-sm text-[#202124] outline-none transition focus:border-[#1f2328]"
              />
              <button
                type="button"
                onClick={submitCommand}
                className="h-9 rounded-md bg-[#1f2328] px-3 text-sm font-semibold text-white hover:bg-[#343941]"
              >
                {t("threads.runCommand")}
              </button>
            </div>
          </label>
        </div>
      </div>
    </section>
  );
}
