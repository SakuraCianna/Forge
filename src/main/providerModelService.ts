// 本文件说明: 主进程 供应商模型服务
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import { hydrateProviderFromCatalog } from "../shared/providerCatalog.js";
import {
  buildModelListRequest,
  parseProviderModelList,
  toForgeModel
} from "../shared/providerModels.js";

type KeyReader = {
  readProviderKey: (providerId: string) => Promise<string | null>;
};

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type FetchModelsForProviderOptions = {
  provider: ForgeProvider;
  keyVault: KeyReader;
  fetcher?: Fetcher;
};

export async function fetchModelsForProvider({
  provider,
  keyVault,
  fetcher = runtimeFetch
}: FetchModelsForProviderOptions): Promise<ForgeModel[]> {
  const hydratedProvider = hydrateProviderFromCatalog(provider);
  const apiKey = await keyVault.readProviderKey(hydratedProvider.id);

  if (hydratedProvider.requiresApiKey !== false && !apiKey) {
    throw new Error(`${hydratedProvider.label} API Key is not configured`);
  }

  const request = buildModelListRequest(hydratedProvider, apiKey ?? "");
  let response: Response;

  try {
    response = await fetcher(request.url, {
      method: "GET",
      headers: request.headers
    });
  } catch (error) {
    throw new Error(createNetworkErrorMessage(hydratedProvider, request.url, error), {
      cause: error
    });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `${hydratedProvider.label} model fetch failed: ${response.status} ${response.statusText}${detail}`
    );
  }

  const body = await readJsonBody(hydratedProvider.label, response);
  return parseProviderModelList(hydratedProvider, body).map((model) =>
    toForgeModel(hydratedProvider, model)
  );
}

function createNetworkErrorMessage(provider: ForgeProvider, url: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);

  return [
    `${provider.label} model fetch failed: network request failed`,
    detail ? `(${detail})` : "",
    `Check Base URL, Electron proxy/network access, and whether this provider exposes ${url}.`
  ]
    .filter(Boolean)
    .join(" ");
}

async function runtimeFetch(url: string, init: RequestInit): Promise<Response> {
  if (isElectronRuntime()) {
    try {
      const electron = await import("electron");

      if (electron.net?.fetch) {
        return electron.net.fetch(url, init);
      }
    } catch {
      // Electron 网络栈在测试中不可用时回退到全局 fetch
    }
  }

  return fetch(url, init);
}

function isElectronRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.electron);
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const detail = text.trim().slice(0, 300);

    return detail ? ` - ${detail}` : "";
  } catch {
    return "";
  }
}

async function readJsonBody(providerLabel: string, response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new Error(`${providerLabel} returned an empty response`);
  }

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    if (trimmedText.startsWith("<")) {
      throw new Error(
        `${providerLabel} returned HTML instead of JSON. Check Base URL and model API compatibility.`
      );
    }

    throw new Error(
      `${providerLabel} returned invalid JSON. Check Base URL and model API compatibility.`
    );
  }
}
