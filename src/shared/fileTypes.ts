import type { LineDiffEntry } from "./textDiff.js";

export type ProjectTextFile = {
  relativePath: string;
  content: string;
  size: number;
};

export type ProjectFileChangePreview = {
  relativePath: string;
  currentContent: string;
  nextContent: string;
  diff: LineDiffEntry[];
};
