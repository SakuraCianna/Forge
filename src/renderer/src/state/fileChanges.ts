// 本文件说明: 管理模型生成但尚未写入磁盘的文件变更预览
import type { ProjectFileChangePreview } from "@shared/fileTypes";

export type FileChangePreviewSource = NonNullable<ProjectFileChangePreview["source"]>;

type AutoApplyGeneratedFileChangeOptions = {
  fullAccess: boolean;
  hasActionSource: boolean;
};

// 完全访问只自动应用 Agent 已规划出的文件生成动作, 手工预览仍留给用户确认。
export function shouldAutoApplyGeneratedFileChange({
  fullAccess,
  hasActionSource
}: AutoApplyGeneratedFileChangeOptions): boolean {
  return fullAccess && hasActionSource;
}

// 给文件变更预览挂上 Agent 来源, 后续应用或丢弃时能回写动作状态
export function attachFileChangePreviewSource(
  preview: ProjectFileChangePreview,
  source: FileChangePreviewSource | null
): ProjectFileChangePreview {
  if (!source) {
    return preview;
  }

  return {
    ...preview,
    source
  };
}

// 同一路径只保留最新预览, 让审查列表不会重复堆积
export function upsertFileChangePreview(
  previews: ProjectFileChangePreview[],
  preview: ProjectFileChangePreview
): ProjectFileChangePreview[] {
  const existingIndex = previews.findIndex(
    (candidate) => candidate.relativePath === preview.relativePath
  );

  if (existingIndex < 0) {
    return [...previews, preview];
  }

  const existingPreview = previews[existingIndex];
  const nextPreview =
    preview.source || !existingPreview.source
      ? preview
      : { ...preview, source: existingPreview.source };

  return previews.map((candidate, index) => (index === existingIndex ? nextPreview : candidate));
}

// 按相对路径移除预览, 丢弃操作不会触碰真实文件
export function removeFileChangePreview(
  previews: ProjectFileChangePreview[],
  relativePath: string
): ProjectFileChangePreview[] {
  return previews.filter((preview) => preview.relativePath !== relativePath);
}

// 找到指定文件变更的来源动作, UI 应用或丢弃时用它同步队列状态
export function findFileChangePreviewSource(
  previews: ProjectFileChangePreview[],
  relativePath: string
): FileChangePreviewSource | null {
  return previews.find((preview) => preview.relativePath === relativePath)?.source ?? null;
}

// 收集全部来源动作并去重, 批量应用和丢弃时避免重复写同一个动作状态
export function listFileChangePreviewSources(
  previews: ProjectFileChangePreview[]
): FileChangePreviewSource[] {
  const sources = new Map<string, FileChangePreviewSource>();

  for (const preview of previews) {
    if (!preview.source?.actionId) {
      continue;
    }

    sources.set(`${preview.source.threadId}:${preview.source.actionId}`, preview.source);
  }

  return [...sources.values()];
}
