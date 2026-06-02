// Keeps the composer input state separate from the visual controls.
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentImageAttachment } from "@shared/agentTypes";
import {
  maxComposerImageAttachments,
  readComposerImageAttachment,
  selectComposerImageFiles
} from "@/state/imageAttachments";
import type { GeneralPreferences } from "@/state/generalPreferences";

export type TaskComposerStateCopy = {
  imagePromptFallback: string;
  imageTooLarge: string;
};

export type ComposerSubmission = {
  prompt: string;
  attachments?: AgentImageAttachment[];
};

export type ComposerSubmitShortcut = GeneralPreferences["composerSubmitShortcut"];

type UseTaskComposerStateOptions = {
  copy: TaskComposerStateCopy;
  focusSignal: number;
  onSubmitTask: (prompt: string, attachments?: AgentImageAttachment[]) => void;
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
  attachmentNotice: string | null;
  handlePromptKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  handlePromptPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  imageAttachments: AgentImageAttachment[];
  prompt: string;
  removeImageAttachment: (id: string) => void;
  setPrompt: (prompt: string) => void;
  submitTask: () => boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
} {
  const [prompt, setPrompt] = useState("");
  const [imageAttachments, setImageAttachments] = useState<AgentImageAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submitTask = useCallback((): boolean => {
    const submission = createComposerSubmission(
      prompt,
      imageAttachments,
      copy.imagePromptFallback
    );

    if (!submission) {
      return false;
    }

    onSubmitTask(submission.prompt, submission.attachments);
    setPrompt("");
    setImageAttachments([]);
    setAttachmentNotice(null);
    return true;
  }, [copy.imagePromptFallback, imageAttachments, onSubmitTask, prompt]);

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

  useEffect(() => {
    if (!supportsImageAttachments && imageAttachments.length > 0) {
      setImageAttachments([]);
      setAttachmentNotice(null);
    }
  }, [imageAttachments.length, supportsImageAttachments]);

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
      if (!supportsImageAttachments) {
        return;
      }

      const remainingSlots = maxComposerImageAttachments - imageAttachments.length;

      if (remainingSlots <= 0) {
        return;
      }

      const pastedFiles = Array.from(event.clipboardData.items)
        .map((item) => (item.kind === "file" ? item.getAsFile() : null))
        .filter((file): file is File => Boolean(file));
      const { accepted: imageFiles, oversizedCount } = selectComposerImageFiles(
        pastedFiles,
        remainingSlots
      );

      if (imageFiles.length === 0) {
        if (oversizedCount > 0) {
          event.preventDefault();
          setAttachmentNotice(copy.imageTooLarge);
        }

        return;
      }

      event.preventDefault();
      setAttachmentNotice(oversizedCount > 0 ? copy.imageTooLarge : null);
      void Promise.all(imageFiles.map(readComposerImageAttachment))
        .then((attachments) => {
          setImageAttachments((current) =>
            [...current, ...attachments].slice(0, maxComposerImageAttachments)
          );
        })
        .catch(() => undefined);
    },
    [copy.imageTooLarge, imageAttachments.length, supportsImageAttachments]
  );

  const removeImageAttachment = useCallback((id: string): void => {
    setImageAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setAttachmentNotice(null);
  }, []);

  return {
    attachmentNotice,
    handlePromptKeyDown,
    handlePromptPaste,
    imageAttachments,
    prompt,
    removeImageAttachment,
    setPrompt,
    submitTask,
    textareaRef
  };
}

export function createComposerSubmission(
  prompt: string,
  attachments: AgentImageAttachment[],
  imagePromptFallback: string
): ComposerSubmission | null {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt && attachments.length === 0) {
    return null;
  }

  return {
    prompt: normalizedPrompt || imagePromptFallback,
    attachments: attachments.length > 0 ? attachments : undefined
  };
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
