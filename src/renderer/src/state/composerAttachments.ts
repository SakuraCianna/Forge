// 本文件说明: 管理输入框附件的类型识别、上下文拼接和展示格式
import type { AgentAttachmentContext, AgentImageAttachment } from "@shared/agentTypes";
import type { Language } from "@shared/modelTypes";

export type ComposerAttachmentKind =
  | "image"
  | "pdf"
  | "word"
  | "spreadsheet"
  | "text"
  | "unsupported";

export type ComposerAttachmentStatus = "processing" | "ready" | "failed";

export type ComposerAttachment = {
  id: string;
  kind: ComposerAttachmentKind;
  status: ComposerAttachmentStatus;
  name: string;
  mediaType: string;
  size: number;
  extractedText?: string;
  imageAttachment?: AgentImageAttachment;
  error?: string;
};

export type ComposerAttachmentSelection = {
  accepted: Array<{ file: File; kind: Exclude<ComposerAttachmentKind, "unsupported"> }>;
  oversizedCount: number;
  sensitiveCount: number;
  unsupportedCount: number;
};

export type ComposerSubmissionCopy = {
  attachmentContextHeader: string;
  attachmentContextIntro: string;
  attachmentContextTruncated: string;
  attachmentPromptFallback: string;
};

type AttachmentContextCopy = Pick<
  ComposerSubmissionCopy,
  "attachmentContextHeader" | "attachmentContextIntro" | "attachmentContextTruncated"
>;

export type ComposerSubmissionPayload = {
  prompt: string;
  attachments?: AgentImageAttachment[];
  attachmentContexts?: AgentAttachmentContext[];
};

export const maxComposerAttachments = 8;
export const maxComposerImageAttachmentBytes = 8 * 1024 * 1024;
export const maxComposerDocumentAttachmentBytes = 16 * 1024 * 1024;
export const maxComposerTextAttachmentBytes = 2 * 1024 * 1024;
export const maxAttachmentContextChars = 20_000;
export const maxSingleAttachmentContextChars = 6_000;

export const composerAttachmentAccept = [
  "image/*",
  "application/pdf",
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".csv",
  ".tsv",
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".kt",
  ".go",
  ".rs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".rb",
  ".swift",
  ".sql",
  ".toml",
  ".ini",
  ".log"
].join(",");

const wordExtensions = new Set(["doc", "docx"]);
const spreadsheetExtensions = new Set(["csv", "tsv", "xlsx"]);
const textExtensions = new Set([
  "c",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsonl",
  "jsx",
  "kt",
  "log",
  "markdown",
  "md",
  "php",
  "py",
  "rb",
  "rs",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml"
]);
const sensitiveExtensions = new Set([
  "crt",
  "db",
  "der",
  "key",
  "p12",
  "pem",
  "pfx",
  "sqlite",
  "sqlite3"
]);
const sensitiveFileNames = new Set([".env", ".npmrc", ".pypirc"]);

export function selectComposerAttachmentFiles(
  files: File[],
  remainingSlots: number
): ComposerAttachmentSelection {
  if (remainingSlots <= 0) {
    return { accepted: [], oversizedCount: 0, sensitiveCount: 0, unsupportedCount: 0 };
  }

  const accepted: ComposerAttachmentSelection["accepted"] = [];
  let oversizedCount = 0;
  let sensitiveCount = 0;
  let unsupportedCount = 0;

  for (const file of files) {
    if (accepted.length >= remainingSlots) {
      break;
    }

    if (isSensitiveAttachment(file.name)) {
      sensitiveCount += 1;
      continue;
    }

    const kind = getComposerAttachmentKind(file);

    if (kind === "unsupported") {
      unsupportedCount += 1;
      continue;
    }

    if (file.size > getComposerAttachmentMaxBytes(kind)) {
      oversizedCount += 1;
      continue;
    }

    accepted.push({ file, kind });
  }

  return { accepted, oversizedCount, sensitiveCount, unsupportedCount };
}

export function getComposerAttachmentKind(file: Pick<File, "name" | "type">): ComposerAttachmentKind {
  const extension = getFileExtension(file.name);
  const mediaType = file.type.toLowerCase();

  if (mediaType.startsWith("image/")) {
    return "image";
  }

  if (extension === "pdf" || mediaType === "application/pdf") {
    return "pdf";
  }

  if (
    wordExtensions.has(extension) ||
    mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "word";
  }

  if (
    spreadsheetExtensions.has(extension) ||
    mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "spreadsheet";
  }

  if (mediaType.startsWith("text/") || textExtensions.has(extension)) {
    return "text";
  }

  return "unsupported";
}

export function getComposerAttachmentLabel(kind: ComposerAttachmentKind): string {
  if (kind === "image") {
    return "Image";
  }

  if (kind === "pdf") {
    return "PDF";
  }

  if (kind === "word") {
    return "Word";
  }

  if (kind === "spreadsheet") {
    return "Spreadsheet";
  }

  if (kind === "text") {
    return "Text";
  }

  return "File";
}

export function createPendingComposerAttachment(
  file: File,
  kind: Exclude<ComposerAttachmentKind, "unsupported">,
  id = createComposerAttachmentId(kind)
): ComposerAttachment {
  return {
    id,
    kind,
    status: "processing",
    name: file.name || getComposerAttachmentLabel(kind),
    mediaType: file.type || inferMediaTypeFromName(file.name, kind),
    size: file.size
  };
}

