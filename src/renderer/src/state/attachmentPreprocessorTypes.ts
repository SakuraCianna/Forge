// 本文件说明: 定义输入框附件预处理 Worker 的消息协议
import type { ComposerAttachmentKind } from "./composerAttachments";

export type SupportedComposerAttachmentKind = Exclude<ComposerAttachmentKind, "unsupported">;

export type AttachmentPreprocessorRequest = {
  id: string;
  kind: SupportedComposerAttachmentKind;
  name: string;
  mediaType: string;
  size: number;
  buffer: ArrayBuffer;
};

export type AttachmentPreprocessorResponse = {
  id: string;
  kind: SupportedComposerAttachmentKind;
  extractedText?: string;
  imageDataUrl?: string;
  error?: string;
};
