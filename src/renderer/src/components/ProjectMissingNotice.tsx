import type { ReactElement } from "react";
import { CircleAlert, Trash2 } from "lucide-react";
import type { Language } from "@shared/modelTypes";

export function ProjectMissingNotice({
  language,
  onRemove,
  projectPath
}: {
  language: Language;
  onRemove: () => void;
  projectPath: string;
}): ReactElement {
  const copy = getProjectMissingCopy(language);

  return (
    <section className="rounded-[16px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-[#991b1b] shadow-[0_8px_24px_rgba(153,27,27,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{copy.title}</span>
            <span className="mt-1 block text-xs leading-5 text-[#b42318]">{copy.description}</span>
            <span className="mt-1 block truncate font-mono text-[11px] text-[#7f1d1d]">
              {projectPath}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#fecaca] bg-white px-2.5 text-xs font-semibold text-[#b42318] transition hover:bg-[#ffe4e6]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {copy.remove}
        </button>
      </div>
    </section>
  );
}

function getProjectMissingCopy(language: Language): {
  description: string;
  remove: string;
  title: string;
} {
  if (language === "zh-CN") {
    return {
      description: "项目文件夹可能已被移动或删除, 请重新选择项目或移除这条旧记录",
      remove: "移除项目记录",
      title: "该项目不存在"
    };
  }

  return {
    description: "The project folder may have been moved or deleted. Choose it again or remove this stale record.",
    remove: "Remove project record",
    title: "Project does not exist"
  };
}