export function createComposerSubmissionPayload(
  prompt: string,
  attachments: ComposerAttachment[],
  copy: ComposerSubmissionCopy
): ComposerSubmissionPayload | null {
  const normalizedPrompt = prompt.trim();
  const readyImageAttachments = attachments
    .filter((attachment) => attachment.status === "ready" && attachment.imageAttachment)
    .map((attachment) => attachment.imageAttachment)
    .filter((attachment): attachment is AgentImageAttachment => Boolean(attachment));
  const attachmentContexts = createAgentAttachmentContexts(attachments);

  if (!normalizedPrompt && readyImageAttachments.length === 0 && attachmentContexts.length === 0) {
    return null;
  }

  // 提交载荷保留用户原始输入, 本地解析出的附件文本先作为结构化上下文保存。
  // 真正发送给模型前再拼接, 避免线程标题、用户气泡和路由判断被 OCR/文档内容污染。
  return {
    prompt: normalizedPrompt || copy.attachmentPromptFallback,
    attachments: readyImageAttachments.length > 0 ? readyImageAttachments : undefined,
    attachmentContexts: attachmentContexts.length > 0 ? attachmentContexts : undefined
  };
}

export function appendAttachmentContextsToPrompt(
  prompt: string,
  attachmentContexts: AgentAttachmentContext[] | undefined,
  language: Language
): string {
  // 这是唯一把本地附件解析内容注入模型 prompt 的出口。
  // 调用方应继续用原始 prompt 做记忆检索、标题和界面展示。
  const contextBlock = createAttachmentContextBlock(
    attachmentContexts ?? [],
    getAttachmentContextCopy(language)
  );

  return contextBlock ? `${prompt.trim()}\n\n${contextBlock}` : prompt;
}

export function createAgentAttachmentContexts(
  attachments: ComposerAttachment[]
): AgentAttachmentContext[] {
  return attachments
    .filter(
      (
        attachment
      ): attachment is ComposerAttachment & {
        kind: Exclude<ComposerAttachmentKind, "unsupported">;
        extractedText: string;
      } =>
        attachment.kind !== "unsupported" &&
        attachment.status === "ready" &&
        Boolean(attachment.extractedText?.trim())
    )
    .map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      size: attachment.size,
      content: normalizeAttachmentText(attachment.extractedText)
    }));
}

export function createAttachmentContextBlock(
  attachmentContexts: AgentAttachmentContext[],
  copy: AttachmentContextCopy
): string {
  if (attachmentContexts.length === 0) {
    return "";
  }

  const parts = [copy.attachmentContextHeader, copy.attachmentContextIntro];
  let usedChars = parts.join("\n").length;

  attachmentContexts.forEach((attachment, index) => {
    const remainingChars = maxAttachmentContextChars - usedChars;

    if (remainingChars <= 0) {
      return;
    }

    const label = getComposerAttachmentLabel(attachment.kind);
    const metadata = `[${index + 1}] ${attachment.name} (${label}, ${formatAttachmentSize(attachment.size)})`;
    const cappedText = limitText(
      attachment.content,
      Math.min(maxSingleAttachmentContextChars, remainingChars),
      copy.attachmentContextTruncated
    );
    const block = `${metadata}\n${cappedText}`;

    parts.push(block);
    usedChars += block.length;
  });

  return parts.join("\n\n").trim();
}

function getAttachmentContextCopy(language: Language): AttachmentContextCopy {
  if (language === "zh-CN") {
    return {
      attachmentContextHeader: "附件本地解析内容:",
      attachmentContextIntro:
        "以下内容由 Forge 在本地从用户拖入或粘贴的附件中提取, 可能存在 OCR 或表格截断误差。",
      attachmentContextTruncated: "[内容已截断]"
    };
  }

  return {
    attachmentContextHeader: "Local attachment context:",
    attachmentContextIntro:
      "Forge extracted the following content locally from files the user pasted or dropped. OCR and table content may be imperfect or truncated.",
    attachmentContextTruncated: "[Content truncated]"
  };
}

export function hasProcessingComposerAttachments(attachments: ComposerAttachment[]): boolean {
  return attachments.some((attachment) => attachment.status === "processing");
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

function getComposerAttachmentMaxBytes(kind: Exclude<ComposerAttachmentKind, "unsupported">): number {
  if (kind === "image") {
    return maxComposerImageAttachmentBytes;
  }

  if (kind === "text") {
    return maxComposerTextAttachmentBytes;
  }

  return maxComposerDocumentAttachmentBytes;
}

function isSensitiveAttachment(fileName: string): boolean {
  const normalizedName = fileName.trim().toLowerCase();

  return sensitiveFileNames.has(normalizedName) || sensitiveExtensions.has(getFileExtension(fileName));
}

function createComposerAttachmentId(kind: ComposerAttachmentKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferMediaTypeFromName(fileName: string, kind: ComposerAttachmentKind): string {
  const extension = getFileExtension(fileName);

  if (kind === "pdf") {
    return "application/pdf";
  }

  if (kind === "word") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (kind === "spreadsheet" && extension === "csv") {
    return "text/csv";
  }

  if (kind === "spreadsheet") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  if (kind === "text") {
    return "text/plain";
  }

  return "application/octet-stream";
}

function getFileExtension(fileName: string): string {
  const lastSegment = fileName.split(/[\\/]/u).pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) {
    return "";
  }

  return lastSegment.slice(dotIndex + 1).toLowerCase();
}

function normalizeAttachmentText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").replace(/[ \t]+\n/gu, "\n").trim();
}

function limitText(text: string, limit: number, truncatedLabel: string): string {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - truncatedLabel.length - 2)).trimEnd()}\n${truncatedLabel}`;
}
