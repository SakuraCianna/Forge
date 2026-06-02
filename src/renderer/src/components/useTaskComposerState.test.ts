import { describe, expect, it } from "vitest";
import type { AgentImageAttachment } from "@shared/agentTypes";
import {
  createComposerSubmission,
  shouldSubmitComposerPrompt
} from "./useTaskComposerState";

describe("useTaskComposerState helpers", () => {
  it("returns null for empty composer submissions", () => {
    expect(createComposerSubmission("   ", [], "Describe the image")).toBeNull();
  });

  it("trims text submissions and omits empty attachments", () => {
    expect(createComposerSubmission("  refactor App.tsx  ", [], "Describe the image")).toEqual({
      prompt: "refactor App.tsx",
      attachments: undefined
    });
  });

  it("uses the image fallback when submitting attachments without text", () => {
    const attachment = createAttachment("image-1");

    expect(createComposerSubmission("   ", [attachment], "Describe the image")).toEqual({
      prompt: "Describe the image",
      attachments: [attachment]
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

function createAttachment(id: string): AgentImageAttachment {
  return {
    id,
    mediaType: "image/png",
    dataUrl: "data:image/png;base64,AA==",
    name: "image.png",
    size: 128
  };
}
