// 本文件说明: 管理输入框图片附件的大小、数量和展示格式
import type { AgentImageAttachment } from "@shared/agentTypes";

export const maxComposerImageAttachments = 6;
export const maxComposerImageAttachmentBytes = 8 * 1024 * 1024;

export type ImageAttachmentSelection = {
  accepted: File[];
  oversizedCount: number;
};

export function selectComposerImageFiles(
  files: File[],
  remainingSlots: number
): ImageAttachmentSelection {
  if (remainingSlots <= 0) {
    return { accepted: [], oversizedCount: 0 };
  }

  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const oversizedCount = imageFiles.filter((file) => file.size > maxComposerImageAttachmentBytes).length;
  const accepted = imageFiles
    .filter((file) => file.size <= maxComposerImageAttachmentBytes)
    .slice(0, remainingSlots);

  return { accepted, oversizedCount };
}

export function readComposerImageAttachment(file: File): Promise<AgentImageAttachment> {
  return new Promise((resolve, reject) => {
    if (file.size > maxComposerImageAttachmentBytes) {
      reject(new Error("Image attachment is too large"));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image attachment"));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";

      resolve({
        id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mediaType: file.type || "image/png",
        dataUrl,
        name: file.name || "pasted-image",
        size: file.size
      });
    };
    reader.readAsDataURL(file);
  });
}

export function formatAttachmentSize(size: number | undefined): string {
  if (!size || size < 1024) {
    return size ? `${size} B` : "";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
