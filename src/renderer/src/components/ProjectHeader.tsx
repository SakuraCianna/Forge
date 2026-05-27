import type { ReactElement } from "react";
import { FolderOpen } from "lucide-react";
import type { Language } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";
import { useI18n } from "@/i18n/useI18n";
import type { ForgeProject } from "@/state/projects";

type ProjectHeaderProps = {
  language: Language;
  project: ForgeProject | null;
  scanResult?: ProjectScanResult | null;
  onPickProject: () => void;
};

export function ProjectHeader({
  language,
  project,
  scanResult = null,
  onPickProject
}: ProjectHeaderProps): ReactElement {
  const { t } = useI18n(language);

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
      </div>
      <button
        type="button"
        onClick={onPickProject}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-[#f5f4ef] px-3 text-sm font-medium text-[#222] hover:bg-white"
      >
        <FolderOpen className="h-4 w-4" />
        {t("projects.pick")}
      </button>
    </header>
  );
}
