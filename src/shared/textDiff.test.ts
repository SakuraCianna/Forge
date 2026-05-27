import { describe, expect, it } from "vitest";
import { createLineDiff } from "./textDiff.js";

describe("textDiff", () => {
  it("creates line-level diff entries for changed text", () => {
    expect(createLineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { kind: "context", oldLineNumber: 1, newLineNumber: 1, text: "a" },
      { kind: "remove", oldLineNumber: 2, text: "b" },
      { kind: "add", newLineNumber: 2, text: "B" },
      { kind: "context", oldLineNumber: 3, newLineNumber: 3, text: "c" },
      { kind: "add", newLineNumber: 4, text: "d" }
    ]);
  });

  it("returns context entries when content is unchanged", () => {
    expect(createLineDiff("same", "same")).toEqual([
      { kind: "context", oldLineNumber: 1, newLineNumber: 1, text: "same" }
    ]);
  });
});
