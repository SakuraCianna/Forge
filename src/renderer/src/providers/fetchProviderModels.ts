import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";
import {
  buildModelListRequest,
  parseProviderModelList,
  toForgeModel
} from "@shared/providerModels";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type FetchProviderModelsOptions = {
  provider: ForgeProvider;
  apiKey: string;
  fetcher?: Fetcher;
};

export async function fetchProviderModels({
  provider,
  apiKey,
  fetcher = fetch
}: FetchProviderModelsOptions): Promise<ForgeModel[]> {
  const request = buildModelListRequest(provider, apiKey);
  let response: Response;

  try {
    response = await fetcher(request.url, {
      method: "GET",
      headers: request.headers
    });
  } catch (error) {
    throw new Error(createNetworkErrorMessage(provider, request.url, error), {
      cause: error
    });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`${provider.label} model fetch failed: ${response.status} ${response.statusText}${detail}`);
  }

  const body = (await response.json()) as unknown;
  return parseProviderModelList(provider, body).map((model) => toForgeModel(provider, model));
}

function createNetworkErrorMessage(provider: ForgeProvider, url: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);

  return [
    `${provider.label} model fetch failed: network request failed`,
    detail ? `(${detail})` : "",
    `Check Base URL, proxy/network access, and whether this provider exposes ${url}.`
  ]
    .filter(Boolean)
    .join(" ");
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
