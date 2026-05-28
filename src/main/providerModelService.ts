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
  fetcher = fetch
}: FetchModelsForProviderOptions): Promise<ForgeModel[]> {
  const hydratedProvider = hydrateProviderFromCatalog(provider);
  const apiKey = await keyVault.readProviderKey(hydratedProvider.id);

  if (hydratedProvider.requiresApiKey !== false && !apiKey) {
    throw new Error(`${hydratedProvider.label} API Key is not configured`);
  }

  const request = buildModelListRequest(hydratedProvider, apiKey ?? "");
  const response = await fetcher(request.url, {
    method: "GET",
    headers: request.headers
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `${hydratedProvider.label} model fetch failed: ${response.status} ${response.statusText}${detail}`
    );
  }

  const body = (await response.json()) as unknown;
  return parseProviderModelList(hydratedProvider, body).map((model) =>
    toForgeModel(hydratedProvider, model)
  );
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
