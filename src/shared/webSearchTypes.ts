// 本文件说明: 定义内置 web_search 工具在主进程和渲染进程之间传递的数据结构
import type {
  DocumentationSourceType,
  OfficialDocsSource
} from "./officialDocsSources.js";

export type WebSearchRequest = {
  query: string;
  limit?: number;
};

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  sourceType: DocumentationSourceType;
  trustedSource: boolean;
  sourceLabel: string;
  officialDocs?: OfficialDocsSource;
};

export type WebSearchResult = {
  query: string;
  results: WebSearchResultItem[];
  fetchedAt: string;
  truncated: boolean;
};
