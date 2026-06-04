// 本文件说明: 注册内置 web_search IPC, 让渲染层只能提交受控查询请求
import { webSearchChannels } from "../shared/ipcChannels.js";
import type { WebSearchRequest, WebSearchResult } from "../shared/webSearchTypes.js";

type SearchWeb = (request: WebSearchRequest) => Promise<WebSearchResult>;
type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;
type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export function registerWebSearchHandlers(
  searchWeb: SearchWeb,
  registerHandler: RegisterHandler
): void {
  registerHandler(webSearchChannels.search, async (_event, request) =>
    searchWeb(assertWebSearchRequest(request))
  );
}

function assertWebSearchRequest(value: unknown): WebSearchRequest {
  if (!isRecord(value) || typeof value.query !== "string") {
    throw new Error("Invalid web search request");
  }

  return {
    query: value.query,
    limit: typeof value.limit === "number" ? value.limit : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
