// 本文件说明: 定义项目文件读取和修改预览的数据结构
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
  source?: {
    threadId: string;
    actionId: string;
    actionLabel: string;
  };
};
