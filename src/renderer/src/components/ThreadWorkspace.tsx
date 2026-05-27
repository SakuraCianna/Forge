import type { ReactElement } from "react";
import { useEffect, useState } from "react";
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
  onGenerateFileChange?: (relativePath: string, currentContent: string) => void;
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
  onGenerateFileChange
}: ThreadWorkspaceProps): ReactElement {
  const { t } = useI18n(language);
  const [command, setCommand] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const allChangePreviews = changePreviews ?? (changePreview ? [changePreview] : []);
  const shouldShowChangeSet = Boolean(changePreviews?.length);
  const visibleChangePreview =
    previewFile
      ? (allChangePreviews.find((preview) => preview.relativePath === previewFile.relativePath) ?? null)
      : null;
  const canEditPreview = Boolean(onPreviewChange || onApplyChange || onGenerateFileChange);

  useEffect(() => {
    setDraftContent(visibleChangePreview?.nextContent ?? previewFile?.content ?? "");
  }, [previewFile, visibleChangePreview?.relativePath, visibleChangePreview?.nextContent]);

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
      <section className="flex min-h-[360px] flex-1 items-center justify-center rounded-md border border-white/10 bg-[#15161a] p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-normal">{t("threads.emptyTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-[#a8a29a]">{t("threads.emptyBody")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid min-h-[360px] flex-1 grid-cols-[280px_1fr] overflow-hidden rounded-md border border-white/10 bg-[#15161a]">
      <aside className="border-r border-white/10 bg-[#191a1f] p-4">
        <h2 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("threads.listTitle")}</h2>
        <div className="space-y-2">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                thread.id === selectedThread.id
                  ? "bg-[#f5f4ef] text-[#222]"
                  : "bg-white/5 text-[#d7d3ca] hover:bg-white/8"
              }`}
            >
              <span className="block truncate font-medium">{thread.title}</span>
              <span className="mt-1 block text-xs opacity-70">{thread.status}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 p-5">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-normal text-[#a8a29a]">{t("threads.prompt")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">{selectedThread.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#d7d3ca]">
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("threads.model")}: {selectedThread.modelId}
            </span>
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("selector.intelligence")}: {selectedThread.intelligence}
            </span>
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("selector.speed")}: {selectedThread.speed}
            </span>
            <span className="rounded-md bg-white/8 px-2 py-1">
              {t("threads.status")}: {selectedThread.status}
            </span>
          </div>
        </div>

        {projectScan ? (
          <div className="mb-5 grid gap-3 lg:grid-cols-[260px_1fr]">
            <section className="rounded-md border border-white/10 bg-[#191a1f] p-3">
              <h2 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("threads.projectFiles")}</h2>
              <div className="max-h-44 space-y-1 overflow-auto">
                {projectScan.files.slice(0, 24).map((file) => (
                  <button
                    key={file.relativePath}
                    type="button"
                    onClick={() => onPreviewFile(file.relativePath)}
                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-[#d7d3ca] hover:bg-white/8"
                  >
                    {file.relativePath}
                  </button>
                ))}
              </div>
              {shouldShowChangeSet ? (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <h3 className="mb-2 text-xs font-medium text-[#a8a29a]">
                    {t("threads.pendingChanges")}
                  </h3>
                  <div className="space-y-1">
                    {allChangePreviews.map((preview) => (
                      <button
                        key={preview.relativePath}
                        type="button"
                        aria-label={`Pending change ${preview.relativePath}`}
                        onClick={() => onPreviewFile(preview.relativePath)}
                        className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                          previewFile?.relativePath === preview.relativePath
                            ? "bg-[#f5f4ef] text-[#222]"
                            : "text-[#d7d3ca] hover:bg-white/8"
                        }`}
                      >
                        {preview.relativePath}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
            <section className="min-w-0 rounded-md border border-white/10 bg-[#191a1f] p-3">
              <h2 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("threads.filePreview")}</h2>
              {previewFile ? (
                <div className="grid gap-3">
                  {canEditPreview ? (
                    <>
                      {draftContent !== previewFile.content ? (
                        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-[#101114] p-3 text-xs leading-5 text-[#f5f4ef]">
                          {previewFile.content}
                        </pre>
                      ) : null}
                      <label className="grid gap-2 text-sm text-[#d7d3ca]">
                        <span>{t("threads.editContent")}</span>
                        <textarea
                          value={draftContent}
                          onChange={(event) => setDraftContent(event.currentTarget.value)}
                          className="min-h-40 resize-y rounded-md border border-white/10 bg-[#101114] p-3 font-mono text-xs leading-5 text-[#f5f4ef] outline-none focus:border-[#f5f4ef]/50"
                          spellCheck={false}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onPreviewChange?.(previewFile.relativePath, draftContent)}
                          className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-[#f5f4ef] hover:bg-white/8"
                        >
                          {t("threads.generateDiff")}
                        </button>
                        {onGenerateFileChange ? (
                          <button
                            type="button"
                            onClick={() => onGenerateFileChange(previewFile.relativePath, draftContent)}
                            className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-[#f5f4ef] hover:bg-white/8"
                          >
                            {t("threads.generateAiChange")}
                          </button>
                        ) : null}
                        {visibleChangePreview && onDiscardChange ? (
                          <button
                            type="button"
                            onClick={() => onDiscardChange(visibleChangePreview.relativePath)}
                            className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-[#f5f4ef] hover:bg-white/8"
                          >
                            {t("threads.discardChange")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onApplyChange?.(previewFile.relativePath, draftContent)}
                          className="h-9 rounded-md bg-[#f5f4ef] px-3 text-sm font-medium text-[#222] hover:bg-white"
                        >
                          {t("threads.applyChange")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-[#101114] p-3 text-xs leading-5 text-[#f5f4ef]">
                      {previewFile.content}
                    </pre>
                  )}
                  {visibleChangePreview ? (
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-[#101114] p-3 font-mono text-xs leading-5 text-[#d7d3ca]">
                      {visibleChangePreview.diff.map((line, index) => {
                        const prefix =
                          line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  ";

                        return (
                          <div
                            key={`${line.kind}-${index}`}
                            className={
                              line.kind === "add"
                                ? "text-[#91d18b]"
                                : line.kind === "remove"
                                  ? "text-[#f28b82]"
                                  : "text-[#a8a29a]"
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

        <h2 className="mb-3 text-sm font-medium text-[#d7d3ca]">{t("threads.detailTitle")}</h2>
        <div className="space-y-2">
          {selectedThread.events.map((event) => (
            <article key={event.id} className="rounded-md border border-white/10 bg-[#1d1f24] p-3">
              <div className="mb-1 text-xs text-[#a8a29a]">{event.kind}</div>
              <p className="text-sm leading-6 text-[#f5f4ef]">{event.message}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-md border border-white/10 bg-[#191a1f] p-3">
          <label className="grid gap-2 text-sm text-[#d7d3ca]">
            {t("threads.command")}
            <div className="flex gap-2">
              <input
                value={command}
                onChange={(event) => setCommand(event.currentTarget.value)}
                className="h-9 flex-1 rounded-md border border-white/10 bg-[#101114] px-3 text-sm text-[#f5f4ef] outline-none"
              />
              <button
                type="button"
                onClick={submitCommand}
                className="h-9 rounded-md bg-[#f5f4ef] px-3 text-sm font-medium text-[#222] hover:bg-white"
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
