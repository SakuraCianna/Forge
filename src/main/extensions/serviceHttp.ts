// 本文件说明: 提供内置服务 Extension 共用的 HTTP 请求、重试和错误格式化能力
export type ServiceHttpRequestOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  retry?: boolean;
  service: string;
  timeoutMs?: number;
  url: string;
};

const defaultHttpRequestTimeoutMs = 30_000;
const maxHttpRequestAttempts = 3;
const retryableHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function requestJson<T = unknown>({
  body,
  headers = {},
  method = "GET",
  retry,
  service,
  timeoutMs = defaultHttpRequestTimeoutMs,
  url
}: ServiceHttpRequestOptions): Promise<T> {
  const shouldRetry = retry ?? method === "GET";
  const maxAttempts = shouldRetry ? maxHttpRequestAttempts : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          ...headers,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        method,
        signal: controller.signal
      });
      const rawText = await response.text();
      const data = parseJsonOrText(rawText);

      if (response.ok) {
        return data as T;
      }

      if (shouldRetry && attempt < maxAttempts && isRetryableHttpStatus(response.status)) {
        await waitBeforeRetry(response.headers, attempt);
        continue;
      }

      throw new Error(
        `${service} API request failed (${response.status})${formatAttemptSuffix(attempt)}: ${formatErrorPayload(data)}`
      );
    } catch (error) {
      if (shouldRetry && attempt < maxAttempts && isRetryableFetchError(error)) {
        await waitBeforeRetry(null, attempt);
        continue;
      }

      if (isAbortError(error)) {
        throw new Error(
          `${service} API request timed out after ${timeoutMs} ms${formatAttemptSuffix(attempt)}`,
          { cause: error }
        );
      }

      if (isNetworkFetchError(error)) {
        throw new Error(
          `${service} API request failed${formatAttemptSuffix(attempt)}: ${getErrorMessage(error)}`,
          { cause: error }
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${service} API request failed after ${maxAttempts} attempts`);
}

export function formatErrorPayload(value: unknown): string {
  if (isRecord(value)) {
    const message = value.message ?? value.error ?? value.error_description;
    if (typeof message === "string" && message.trim()) {
      return message.slice(0, 300);
    }
  }

  return JSON.stringify(value).slice(0, 300);
}

function isRetryableHttpStatus(status: number): boolean {
  return retryableHttpStatuses.has(status);
}

function isRetryableFetchError(error: unknown): boolean {
  return isAbortError(error) || isNetworkFetchError(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isNetworkFetchError(error: unknown): boolean {
  return error instanceof TypeError;
}

function formatAttemptSuffix(attempt: number): string {
  return attempt > 1 ? ` after ${attempt} attempts` : "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitBeforeRetry(headers: Headers | null, attempt: number): Promise<void> {
  const retryAfterMs = headers ? readRetryAfterMs(headers) : null;
  const fallbackMs = 150 * 2 ** (attempt - 1);
  await sleep(Math.min(retryAfterMs ?? fallbackMs, 1_500));
}

function readRetryAfterMs(headers: Headers): number | null {
  const value = headers.get("Retry-After")?.trim();

  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const timestamp = Date.parse(value);

  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseJsonOrText(value: string): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
