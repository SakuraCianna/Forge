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

  useEffect(() => {
    setDraftCommitMessage(commitMessage);
  }, [commitMessage]);

  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-[#15161a] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-[#a8a29a]">{t("projects.current")}</p>
        <h1 className="mt-1 truncate text-lg font-semibold tracking-normal">
          {project?.name ?? t("projects.empty")}
        </h1>
        {project ? <p className="mt-1 truncate text-xs text-[#a8a29a]">{project.path}</p> : null}
        {scanResult ? (
          <p className="mt-1 text-xs text-[#a8a29a]">
            {t("projects.indexed")} {scanResult.files.length} {t("projects.files")}
            {scanResult.truncated ? `, ${t("projects.truncated")}` : ""}
          </p>
        ) : null}
        {gitSummary ? <p className="mt-1 text-xs text-[#a8a29a]">{gitSummary}</p> : null}
        {gitNotice ? <p className="mt-1 text-xs text-[#f4d58d]">{gitNotice}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {project ? (
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={onRefreshGitStatus}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-[#d7d3ca] hover:bg-white/8"
            >
              <RefreshCw className="h-4 w-4" />
              {t("projects.refreshGit")}
            </button>
            <label className="grid gap-1 text-xs text-[#a8a29a]">
              {t("projects.commitMessage")}
              <input
                value={draftCommitMessage}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setDraftCommitMessage(nextValue);
                  onCommitMessageChange?.(nextValue);
                }}
                className="h-9 w-52 rounded-md border border-white/10 bg-[#101114] px-2 text-sm text-[#f5f4ef] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => onCommitProject?.(draftCommitMessage)}
              disabled={!gitStatus?.isRepo || gitStatus.changedFiles.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-[#d7d3ca] hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GitBranch className="h-4 w-4" />
              {t("projects.commit")}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onPickProject}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#f5f4ef] px-3 text-sm font-medium text-[#222] hover:bg-white"
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
