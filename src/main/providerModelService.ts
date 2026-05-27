import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
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
  fetcher = fetch
}: FetchModelsForProviderOptions): Promise<ForgeModel[]> {
  const apiKey = await keyVault.readProviderKey(provider.id);

  if (!apiKey) {
    throw new Error(`${provider.label} API Key is not configured`);
  }

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
