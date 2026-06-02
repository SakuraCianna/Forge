import { describe, expect, it } from "vitest";
import type { AgentImageAttachment } from "@shared/agentTypes";
import type { ComposerSubmissionCopy } from "@/state/composerAttachments";
import {
  createComposerSubmission,
  shouldSubmitComposerPrompt
} from "./useTaskComposerState";

const copy: ComposerSubmissionCopy = {
  attachmentContextHeader: "Local attachment context:",
  attachmentContextIntro: "Extracted locally.",
  attachmentContextTruncated: "[truncated]",
  attachmentPromptFallback: "Use the attachments."
};

describe("useTaskComposerState helpers", () => {
  it("returns null for empty composer submissions", () => {
    expect(createComposerSubmission("   ", [], copy)).toBeNull();
  });

  it("trims text submissions and omits empty attachments", () => {
    expect(createComposerSubmission("  refactor App.tsx  ", [], copy)).toEqual({
      prompt: "refactor App.tsx",
      attachments: undefined,
      attachmentContexts: undefined
    });
  });

  it("uses the attachment fallback when submitting attachments without text", () => {
    const attachment = createAttachment("image-1");

    expect(createComposerSubmission("   ", [attachment], copy)).toEqual({
      prompt: "Use the attachments.",
      attachments: [attachment.imageAttachment],
      attachmentContexts: undefined
    });
  });

  it("drops binary images for non-vision models but keeps OCR text", () => {
    const attachment = createAttachment("image-1", "OCR text");

    expect(createComposerSubmission("Look", [attachment], copy, false)).toEqual({
      prompt: "Look",
      attachments: undefined,
      attachmentContexts: [
        {
          id: "image-1",
          kind: "image",
          name: "image.png",
          size: 128,
          content: "OCR text"
        }
      ]
    });
  });

  it("submits plain Enter only when Enter mode is active", () => {
    expect(
      shouldSubmitComposerPrompt({
        key: "Enter",
        submitShortcut: "enter"
      })
    ).toBe(true);
    expect(
      shouldSubmitComposerPrompt({
        key: "Enter",
        shiftKey: true,
        submitShortcut: "enter"
      })
    ).toBe(false);
    expect(
      shouldSubmitComposerPrompt({
        ctrlKey: true,
        key: "Enter",
        submitShortcut: "enter"
      })
    ).toBe(false);
  });

  it("submits Ctrl or Meta Enter only when Ctrl Enter mode is active", () => {
    expect(
      shouldSubmitComposerPrompt({
        ctrlKey: true,
        key: "Enter",
        submitShortcut: "ctrl-enter"
      })
    ).toBe(true);
    expect(
      shouldSubmitComposerPrompt({
        key: "Enter",
        metaKey: true,
        submitShortcut: "ctrl-enter"
      })
    ).toBe(true);
    expect(
      shouldSubmitComposerPrompt({
        key: "Enter",
        submitShortcut: "ctrl-enter"
      })
    ).toBe(false);
  });

  it("does not submit while IME composition is active", () => {
    expect(
      shouldSubmitComposerPrompt({
        isComposing: true,
        key: "Enter",
        submitShortcut: "enter"
      })
    ).toBe(false);
  });
});

function createAttachment(id: string, extractedText?: string) {
  const imageAttachment: AgentImageAttachment = {
    id,
    mediaType: "image/png",
    dataUrl: "data:image/png;base64,AA==",
    name: "image.png",
    size: 128
  };

  return {
    id,
    kind: "image" as const,
    mediaType: "image/png",
    imageAttachment,
    name: "image.png",
    size: 128,
    status: "ready" as const,
    extractedText
  };
}
