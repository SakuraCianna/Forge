import test from "node:test";
import assert from "node:assert/strict";
import type { AgentPlanStep } from "../src/shared/agentTypes.js";
import { createAgentActionsFromPlanSteps } from "../src/shared/agentExecutionPlan.js";
import {
  parseDuckDuckGoHtmlSearchResults,
  searchWeb
} from "../src/main/webSearchService.js";
import {
  classifyDocumentationUrl,
  resolveOfficialDocsSource
} from "../src/shared/officialDocsSources.js";

test("web_search plan steps create a dedicated web-search action", () => {
  const steps: AgentPlanStep[] = [
    {
      id: "step-1",
      title: "Search docs",
      description: "Search the web for current Electron docs",
      kind: "inspect",
      status: "pending",
      target: "Electron latest BrowserWindow titleBarOverlay",
      tool: "web-search"
    }
  ];

  const actions = createAgentActionsFromPlanSteps(steps);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "web-search");
  assert.equal(actions[0].target, "Electron latest BrowserWindow titleBarOverlay");
});

test("DuckDuckGo HTML search parser extracts result links and snippets", () => {
  const html = `
    <div class="result">
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&amp;rut=abc">Example &amp; Docs</a>
      <a class="result__snippet">Current API reference for the example package.</a>
    </div>
  `;

  const results = parseDuckDuckGoHtmlSearchResults(html, 5);

  assert.deepEqual(results, [
    {
      title: "Example & Docs",
      url: "https://example.com/docs",
      snippet: "Current API reference for the example package.",
      source: "example.com",
      sourceType: "web",
      trustedSource: false,
      sourceLabel: "example.com"
    }
  ]);
});

test("searchWeb returns normalized web results from injected fetch", async () => {
  const searchHtml = `
    <li class="b_algo">
      <h2><a href="https://example.org/article">Article <strong>title</strong></a></h2>
      <p>A useful public article summary.</p>
    </li>
  `;
  const seenUrls: string[] = [];

  const result = await searchWeb(
    {
      query: "  current docs   ",
      limit: 1
    },
    {
      now: () => "2026-06-04T00:00:00.000Z",
      fetcher: async (url) => {
        seenUrls.push(url);
        return new Response(searchHtml, {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      }
    }
  );

  assert.equal(seenUrls.length, 1);
  assert.match(seenUrls[0], /^https:\/\/www\.bing\.com\/search\?q=current%20docs$/u);
  assert.equal(result.query, "current docs");
  assert.equal(result.fetchedAt, "2026-06-04T00:00:00.000Z");
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.results.map((item) => item.url),
    ["https://example.org/article"]
  );
  assert.deepEqual(
    result.results.map((item) => ({
      sourceLabel: item.sourceLabel,
      sourceType: item.sourceType,
      trustedSource: item.trustedSource
    })),
    [
      {
        sourceLabel: "example.org",
        sourceType: "web",
        trustedSource: false
      }
    ]
  );
});

test("searchWeb promotes official documentation results over generic web pages", async () => {
  const searchHtml = `
    <li class="b_algo">
      <h2><a href="https://example.org/react-guide">React guide</a></h2>
      <p>A third-party article about React APIs.</p>
    </li>
    <li class="b_algo">
      <h2><a href="https://react.dev/reference/react/useEffect">useEffect Reference</a></h2>
      <p>The official React API reference.</p>
    </li>
  `;

  const result = await searchWeb(
    {
      query: "React useEffect docs",
      limit: 1
    },
    {
      fetcher: async () =>
        new Response(searchHtml, {
          status: 200,
          headers: { "content-type": "text/html" }
        })
    }
  );

  assert.equal(result.results[0]?.url, "https://react.dev/reference/react/useEffect");
  assert.equal(result.results[0]?.sourceType, "official-docs");
  assert.equal(result.results[0]?.trustedSource, true);
  assert.equal(result.results[0]?.officialDocs?.id, "react");
  assert.equal(result.truncated, true);
});

test("searchWeb labels same-host official docs by the most specific path", async () => {
  const searchHtml = `
    <li class="b_algo">
      <h2><a href="https://learn.microsoft.com/dotnet/csharp/language-reference/">C# reference</a></h2>
      <p>Microsoft Learn C# language reference.</p>
    </li>
  `;

  const result = await searchWeb(
    {
      query: "C# language reference",
      limit: 1
    },
    {
      fetcher: async () =>
        new Response(searchHtml, {
          status: 200,
          headers: { "content-type": "text/html" }
        })
    }
  );

  assert.equal(result.results[0]?.sourceType, "official-docs");
  assert.equal(result.results[0]?.officialDocs?.id, "csharp");
  assert.equal(result.results[0]?.sourceLabel, "C#");
});

test("documentation source classification does not over-promote shared docs hosts", () => {
  const azureDocs = classifyDocumentationUrl("https://learn.microsoft.com/azure/app-service/");
  const githubRestDocs = classifyDocumentationUrl("https://docs.github.com/en/rest/issues/issues");

  assert.equal(azureDocs.type, "trusted-docs");
  assert.equal(azureDocs.label, "Microsoft Learn");
  assert.equal(azureDocs.officialDocs, undefined);
  assert.equal(githubRestDocs.type, "trusted-docs");
  assert.equal(githubRestDocs.label, "GitHub Docs");
  assert.equal(githubRestDocs.officialDocs, undefined);
});

test("official docs topic resolution prefers specific sources before broad aliases", () => {
  assert.equal(resolveOfficialDocsSource("Ruby on Rails routes")?.id, "rails");
  assert.equal(resolveOfficialDocsSource("ASP.NET Core controllers")?.id, "aspnet-core");
  assert.equal(resolveOfficialDocsSource("C# file IO")?.id, "csharp");
});
