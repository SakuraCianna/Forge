// 本文件说明: 渲染状态 文件变更状态测试
import { describe, expect, it } from "vitest";
import type { ProjectFileChangePreview } from "@shared/fileTypes";
import { removeFileChangePreview, upsertFileChangePreview } from "./fileChanges";

const firstPreview: ProjectFileChangePreview = {
  relativePath: "src/App.tsx",
  currentContent: "old",
  nextContent: "new",
  diff: [{ kind: "remove", oldLineNumber: 1, text: "old" }]
};

const updatedPreview: ProjectFileChangePreview = {
  relativePath: "src/App.tsx",
  currentContent: "old",
  nextContent: "newer",
  diff: [{ kind: "add", newLineNumber: 1, text: "newer" }]
};

describe("fileChanges", () => {
  it("adds and replaces previews by relative path", () => {
    expect(upsertFileChangePreview([], firstPreview)).toEqual([firstPreview]);
    expect(upsertFileChangePreview([firstPreview], updatedPreview)).toEqual([updatedPreview]);
  });

  it("removes previews by relative path", () => {
    expect(removeFileChangePreview([firstPreview], "src/App.tsx")).toEqual([]);
    expect(removeFileChangePreview([firstPreview], "src/Other.tsx")).toEqual([firstPreview]);
  });
});
