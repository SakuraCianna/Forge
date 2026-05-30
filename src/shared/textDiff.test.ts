// 本文件说明: 验证文本 diff 能稳定显示新增, 删除和未变化行
import { describe, expect, it } from "vitest";
import {
  annotateLineDiffHunks,
  createLineDiff,
  createTextFromLineDiffHunkDecision
} from "./textDiff.js";

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

  it("annotates separated changed regions as independent hunks", () => {
    const diff = createLineDiff("a\nb\nc\nd", "A\nb\nC\nd");

    expect(annotateLineDiffHunks(diff).map((entry) => entry.hunkIndex)).toEqual([
      0,
      0,
      null,
      1,
      1,
      null
    ]);
  });

  it("rebuilds text after rejecting or isolating a single hunk", () => {
    const diff = createLineDiff("a\nb\nc\nd", "A\nb\nC\nd");

    expect(createTextFromLineDiffHunkDecision(diff, 0, "discard")).toBe("a\nb\nC\nd");
    expect(createTextFromLineDiffHunkDecision(diff, 1, "keep-only")).toBe("a\nb\nC\nd");
  });
});
