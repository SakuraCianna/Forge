// 本文件说明: 封装输入框附件预处理 Worker, 供 React 状态层调用
import type { AgentImageAttachment } from "@shared/agentTypes";
import type { ComposerAttachment } from "./composerAttachments";
import {
  createPendingComposerAttachment,
  getComposerAttachmentKind
} from "./composerAttachments";
import type {
  AttachmentPreprocessorRequest,
  AttachmentPreprocessorResponse,
  SupportedComposerAttachmentKind
} from "./attachmentPreprocessorTypes";

type PendingAttachmentJob = {
  reject: (error: Error) => void;
  resolve: (value: AttachmentPreprocessorResponse) => void;
};

let attachmentWorker: Worker | null = null;
const pendingJobs = new Map<string, PendingAttachmentJob>();

export async function preprocessComposerAttachment(
  file: File,
  id?: string
): Promise<ComposerAttachment> {
  const kind = getComposerAttachmentKind(file);

  if (kind === "unsupported") {
    return {
      id: id ?? `unsupported-${Date.now()}`,
      kind,
      status: "failed",
      name: file.name,
      mediaType: file.type || "application/octet-stream",
      size: file.size,
      error: "Unsupported attachment type"
    };
  }

  const pendingAttachment = createPendingComposerAttachment(file, kind, id);
  const response = await runAttachmentPreprocessor({
    id: pendingAttachment.id,
    kind,
    name: pendingAttachment.name,
    mediaType: pendingAttachment.mediaType,
    size: pendingAttachment.size,
    buffer: await file.arrayBuffer()
  });
  const imageAttachment = response.imageDataUrl
    ? createAgentImageAttachment(pendingAttachment, response.imageDataUrl)
    : undefined;
  const hasExtractedText = Boolean(response.extractedText?.trim());

  if (!imageAttachment && !hasExtractedText && response.error) {
    return {
      ...pendingAttachment,
      status: "failed",
      error: response.error
    };
  }

  return {
    ...pendingAttachment,
    status: "ready",
    extractedText: response.extractedText?.trim(),
    imageAttachment,
    error: response.error
  };
}

function runAttachmentPreprocessor(
  request: AttachmentPreprocessorRequest
): Promise<AttachmentPreprocessorResponse> {
  const worker = getAttachmentWorker();

  return new Promise((resolve, reject) => {
    pendingJobs.set(request.id, { reject, resolve });
    worker.postMessage(request, [request.buffer]);
  });
}

function getAttachmentWorker(): Worker {
  if (!attachmentWorker) {
    attachmentWorker = new Worker(new URL("./attachmentPreprocessor.worker.ts", import.meta.url), {
      type: "module"
    });
    attachmentWorker.onmessage = (event: MessageEvent<AttachmentPreprocessorResponse>) => {
      const job = pendingJobs.get(event.data.id);

      if (!job) {
        return;
      }

      pendingJobs.delete(event.data.id);
      job.resolve(event.data);
    };
    attachmentWorker.onerror = (event) => {
      const error = new Error(event.message || "Attachment worker failed");

      for (const job of pendingJobs.values()) {
        job.reject(error);
      }

      pendingJobs.clear();
      attachmentWorker?.terminate();
      attachmentWorker = null;
    };
  }

  return attachmentWorker;
}

function createAgentImageAttachment(
  attachment: Pick<ComposerAttachment, "id" | "mediaType" | "name" | "size">,
  dataUrl: string
): AgentImageAttachment {
  return {
    id: attachment.id,
    mediaType: attachment.mediaType || getImageMediaTypeFromDataUrl(dataUrl),
    dataUrl,
    name: attachment.name,
    size: attachment.size
  };
}

function getImageMediaTypeFromDataUrl(dataUrl: string): string {
  const match = /^data:(image\/[a-z0-9.+-]+);/iu.exec(dataUrl);

  return match?.[1] ?? "image/png";
}

export function createComposerAttachmentPlaceholder(
  file: File,
  kind: SupportedComposerAttachmentKind,
  id?: string
): ComposerAttachment {
  return createPendingComposerAttachment(file, kind, id);
}
