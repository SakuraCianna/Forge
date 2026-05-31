// 本文件说明: 管理模型生成但尚未写入磁盘的文件变更预览
import type { ProjectFileChangePreview } from "@shared/fileTypes";

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
  const nextPreview = preview.source || !existingPreview.source
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
