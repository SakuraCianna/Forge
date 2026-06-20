import test from "node:test";
import assert from "node:assert/strict";
import { formatWebSearchResultMessage } from "../src/renderer/src/agent/projectToolResultMessages.js";
import type { WebSearchResult } from "../src/shared/webSearchTypes.js";

test("web search result summaries show official and trusted documentation labels", () => {
  const result: WebSearchResult = {
    query: "React docs",
    fetchedAt: "2026-06-20T00:00:00.000Z",
    truncated: false,
    results: [
      {
        title: "useEffect Reference",
        url: "https://react.dev/reference/react/useEffect",
        snippet: "Official React API reference.",
        source: "react.dev",
        sourceType: "official-docs",
        trustedSource: true,
        sourceLabel: "React"
      },
      {
        title: "Azure App Service",
        url: "https://learn.microsoft.com/azure/app-service/",
        snippet: "Microsoft Learn documentation.",
        source: "learn.microsoft.com",
        sourceType: "trusted-docs",
        trustedSource: true,
        sourceLabel: "Microsoft Learn"
      }
    ]
  };

  const zhSummary = formatWebSearchResultMessage("zh-CN", result);
  const enSummary = formatWebSearchResultMessage("en-US", result);

  assert.match(zhSummary, /官方文档: React/u);
  assert.match(zhSummary, /可信文档: Microsoft Learn/u);
  assert.match(enSummary, /Official docs: React/u);
  assert.match(enSummary, /Trusted docs: Microsoft Learn/u);
});
