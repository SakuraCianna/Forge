import { describe, expect, it } from "vitest";
import type { AgentImageAttachment } from "@shared/agentTypes";
import {
  createAttachmentContextBlock,
  createComposerSubmissionPrompt,
  formatAttachmentSize,
  getComposerAttachmentKind,
  selectComposerAttachmentFiles,
  type ComposerSubmissionCopy
} from "./composerAttachments";

const copy: ComposerSubmissionCopy = {
  attachmentContextHeader: "Local attachment context:",
  attachmentContextIntro: "Extracted locally.",
  attachmentContextTruncated: "[truncated]",
  attachmentPromptFallback: "Use the attachments.",
  imagePromptFallback: "Use the image."
};

describe("composer attachments", () => {
  it("classifies common attachment types", () => {
    expect(getComposerAttachmentKind(createFile("photo.png", "image/png"))).toBe("image");
    expect(getComposerAttachmentKind(createFile("brief.pdf", "application/pdf"))).toBe("pdf");
    expect(getComposerAttachmentKind(createFile("plan.docx", ""))).toBe("word");
    expect(getComposerAttachmentKind(createFile("data.xlsx", ""))).toBe("spreadsheet");
    expect(getComposerAttachmentKind(createFile("legacy.xls", ""))).toBe("unsupported");
    expect(getComposerAttachmentKind(createFile("notes.md", ""))).toBe("text");
    expect(getComposerAttachmentKind(createFile("archive.zip", "application/zip"))).toBe(
      "unsupported"
    );
  });

  it("selects supported files and skips oversized or sensitive files", () => {
    const files = [
      createFile("small.png", "image/png", 1024),
      createFile("large.pdf", "application/pdf", 20 * 1024 * 1024),
      createFile(".env", "text/plain", 10),
      createFile("archive.zip", "application/zip", 10)
    ];

    expect(selectComposerAttachmentFiles(files, 8)).toMatchObject({
      accepted: [{ kind: "image" }],
      oversizedCount: 1,
      sensitiveCount: 1,
      unsupportedCount: 1
    });
  });

  it("builds local attachment context blocks", () => {
    const block = createAttachmentContextBlock(
      [
        {
          id: "doc-1",
          kind: "word",
          status: "ready",
          name: "brief.docx",
          mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 2048,
          extractedText: "Project notes"
        }
      ],
      copy
    );

    expect(block).toContain("Local attachment context:");
    expect(block).toContain("brief.docx");
    expect(block).toContain("Project notes");
  });

  it("creates prompts with extracted context and image attachments", () => {
    const imageAttachment: AgentImageAttachment = {
      id: "image-1",
      mediaType: "image/png",
      dataUrl: "data:image/png;base64,AA==",
      name: "image.png",
      size: 128
    };
    const submission = createComposerSubmissionPrompt(
      "Explain this",
      [
        {
          id: "image-1",
          kind: "image",
          status: "ready",
          name: "image.png",
          mediaType: "image/png",
          size: 128,
          extractedText: "OCR words",
          imageAttachment
        }
      ],
      copy
    );

    expect(submission?.attachments).toEqual([imageAttachment]);
    expect(submission?.prompt).toContain("Explain this");
    expect(submission?.prompt).toContain("OCR words");
  });

  it("formats attachment sizes", () => {
    expect(formatAttachmentSize(999)).toBe("999 B");
    expect(formatAttachmentSize(2048)).toBe("2 KB");
    expect(formatAttachmentSize(1536 * 1024)).toBe("1.5 MB");
  });
});

function createFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}
