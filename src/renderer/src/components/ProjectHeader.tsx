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
    <header className="mb-4 grid gap-3 rounded-[18px] border border-[rgba(148,163,184,0.16)] bg-[linear-gradient(180deg,rgba(15,26,42,0.9),rgba(11,22,38,0.9))] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#8ea0b8]">
          <span className="rounded-full border border-[rgba(148,163,184,0.16)] bg-[#08111f]/52 px-2.5 py-1">
            {t("projects.current")}
          </span>
          {scanResult ? (
            <span className="rounded-full border border-[rgba(148,163,184,0.16)] bg-[#08111f]/52 px-2.5 py-1">
              {t("projects.indexed")} {scanResult.files.length} {t("projects.files")}
              {scanResult.truncated ? `, ${t("projects.truncated")}` : ""}
            </span>
          ) : null}
          {gitSummary ? (
            <span className="rounded-full border border-[#37d67a]/26 bg-[#37d67a]/10 px-2.5 py-1 text-[#9df2bd]">
              {gitSummary}
            </span>
          ) : null}
        </div>
        <h1 className="truncate text-xl font-semibold leading-7 tracking-normal text-white">
          {project?.name ?? t("projects.empty")}
        </h1>
        {project ? <p className="mt-1 truncate text-xs text-[#718198]">{project.path}</p> : null}
        {gitNotice ? <p className="mt-2 text-xs text-[#ffb49c]">{gitNotice}</p> : null}
      </div>
      <div className="flex flex-wrap items-end justify-start gap-2 xl:justify-end">
        {project ? (
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={onRefreshGitStatus}
              className="inline-flex h-9 items-center gap-2 rounded-[13px] border border-[rgba(148,163,184,0.18)] bg-[#111e32] px-3 text-sm text-[#cbd8e8] transition hover:border-[rgba(148,163,184,0.32)] hover:bg-[#16243a] active:scale-[0.99]"
            >
              <RefreshCw className="h-4 w-4" />
              {t("projects.refreshGit")}
            </button>
            <label className="grid gap-1 text-xs text-[#8ea0b8]">
              {t("projects.commitMessage")}
              <input
                value={draftCommitMessage}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setDraftCommitMessage(nextValue);
                  onCommitMessageChange?.(nextValue);
                }}
                className="h-9 w-56 rounded-[13px] border border-[rgba(148,163,184,0.18)] bg-[#08111f]/72 px-3 text-sm text-[#dbe7f5] outline-none transition placeholder:text-[#718198] focus:border-[#4f7cff]"
              />
            </label>
            <button
              type="button"
              onClick={() => onCommitProject?.(draftCommitMessage)}
              disabled={!gitStatus?.isRepo || changedFileCount === 0}
              className="inline-flex h-9 items-center gap-2 rounded-[13px] border border-[rgba(148,163,184,0.18)] bg-[#4f7cff] px-3 text-sm font-medium text-white transition hover:bg-[#6b91ff] disabled:cursor-not-allowed disabled:bg-[#17243a] disabled:text-[#718198]"
            >
              <GitBranch className="h-4 w-4" />
              {t("projects.commit")}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onPickProject}
          className="inline-flex h-9 items-center gap-2 rounded-[13px] bg-[#ff6b3d] px-3 text-sm font-semibold text-[#08111f] shadow-[0_12px_26px_rgba(255,107,61,0.22)] transition hover:bg-[#ff815a] active:scale-[0.99]"
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
