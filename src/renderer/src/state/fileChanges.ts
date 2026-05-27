import type { ProjectFileChangePreview } from "@shared/fileTypes";

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

  return previews.map((candidate, index) => (index === existingIndex ? preview : candidate));
}

export function removeFileChangePreview(
  previews: ProjectFileChangePreview[],
  relativePath: string
): ProjectFileChangePreview[] {
  return previews.filter((preview) => preview.relativePath !== relativePath);
}
