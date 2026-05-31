// 本文件说明: 验证文件变更预览的新增, 覆盖和删除
import { describe, expect, it } from "vitest";
import type { ProjectFileChangePreview } from "@shared/fileTypes";
import {
  attachFileChangePreviewSource,
  findFileChangePreviewSource,
  listFileChangePreviewSources,
  removeFileChangePreview,
  upsertFileChangePreview
} from "./fileChanges";

const firstPreview: ProjectFileChangePreview = {
  relativePath: "src/App.tsx",
  currentContent: "old",
  nextContent: "new",
  diff: [{ kind: "remove", oldLineNumber: 1, text: "old" }],
  source: {
    threadId: "thread-1",
    actionId: "action-1",
    actionLabel: "Edit src/App.tsx"
  }
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
    expect(upsertFileChangePreview([firstPreview], updatedPreview)).toEqual([
      {
        ...updatedPreview,
        source: firstPreview.source
      }
    ]);
  });

  it("removes previews by relative path", () => {
    expect(removeFileChangePreview([firstPreview], "src/App.tsx")).toEqual([]);
    expect(removeFileChangePreview([firstPreview], "src/Other.tsx")).toEqual([firstPreview]);
  });

  it("tracks the Agent action that produced a preview", () => {
    const source = {
      threadId: "thread-1",
      actionId: "action-2",
      actionLabel: "Edit src/App.tsx"
    };
    const sourcedPreview = attachFileChangePreviewSource(firstPreview, source);

    expect(sourcedPreview.source).toEqual(source);
    expect(findFileChangePreviewSource([sourcedPreview], "src/App.tsx")).toEqual(source);
    expect(findFileChangePreviewSource([sourcedPreview], "src/Other.tsx")).toBeNull();
  });

  it("deduplicates preview sources for batch application", () => {
    const source = {
      threadId: "thread-1",
      actionId: "action-2",
      actionLabel: "Edit src/App.tsx"
    };
    const otherSource = {
      threadId: "thread-1",
      actionId: "action-3",
      actionLabel: "Edit src/main.ts"
    };

    expect(
      listFileChangePreviewSources([
        attachFileChangePreviewSource(firstPreview, source),
        attachFileChangePreviewSource(updatedPreview, source),
        attachFileChangePreviewSource(
          { ...firstPreview, relativePath: "src/main.ts" },
          otherSource
        )
      ])
    ).toEqual([source, otherSource]);
  });
});
