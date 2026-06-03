// 本文件说明: 定义项目文件读取和修改预览的数据结构
import type { LineDiffEntry } from "./textDiff.js";

export type ProjectTextFile = {
  relativePath: string;
  content: string;
  size: number;
};

export type ProjectTextFilePreview = ProjectTextFile & {
  kind: "text";
  mediaType: string;
};

export type ProjectInlineFilePreview = {
  relativePath: string;
  kind: "image" | "pdf" | "audio" | "video";
  dataUrl: string;
  mediaType: string;
  size: number;
};

export type ProjectUnavailableFilePreview = {
  relativePath: string;
  kind: "office" | "unsupported";
  mediaType: string;
  reason: string;
  size: number;
};

export type ProjectFilePreview =
  | ProjectTextFilePreview
  | ProjectInlineFilePreview
  | ProjectUnavailableFilePreview;

export type ProjectTextSearchRequest = {
  projectRoot: string;
  query: string;
  limit?: number;
  maxFileBytes?: number;
};

export type ProjectDirectoryListRequest = {
  includeGitIgnored?: boolean;
  projectRoot: string;
  relativePath?: string;
  limit?: number;
  offset?: number;
};

export type ProjectDirectoryEntry = {
  name: string;
  relativePath: string;
  kind: "directory" | "file";
  size?: number;
};

export type ProjectDirectoryListResult = {
  relativePath: string;
  entries: ProjectDirectoryEntry[];
  truncated: boolean;
  nextOffset?: number;
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
  changeKind: "create" | "edit" | "delete";
  source?: ProjectFileChangeSource;
};

export type ProjectFileDeleteResult = {
  relativePath: string;
  size: number;
};
