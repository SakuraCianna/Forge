// 本文件说明: 共享模块 文本差异逻辑
export type LineDiffEntry =
  | { kind: "context"; oldLineNumber: number; newLineNumber: number; text: string }
  | { kind: "remove"; oldLineNumber: number; text: string }
  | { kind: "add"; newLineNumber: number; text: string };

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

function splitLines(value: string): string[] {
  return value.length === 0 ? [] : value.replace(/\r\n/g, "\n").split("\n");
}
