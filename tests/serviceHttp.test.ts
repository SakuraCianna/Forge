import test from "node:test";
import assert from "node:assert/strict";

type RequestJson = <T = unknown>(options: {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  retry?: boolean;
  service: string;
  timeoutMs?: number;
  url: string;
}) => Promise<T>;

test("service HTTP helper retries transient GET responses and parses JSON payloads", async () => {
  const { requestJson } = (await importServiceHttpModule()) as {
    requestJson: RequestJson;
  };
  const restoreFetch = installMockFetch(async (_url, init) => {
    calls.push(init);

    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "secondary rate limit" }), {
        headers: {
          "Retry-After": "0"
        },
        status: 429
      });
    }

    return Response.json({ login: "octocat" });
  });
  const calls: RequestInit[] = [];

  try {
    const result = await requestJson<{ login: string }>({
      headers: {
        Authorization: "Bearer test-token"
      },
      service: "GitHub",
      url: "https://api.github.com/user"
    });

    assert.deepEqual(result, { login: "octocat" });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.method, "GET");
    assert.deepEqual(calls[0]?.headers, {
      Authorization: "Bearer test-token"
    });
  } finally {
    restoreFetch();
  }
});

async function importServiceHttpModule(): Promise<unknown> {
  const modulePath = "../src/main/extensions/serviceHttp.js";
  return import(modulePath);
}

function installMockFetch(handler: (url: string, init: RequestInit) => Promise<Response>): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init ?? {});
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
