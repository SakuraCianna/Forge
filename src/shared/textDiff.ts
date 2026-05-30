// 本文件说明: 生成文本文件的逐行 diff 预览
export type LineDiffEntry =
  | { kind: "context"; oldLineNumber: number; newLineNumber: number; text: string }
  | { kind: "remove"; oldLineNumber: number; text: string }
  | { kind: "add"; newLineNumber: number; text: string };

export type AnnotatedLineDiffEntry = LineDiffEntry & {
  hunkIndex: number | null;
  hunkStart: boolean;
};

export type LineDiffHunkDecision = "discard" | "keep-only";

// 使用 LCS 生成稳定的逐行 diff, 避免整文件替换看起来过于吓人
export function createLineDiff(oldText: string, newText: string): LineDiffEntry[] {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const table = buildLcsTable(oldLines, newLines);
  const entries: LineDiffEntry[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      entries.push({
        kind: "context",
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
        text: oldLines[oldIndex]
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (
      newIndex < newLines.length &&
      (oldIndex === oldLines.length || table[oldIndex][newIndex + 1] > table[oldIndex + 1][newIndex])
    ) {
      entries.push({
        kind: "add",
        newLineNumber: newIndex + 1,
        text: newLines[newIndex]
      });
      newIndex += 1;
      continue;
    }

    if (oldIndex < oldLines.length) {
      entries.push({
        kind: "remove",
        oldLineNumber: oldIndex + 1,
        text: oldLines[oldIndex]
      });
      oldIndex += 1;
    }
  }

  return entries;
}

// 给逐行 diff 标注变更块编号, 供 UI 做块级接受或拒绝
export function annotateLineDiffHunks(entries: LineDiffEntry[]): AnnotatedLineDiffEntry[] {
  let hunkIndex = -1;
  let insideHunk = false;

  return entries.map((entry) => {
    if (entry.kind === "context") {
      insideHunk = false;

      return {
        ...entry,
        hunkIndex: null,
        hunkStart: false
      };
    }

    const hunkStart = !insideHunk;

    if (hunkStart) {
      hunkIndex += 1;
      insideHunk = true;
    }

    return {
      ...entry,
      hunkIndex,
      hunkStart
    };
  });
}

// 按单个变更块决策重建文本, 支持拒绝此块或只保留此块
export function createTextFromLineDiffHunkDecision(
  entries: LineDiffEntry[],
  targetHunkIndex: number,
  decision: LineDiffHunkDecision
): string {
  const lines = annotateLineDiffHunks(entries).flatMap((entry) => {
    if (entry.kind === "context") {
      return [entry.text];
    }

    const isTargetHunk = entry.hunkIndex === targetHunkIndex;
    const shouldUseNextLine =
      decision === "discard" ? !isTargetHunk : isTargetHunk;

    if (entry.kind === "add") {
      return shouldUseNextLine ? [entry.text] : [];
    }

    return shouldUseNextLine ? [] : [entry.text];
  });

  return lines.join("\n");
}

// 构建最长公共子序列表, 后续回溯用它判断新增和删除
function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const table = Array.from({ length: oldLines.length + 1 }, () =>
    Array.from({ length: newLines.length + 1 }, () => 0)
  );

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? table[oldIndex + 1][newIndex + 1] + 1
          : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }

  return table;
}

// 保留空文件语义, 其他文本按换行拆成 diff 行
function splitLines(value: string): string[] {
  return value.length === 0 ? [] : value.replace(/\r\n/g, "\n").split("\n");
}
