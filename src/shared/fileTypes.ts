// 本文件说明: 定义项目文件读取和修改预览的数据结构
import type { LineDiffEntry } from "./textDiff.js";

export type ProjectTextFile = {
  relativePath: string;
  content: string;
  size: number;
};

export type ProjectTextSearchRequest = {
  projectRoot: string;
  query: string;
  limit?: number;
  maxFileBytes?: number;
};

export type ProjectFileGlobRequest = {
  projectRoot: string;
  pattern: string;
  limit?: number;
};

export type ProjectFileGlobMatch = {
  relativePath: string;
  size: number;
};

export type ProjectFileGlobResult = {
  pattern: string;
  matches: ProjectFileGlobMatch[];
  truncated: boolean;
};

export type ProjectTextSearchMatch = {
  relativePath: string;
  lineNumber: number;
  preview: string;
};

export type ProjectTextSearchResult = {
  query: string;
  matches: ProjectTextSearchMatch[];
  truncated: boolean;
};

type ProjectFileChangeSource = {
  threadId: string;
  actionId?: string;
  actionLabel?: string;
};

export type ProjectFileChangePreview = {
  relativePath: string;
  currentContent: string;
  nextContent: string;
  diff: LineDiffEntry[];
  source?: ProjectFileChangeSource;
};
