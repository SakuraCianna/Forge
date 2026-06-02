// Keeps the composer input state separate from the visual controls.
import type {
  ChangeEvent as ReactChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentAttachmentContext, AgentImageAttachment } from "@shared/agentTypes";
import {
  createComposerSubmissionPayload,
  formatAttachmentSize,
  hasProcessingComposerAttachments,
  maxComposerAttachments,
  selectComposerAttachmentFiles,
  type ComposerAttachment,
  type ComposerSubmissionCopy
} from "@/state/composerAttachments";
import {
  createComposerAttachmentPlaceholder,
  preprocessComposerAttachment
} from "@/state/attachmentPreprocessor";
import type { GeneralPreferences } from "@/state/generalPreferences";

export type TaskComposerStateCopy = ComposerSubmissionCopy & {
  attachmentsProcessing: string;
  attachmentTooLarge: (count: number, maxSize: string) => string;
  attachmentUnsupported: (count: number) => string;
  sensitiveAttachmentsSkipped: (count: number) => string;
};

export type ComposerSubmission = {
  prompt: string;
  attachments?: AgentImageAttachment[];
  attachmentContexts?: AgentAttachmentContext[];
};

export type ComposerSubmitShortcut = GeneralPreferences["composerSubmitShortcut"];

type UseTaskComposerStateOptions = {
  copy: TaskComposerStateCopy;
  focusSignal: number;
  onSubmitTask: (
    prompt: string,
    attachments?: AgentImageAttachment[],
    attachmentContexts?: AgentAttachmentContext[]
  ) => void;
  submitShortcut: ComposerSubmitShortcut;
  submitSignal: number;
  supportsImageAttachments: boolean;
};

type ComposerPromptKeyState = {
  altKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  submitShortcut: ComposerSubmitShortcut;
};

export function useTaskComposerState({
  copy,
  focusSignal,
  onSubmitTask,
  submitShortcut,
  submitSignal,
  supportsImageAttachments
}: UseTaskComposerStateOptions): {
  attachments: ComposerAttachment[];
  attachmentNotice: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleAttachmentInputChange: (event: ReactChangeEvent<HTMLInputElement>) => void;
  handleComposerDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleComposerDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleComposerDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  handlePromptKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  handlePromptPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  isDraggingAttachments: boolean;
  openAttachmentPicker: () => void;
  prompt: string;
  removeAttachment: (id: string) => void;
  setPrompt: (prompt: string) => void;
  submitTask: () => boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
} {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [isDraggingAttachments, setIsDraggingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submitTask = useCallback((): boolean => {
    if (hasProcessingComposerAttachments(attachments)) {
      setAttachmentNotice(copy.attachmentsProcessing);
      return false;
    }

    const submission = createComposerSubmission(prompt, attachments, copy, supportsImageAttachments);

    if (!submission) {
      return false;
    }

    onSubmitTask(submission.prompt, submission.attachments, submission.attachmentContexts);
    setPrompt("");
    setAttachments([]);
    setAttachmentNotice(null);
    return true;
  }, [attachments, copy, onSubmitTask, prompt, supportsImageAttachments]);

  useEffect(() => {
    if (focusSignal > 0) {
      textareaRef.current?.focus();
    }
  }, [focusSignal]);

  useEffect(() => {
    if (submitSignal > 0) {
      submitTask();
    }
  }, [submitSignal, submitTask]);

  const addAttachmentFiles = useCallback(
    (files: File[]): void => {
      const remainingSlots = maxComposerAttachments - attachments.length;
      const selection = selectComposerAttachmentFiles(files, remainingSlots);
      const notices = createAttachmentSelectionNotices(selection, copy);

      if (notices.length > 0) {
        setAttachmentNotice(notices.join(" "));
      } else {
        setAttachmentNotice(null);
      }

      if (selection.accepted.length === 0) {
        return;
      }

      const pendingAttachments = selection.accepted.map(({ file, kind }) =>
        createComposerAttachmentPlaceholder(file, kind)
      );

      setAttachments((current) => [...current, ...pendingAttachments].slice(0, maxComposerAttachments));

      selection.accepted.forEach(({ file }, index) => {
        const placeholder = pendingAttachments[index];

        if (!placeholder) {
          return;
        }

        void preprocessComposerAttachment(file, placeholder.id)
          .then((attachment) => {
            setAttachments((current) =>
              current.map((item) => (item.id === attachment.id ? attachment : item))
            );
          })
          .catch((error) => {
            setAttachments((current) =>
              current.map((item) =>
                item.id === placeholder.id
                  ? {
                      ...item,
                      status: "failed",
                      error: error instanceof Error ? error.message : "Attachment parsing failed"
                    }
                  : item
              )
            );
          });
      });
    },
    [attachments.length, copy]
  );

  const handlePromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
      if (
        !shouldSubmitComposerPrompt({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          isComposing: event.nativeEvent.isComposing,
          key: event.key,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          submitShortcut
        })
      ) {
        return;
      }

      event.preventDefault();
      submitTask();
    },
    [submitShortcut, submitTask]
  );

  const handlePromptPaste = useCallback(
    (event: ReactClipboardEvent<HTMLTextAreaElement>): void => {
      const pastedFiles = Array.from(event.clipboardData.items)
        .map((item) => (item.kind === "file" ? item.getAsFile() : null))
        .filter((file): file is File => Boolean(file));

      if (pastedFiles.length === 0) {
        return;
      }

      event.preventDefault();
      addAttachmentFiles(pastedFiles);
    },
    [addAttachmentFiles]
  );

  const handleAttachmentInputChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>): void => {
      addAttachmentFiles(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = "";
    },
    [addAttachmentFiles]
  );

  const handleComposerDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>): void => {
    if (!hasDragFiles(event)) {
      return;
    }

    event.preventDefault();
    setIsDraggingAttachments(true);
  }, []);

  const handleComposerDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>): void => {
    if (
      event.currentTarget === event.relatedTarget ||
      (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
    ) {
      return;
    }

    setIsDraggingAttachments(false);
  }, []);

  const handleComposerDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>): void => {
      if (!hasDragFiles(event)) {
        return;
      }

      event.preventDefault();
      setIsDraggingAttachments(false);
      addAttachmentFiles(Array.from(event.dataTransfer.files));
    },
    [addAttachmentFiles]
  );

  const openAttachmentPicker = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const removeAttachment = useCallback((id: string): void => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setAttachmentNotice(null);
  }, []);

  return {
    attachments,
    attachmentNotice,
    fileInputRef,
    handleAttachmentInputChange,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    handlePromptKeyDown,
    handlePromptPaste,
    isDraggingAttachments,
    openAttachmentPicker,
    prompt,
    removeAttachment,
    setPrompt,
    submitTask,
    textareaRef
  };
}

