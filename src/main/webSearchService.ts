// 本文件说明: 内置 web_search 只读工具, 在主进程访问公网并返回压缩后的搜索结果
import type {
  WebSearchRequest,
  WebSearchResult,
  WebSearchResultItem
} from "../shared/webSearchTypes.js";
import { classifyDocumentationUrl } from "../shared/officialDocsSources.js";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type SearchWebOptions = {
  fetcher?: Fetcher;
  now?: () => string;
  timeoutMs?: number;
};

type InstantAnswerTopic = {
  FirstURL?: unknown;
  Text?: unknown;
  Topics?: unknown;
};

type InstantAnswerResponse = {
  AbstractText?: unknown;
  AbstractURL?: unknown;
  Heading?: unknown;
  RelatedTopics?: unknown;
};

type SearchResultDraft = {
  title: string;
  url: string;
  snippet: string;
};

const defaultSearchLimit = 8;
const maxSearchLimit = 12;
const maxQueryLength = 300;
const bingSearchEndpoint = "https://www.bing.com/search";
const jinaSearchEndpoint = "https://s.jina.ai/";
const duckDuckGoHtmlEndpoint = "https://html.duckduckgo.com/html/";
const duckDuckGoInstantAnswerEndpoint = "https://api.duckduckgo.com/";
const userAgent =
  "Forge/0.1 local coding agent (+https://github.com/SakuraCianna/Forge)";

export async function searchWeb(
  request: WebSearchRequest,
  {
    fetcher = fetch,
    now = () => new Date().toISOString(),
    timeoutMs = 10000
  }: SearchWebOptions = {}
): Promise<WebSearchResult> {
  const query = normalizeSearchQuery(request.query);
  const limit = clampSearchLimit(request.limit);
  const candidateLimit = Math.min(maxSearchLimit, Math.max(limit + 4, limit));
  const results = rankWebSearchResults(await searchDuckDuckGo(query, candidateLimit, fetcher, timeoutMs));

  return {
    query,
    results: results.slice(0, limit),
    fetchedAt: now(),
    truncated: results.length > limit
  };
}

