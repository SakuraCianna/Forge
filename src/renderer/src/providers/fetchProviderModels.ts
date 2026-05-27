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
    throw new Error(`${provider.label} model fetch failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as unknown;
  return parseProviderModelList(provider, body).map((model) => toForgeModel(provider, model));
}