export function createComposerSubmission(
  prompt: string,
  attachments: ComposerAttachment[],
  copy: ComposerSubmissionCopy,
  supportsImageAttachments = true
): ComposerSubmission | null {
  const submissionAttachments = supportsImageAttachments
    ? attachments
    : attachments.map((attachment) => ({ ...attachment, imageAttachment: undefined }));
  const submission = createComposerSubmissionPayload(prompt, submissionAttachments, copy);

  return submission
    ? {
        prompt: submission.prompt,
        attachments: supportsImageAttachments ? submission.attachments : undefined,
        attachmentContexts: submission.attachmentContexts
      }
    : null;
}

export function shouldSubmitComposerPrompt({
  altKey = false,
  ctrlKey = false,
  isComposing = false,
  key,
  metaKey = false,
  shiftKey = false,
  submitShortcut
}: ComposerPromptKeyState): boolean {
  if (key !== "Enter" || isComposing) {
    return false;
  }

  return submitShortcut === "ctrl-enter"
    ? (ctrlKey || metaKey) && !shiftKey && !altKey
    : !shiftKey && !altKey && !ctrlKey && !metaKey;
}

function createAttachmentSelectionNotices(
  selection: ReturnType<typeof selectComposerAttachmentFiles>,
  copy: Pick<
    TaskComposerStateCopy,
    "attachmentTooLarge" | "attachmentUnsupported" | "sensitiveAttachmentsSkipped"
  >
): string[] {
  return [
    selection.oversizedCount > 0
      ? copy.attachmentTooLarge(selection.oversizedCount, formatAttachmentSize(16 * 1024 * 1024))
      : "",
    selection.unsupportedCount > 0 ? copy.attachmentUnsupported(selection.unsupportedCount) : "",
    selection.sensitiveCount > 0 ? copy.sensitiveAttachmentsSkipped(selection.sensitiveCount) : ""
  ].filter(Boolean);
}

function hasDragFiles(event: ReactDragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}