async function searchDuckDuckGo(
  query: string,
  limit: number,
  fetcher: Fetcher,
  timeoutMs: number
): Promise<WebSearchResultItem[]> {
  try {
    const bingSearchUrl = `${bingSearchEndpoint}?q=${encodeURIComponent(query)}`;
    const html = await fetchText(bingSearchUrl, fetcher, timeoutMs, "text/html");
    const bingResults = parseBingHtmlSearchResults(html, limit + 1);

    if (bingResults.length > 0) {
      return bingResults;
    }
  } catch {
    // Bing HTML 搜索不可达时继续降级, 不让单一搜索源阻断 Agent。
  }

  try {
    const jinaSearchUrl = `${jinaSearchEndpoint}${encodeURIComponent(query)}`;
    const text = await fetchText(jinaSearchUrl, fetcher, timeoutMs, "text/plain");
    const jinaResults = parseJinaSearchResults(text, limit + 1);

    if (jinaResults.length > 0) {
      return jinaResults;
    }
  } catch {
    // Jina Search 可能被限流或网络不可达, 继续尝试其他只读来源。
  }

  const htmlSearchUrl = `${duckDuckGoHtmlEndpoint}?q=${encodeURIComponent(query)}`;

  try {
    const html = await fetchText(htmlSearchUrl, fetcher, timeoutMs, "text/html");
    const htmlResults = parseDuckDuckGoHtmlSearchResults(html, limit + 1);

    if (htmlResults.length > 0) {
      return htmlResults;
    }
  } catch {
    // DuckDuckGo HTML 页面不稳定时降级到 Instant Answer, 保持工具可用。
  }

  const instantAnswerUrl = `${duckDuckGoInstantAnswerEndpoint}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const instantAnswer = await fetchJson<InstantAnswerResponse>(
    instantAnswerUrl,
    fetcher,
    timeoutMs
  );

  return parseDuckDuckGoInstantAnswerResults(instantAnswer, limit + 1);
}

async function fetchText(
  url: string,
  fetcher: Fetcher,
  timeoutMs: number,
  accept: string
): Promise<string> {
  const response = await fetcher(url, {
    headers: {
      accept,
      "user-agent": userAgent
    },
    signal: createTimeoutSignal(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Web search request failed with HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchJson<T>(
  url: string,
  fetcher: Fetcher,
  timeoutMs: number
): Promise<T> {
  const text = await fetchText(url, fetcher, timeoutMs, "application/json");

  return JSON.parse(text) as T;
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(Math.max(1000, timeoutMs))
    : undefined;
}

function normalizeSearchQuery(query: string): string {
  const normalized = query.replace(/\s+/g, " ").trim().slice(0, maxQueryLength);

  if (!normalized) {
    throw new Error("Web search query is required");
  }

  return normalized;
}

function clampSearchLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return defaultSearchLimit;
  }

  return Math.min(maxSearchLimit, Math.max(1, Math.round(limit)));
}

export function parseJinaSearchResults(
  text: string,
  limit = defaultSearchLimit
): WebSearchResultItem[] {
  const blocks = text.split(/\n(?=Title:\s+)/u);
  const results: WebSearchResultItem[] = [];
  const seenUrls = new Set<string>();

  for (const block of blocks) {
    if (results.length >= limit) {
      break;
    }

    const titleMatch = /^Title:\s*(.+)$/imu.exec(block);
    const urlMatch = /^URL Source:\s*(https?:\/\/\S+)$/imu.exec(block);

    if (!titleMatch || !urlMatch) {
      continue;
    }

    const title = titleMatch[1]?.trim() ?? "";
    const url = urlMatch[1]?.trim() ?? "";

    if (!title || !url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    results.push(createSearchResultItem(title, url, extractJinaSnippet(block)));
  }

  return results;
}

export function parseBingHtmlSearchResults(
  html: string,
  limit = defaultSearchLimit
): WebSearchResultItem[] {
  const blocks = [...html.matchAll(/<li\b[^>]*class="[^"]*\bb_algo\b[^"]*"[\s\S]*?<\/li>/giu)];
  const results: WebSearchResultItem[] = [];
  const seenUrls = new Set<string>();

  for (const blockMatch of blocks) {
    if (results.length >= limit) {
      break;
    }

    const block = blockMatch[0];
    const linkMatch =
      /<h2[^>]*>[\s\S]*?<a\b[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/iu.exec(
        block
      );

    if (!linkMatch) {
      continue;
    }

    const title = normalizeSearchText(linkMatch[2] ?? "");
    const url = normalizeBingResultUrl(linkMatch[1] ?? "");

    if (!title || !url || seenUrls.has(url)) {
      continue;
    }

    const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/iu.exec(block);

    seenUrls.add(url);
    results.push(createSearchResultItem(title, url, snippetMatch ? normalizeSearchText(snippetMatch[1] ?? "") : ""));
  }

  return results;
}

export function parseDuckDuckGoHtmlSearchResults(
  html: string,
  limit = defaultSearchLimit
): WebSearchResultItem[] {
  const linkMatches = [...html.matchAll(/<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu)];
  const results: WebSearchResultItem[] = [];
  const seenUrls = new Set<string>();

  for (let index = 0; index < linkMatches.length && results.length < limit; index += 1) {
    const match = linkMatches[index];
    const rawUrl = match[1] ?? "";
    const title = normalizeSearchText(match[2] ?? "");
    const url = normalizeDuckDuckGoResultUrl(rawUrl);

    if (!title || !url || seenUrls.has(url)) {
      continue;
    }

    const nextIndex = linkMatches[index + 1]?.index ?? html.length;
    const block = html.slice((match.index ?? 0) + match[0].length, nextIndex);
    const snippet = extractDuckDuckGoSnippet(block);

    seenUrls.add(url);
    results.push(createSearchResultItem(title, url, snippet));
  }

  return results;
}

function extractJinaSnippet(block: string): string {
  const content = block
    .replace(/^Title:\s*.+$/gimu, "")
    .replace(/^URL Source:\s*https?:\/\/\S+$/gimu, "")
    .replace(/^Markdown Content:\s*$/gimu, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(\[.*\]\(https?:\/\/|Image \d+:)/iu.test(line))
    .join(" ");

  return content.replace(/\s+/gu, " ").slice(0, 300).trim();
}

function parseDuckDuckGoInstantAnswerResults(
  payload: InstantAnswerResponse,
  limit: number
): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];
  const seenUrls = new Set<string>();
  const abstractText = typeof payload.AbstractText === "string" ? payload.AbstractText.trim() : "";
  const abstractUrl = typeof payload.AbstractURL === "string" ? payload.AbstractURL.trim() : "";
  const heading = typeof payload.Heading === "string" ? payload.Heading.trim() : "";

  if (abstractText && abstractUrl) {
    pushInstantAnswerResult(results, seenUrls, {
      title: heading || abstractUrl,
      url: abstractUrl,
      snippet: abstractText
    });
  }

  readInstantAnswerTopics(payload.RelatedTopics, results, seenUrls, limit);

  return results.slice(0, limit);
}

function readInstantAnswerTopics(
  value: unknown,
  results: WebSearchResultItem[],
  seenUrls: Set<string>,
  limit: number
): void {
  if (!Array.isArray(value) || results.length >= limit) {
    return;
  }

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const topic = item as InstantAnswerTopic;

    if (Array.isArray(topic.Topics)) {
      readInstantAnswerTopics(topic.Topics, results, seenUrls, limit);
      continue;
    }

    const text = typeof topic.Text === "string" ? topic.Text.trim() : "";
    const url = typeof topic.FirstURL === "string" ? topic.FirstURL.trim() : "";

    if (text && url) {
      pushInstantAnswerResult(results, seenUrls, {
        title: text.split(" - ")[0]?.trim() || text.slice(0, 80),
        url,
        snippet: text
      });
    }

    if (results.length >= limit) {
      break;
    }
  }
}

function pushInstantAnswerResult(
  results: WebSearchResultItem[],
  seenUrls: Set<string>,
  result: SearchResultDraft
): void {
  if (!result.url || seenUrls.has(result.url)) {
    return;
  }

  seenUrls.add(result.url);
  results.push(createSearchResultItem(result.title, result.url, result.snippet));
}

function createSearchResultItem(title: string, url: string, snippet: string): WebSearchResultItem {
  const classification = classifyDocumentationUrl(url);

  return {
    title,
    url,
    snippet,
    source: getUrlHostname(url),
    sourceType: classification.type,
    trustedSource: classification.trusted,
    sourceLabel: classification.label,
    ...(classification.officialDocs ? { officialDocs: classification.officialDocs } : {})
  };
}

function rankWebSearchResults(results: WebSearchResultItem[]): WebSearchResultItem[] {
  return results
    .map((result, index) => ({
      index,
      result,
      score: scoreWebSearchResult(result)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.result);
}

function scoreWebSearchResult(result: WebSearchResultItem): number {
  if (result.sourceType === "official-docs") {
    return 20;
  }

  if (result.sourceType === "trusted-docs") {
    return 10;
  }

  return 0;
}

function normalizeDuckDuckGoResultUrl(value: string): string {
  const decodedValue = decodeHtmlEntities(value).trim();

  try {
    const url = decodedValue.startsWith("//")
      ? new URL(`https:${decodedValue}`)
      : new URL(decodedValue, "https://duckduckgo.com");
    const encodedDestination = url.searchParams.get("uddg");

    if (encodedDestination) {
      return new URL(encodedDestination).toString();
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function normalizeBingResultUrl(value: string): string {
  const decodedValue = decodeHtmlEntities(value).trim();

  try {
    const url = new URL(decodedValue);

    if (url.hostname.endsWith("bing.com")) {
      const redirectedUrl = decodeBingRedirectUrl(url.searchParams.get("u"));

      if (redirectedUrl) {
        return redirectedUrl;
      }
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function decodeBingRedirectUrl(value: string | null): string | null {
  if (!value?.startsWith("a1")) {
    return null;
  }

  try {
    const base64Url = value.slice(2).replace(/-/gu, "+").replace(/_/gu, "/");
    const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
    const decoded = Buffer.from(`${base64Url}${padding}`, "base64").toString("utf8");
    const url = new URL(decoded);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractDuckDuckGoSnippet(block: string): string {
  const snippetMatch =
    /<a\b[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/iu.exec(block) ??
    /<div\b[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/iu.exec(block);

  return snippetMatch ? normalizeSearchText(snippetMatch[1] ?? "") : "";
}

function normalizeSearchText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/gu, " "))
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);

      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);

      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return namedEntities[normalizedEntity] ?? match;
  });
}

function getUrlHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./iu, "");
  } catch {
    return "web";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
