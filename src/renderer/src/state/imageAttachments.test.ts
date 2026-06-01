import { describe, expect, it } from "vitest";
import {
  formatAttachmentSize,
  maxComposerImageAttachmentBytes,
  selectComposerImageFiles
} from "./imageAttachments";

describe("image attachment helpers", () => {
  it("selects only image files within size and slot limits", () => {
    const smallPng = createFile("small.png", "image/png", 1024);
    const oversizedPng = createFile("large.png", "image/png", maxComposerImageAttachmentBytes + 1);
    const textFile = createFile("note.txt", "text/plain", 100);
    const secondSmall = createFile("second.jpg", "image/jpeg", 2048);

    const result = selectComposerImageFiles([smallPng, oversizedPng, textFile, secondSmall], 1);

    expect(result.accepted).toEqual([smallPng]);
    expect(result.oversizedCount).toBe(1);
  });

  it("does not report oversized files when no attachment slots remain", () => {
    const oversizedPng = createFile("large.png", "image/png", maxComposerImageAttachmentBytes + 1);

    expect(selectComposerImageFiles([oversizedPng], 0)).toEqual({
      accepted: [],
      oversizedCount: 0
    });
  });

  it("formats attachment sizes for compact previews", () => {
    expect(formatAttachmentSize(999)).toBe("999 B");
    expect(formatAttachmentSize(2048)).toBe("2 KB");
    expect(formatAttachmentSize(1536 * 1024)).toBe("1.5 MB");
  });
});

function createFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}
