import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { FolderOpen, GitBranch, RefreshCw } from "lucide-react";
import type { Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import type { ProjectGitStatus } from "@shared/gitTypes";
import { useI18n } from "@/i18n/useI18n";
import type { ForgeProject } from "@/state/projects";

type ProjectHeaderProps = {
  language: Language;
  project: ForgeProject | null;
  scanResult?: ProjectScanResult | null;
  gitStatus?: ProjectGitStatus | null;
  gitNotice?: string | null;
  commitMessage?: string;
  onCommitMessageChange?: (message: string) => void;
  onCommitProject?: (message: string) => void;
  onPickProject: () => void;
  onRefreshGitStatus?: () => void;
};

export function ProjectHeader({
  language,
  project,
  scanResult = null,
  gitStatus = null,
  gitNotice = null,
  commitMessage = "",
  onCommitMessageChange,
  onCommitProject,
  onPickProject,
  onRefreshGitStatus
}: ProjectHeaderProps): ReactElement {
  const { t } = useI18n(language);
  const [draftCommitMessage, setDraftCommitMessage] = useState(commitMessage);
  const gitSummary = createGitSummary(gitStatus);
  const changedFileCount = gitStatus?.changedFiles.length ?? 0;

  useEffect(() => {
    setDraftCommitMessage(commitMessage);
  }, [commitMessage]);

  return (
    <header className="mb-4 grid gap-3 rounded-md border border-[#e0e5ec] bg-white px-4 py-3 shadow-[0_12px_36px_rgba(31,35,40,0.06)] xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#6b7280]">
          <span className="rounded-md border border-[#e3e8ef] bg-[#f7f9fc] px-2 py-1">
            {t("projects.current")}
          </span>
          {scanResult ? (
            <span className="rounded-md border border-[#e3e8ef] bg-[#f7f9fc] px-2 py-1">
              {t("projects.indexed")} {scanResult.files.length} {t("projects.files")}
              {scanResult.truncated ? `, ${t("projects.truncated")}` : ""}
            </span>
          ) : null}
          {gitSummary ? (
            <span className="rounded-md border border-[#d9eadf] bg-[#f1fbf4] px-2 py-1 text-[#207344]">
              {gitSummary}
            </span>
          ) : null}
        </div>
        <h1 className="truncate text-xl font-semibold leading-7 tracking-normal text-[#202124]">
          {project?.name ?? t("projects.empty")}
        </h1>
        {project ? <p className="mt-1 truncate text-xs text-[#7a828e]">{project.path}</p> : null}
        {gitNotice ? <p className="mt-2 text-xs text-[#a35400]">{gitNotice}</p> : null}
      </div>
      <div className="flex flex-wrap items-end justify-start gap-2 xl:justify-end">
        {project ? (
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={onRefreshGitStatus}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d9e0e8] bg-white px-3 text-sm text-[#3f4752] transition hover:border-[#bfc9d5] hover:bg-[#f7f9fc]"
            >
              <RefreshCw className="h-4 w-4" />
              {t("projects.refreshGit")}
            </button>
            <label className="grid gap-1 text-xs text-[#6b7280]">
              {t("projects.commitMessage")}
              <input
                value={draftCommitMessage}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setDraftCommitMessage(nextValue);
                  onCommitMessageChange?.(nextValue);
                }}
                className="h-9 w-56 rounded-md border border-[#d9e0e8] bg-[#f8fafc] px-3 text-sm text-[#202124] outline-none transition placeholder:text-[#98a2b3] focus:border-[#1f2328] focus:bg-white"
              />
            </label>
            <button
              type="button"
              onClick={() => onCommitProject?.(draftCommitMessage)}
              disabled={!gitStatus?.isRepo || changedFileCount === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d9e0e8] bg-[#1f2328] px-3 text-sm font-medium text-white transition hover:bg-[#343941] disabled:cursor-not-allowed disabled:bg-[#edf1f5] disabled:text-[#98a2b3]"
            >
              <GitBranch className="h-4 w-4" />
              {t("projects.commit")}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onPickProject}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#e7772e] px-3 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(231,119,46,0.18)] transition hover:bg-[#d46624]"
        >
          <FolderOpen className="h-4 w-4" />
          {t("projects.pick")}
        </button>
      </div>
    </header>
  );

  function createGitSummary(status: ProjectGitStatus | null): string | null {
    if (!status) {
      return null;
    }

    if (!status.isRepo) {
      return t("projects.gitNotRepo");
    }

    if (status.changedFiles.length === 0) {
      return t("projects.gitClean");
    }

    return t("projects.gitChanged").replace("{count}", String(status.changedFiles.length));
  }
}
