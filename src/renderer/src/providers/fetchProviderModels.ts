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
  const response = await fetcher(request.url, {
    method: "GET",
    headers: request.headers
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`${provider.label} model fetch failed: ${response.status} ${response.statusText}${detail}`);
  }

  const body = (await response.json()) as unknown;
  return parseProviderModelList(provider, body).map((model) => toForgeModel(provider, model));
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
