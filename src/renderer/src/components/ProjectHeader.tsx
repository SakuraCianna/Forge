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
    <header className="mb-4 grid gap-3 rounded-[18px] border border-[#ececf1] bg-white px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.04)] xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#6e6e80]">
          <span className="rounded-full border border-[#ececf1] bg-[#f7f7f8] px-2.5 py-1">
            {t("projects.current")}
          </span>
          {scanResult ? (
            <span className="rounded-full border border-[#ececf1] bg-[#f7f7f8] px-2.5 py-1">
              {t("projects.indexed")} {scanResult.files.length} {t("projects.files")}
              {scanResult.truncated ? `, ${t("projects.truncated")}` : ""}
            </span>
          ) : null}
          {gitSummary ? (
            <span className="rounded-full border border-[#c3eadc] bg-[#effaf6] px-2.5 py-1 text-[#087443]">
              {gitSummary}
            </span>
          ) : null}
        </div>
        <h1 className="truncate text-xl font-semibold leading-7 tracking-normal text-[#202123]">
          {project?.name ?? t("projects.empty")}
        </h1>
        {project ? <p className="mt-1 truncate text-xs text-[#6e6e80]">{project.path}</p> : null}
        {gitNotice ? <p className="mt-2 text-xs text-[#b45309]">{gitNotice}</p> : null}
      </div>
      <div className="flex flex-wrap items-end justify-start gap-2 xl:justify-end">
        {project ? (
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={onRefreshGitStatus}
              className="inline-flex h-9 items-center gap-2 rounded-[13px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] transition hover:bg-[#f7f7f8] active:scale-[0.99]"
            >
              <RefreshCw className="h-4 w-4" />
              {t("projects.refreshGit")}
            </button>
            <label className="grid gap-1 text-xs text-[#6e6e80]">
              {t("projects.commitMessage")}
              <input
                value={draftCommitMessage}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setDraftCommitMessage(nextValue);
                  onCommitMessageChange?.(nextValue);
                }}
                className="h-9 w-56 rounded-[13px] border border-[#d9d9e3] bg-white px-3 text-sm text-[#202123] outline-none transition placeholder:text-[#8e8ea0] focus:border-[#202123]"
              />
            </label>
            <button
              type="button"
              onClick={() => onCommitProject?.(draftCommitMessage)}
              disabled={!gitStatus?.isRepo || changedFileCount === 0}
              className="inline-flex h-9 items-center gap-2 rounded-[13px] bg-[#202123] px-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#ececf1] disabled:text-[#8e8ea0]"
            >
              <GitBranch className="h-4 w-4" />
              {t("projects.commit")}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onPickProject}
          className="inline-flex h-9 items-center gap-2 rounded-[13px] bg-[#202123] px-3 text-sm font-semibold text-white transition hover:bg-black active:scale-[0.99]"
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
