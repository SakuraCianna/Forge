// 本文件说明: 拉取远端模型列表并转换成 Forge 可用模型
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import { hydrateProviderFromCatalog } from "../shared/providerCatalog.js";
import {
  buildModelListRequest,
  parseProviderModelList,
  toForgeModel
} from "../shared/providerModels.js";
import {
  formatEmptyProviderResponse,
  formatHtmlInsteadOfJson,
  formatInvalidJson,
  formatMissingApiKey,
  formatModelFetchHttpError,
  formatModelFetchNetworkError
} from "../shared/userFacingErrors.js";

type KeyReader = {
  readProviderKey: (providerId: string) => Promise<string | null>;
};

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type FetchModelsForProviderOptions = {
  provider: ForgeProvider;
  keyVault: KeyReader;
  openRouterCatalog?: {
    read: () => Promise<ForgeModel[]>;
  };
  fetcher?: Fetcher;
};

// 构造供应商请求并解析返回模型, 网络错误统一转成中文可读提示
export async function fetchModelsForProvider({
  provider,
  keyVault,
  openRouterCatalog,
  fetcher = runtimeFetch
}: FetchModelsForProviderOptions): Promise<ForgeModel[]> {
  const hydratedProvider = hydrateProviderFromCatalog(provider);
  const apiKey = await keyVault.readProviderKey(hydratedProvider.id);

  if (hydratedProvider.requiresApiKey !== false && !apiKey) {
    throw new Error(formatMissingApiKey(hydratedProvider.label));
  }

  const request = buildModelListRequest(hydratedProvider, apiKey ?? "");
  let response: Response;

  try {
    response = await fetcher(request.url, {
      method: "GET",
      headers: request.headers
    });
  } catch (error) {
    throw new Error(formatModelFetchNetworkError(hydratedProvider.label, request.url, error), {
      cause: error
    });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      formatModelFetchHttpError(
        hydratedProvider.label,
        response.status,
        response.statusText,
        detail
      )
    );
  }

  const body = await readJsonBody(hydratedProvider.label, response);
  const models = parseProviderModelList(hydratedProvider, body).map((model) =>
    toForgeModel(hydratedProvider, model)
  );

  if (hydratedProvider.id === "openrouter" || !openRouterCatalog) {
    return models;
  }

  const openRouterModels = await openRouterCatalog.read();

  return enrichModelsWithOpenRouterReference(models, openRouterModels);
}

// 用 OpenRouter 的公开元数据给其他供应商补价格, 上下文和缓存价格, 保留原供应商为实际计费来源
function enrichModelsWithOpenRouterReference(
  models: ForgeModel[],
  openRouterModels: ForgeModel[]
): ForgeModel[] {
  if (openRouterModels.length === 0) {
    return models;
  }

  const lookup = createOpenRouterModelLookup(openRouterModels);

  return models.map((model) => {
    const reference = lookup.get(normalizeModelAlias(model.modelName));

    if (!reference) {
      return model;
    }

    return {
      ...model,
      pricing: mergePricing(model.pricing, reference.pricing),
      capabilities: {
        ...model.capabilities,
        contextWindow:
          model.capabilities.contextWindow ?? reference.capabilities.contextWindow,
        toolCalling:
          model.capabilities.toolCalling === "unknown"
            ? reference.capabilities.toolCalling
            : model.capabilities.toolCalling,
        streaming:
          model.capabilities.streaming === "unknown"
            ? reference.capabilities.streaming
            : model.capabilities.streaming,
        vision:
          model.capabilities.vision === "unknown"
            ? reference.capabilities.vision
            : model.capabilities.vision
      }
    };
  });
}

function createOpenRouterModelLookup(models: ForgeModel[]): Map<string, ForgeModel> {
  const lookup = new Map<string, ForgeModel>();

  for (const model of models) {
    const aliases = new Set([
      normalizeModelAlias(model.modelName),
      normalizeModelAlias(model.modelName.split("/").at(-1) ?? model.modelName)
    ]);

    for (const alias of aliases) {
      if (alias && !lookup.has(alias)) {
        lookup.set(alias, model);
      }
    }
  }

  return lookup;
}

function mergePricing(
  providerPricing: ForgeModel["pricing"],
  openRouterPricing: ForgeModel["pricing"]
): ForgeModel["pricing"] {
  if (!openRouterPricing) {
    return providerPricing;
  }

  if (!providerPricing) {
    return {
      ...openRouterPricing,
      source: "openrouter-reference"
    };
  }

  if (providerPricing.source === "openrouter-reference") {
    return {
      ...openRouterPricing,
      source: "openrouter-reference"
    };
  }

  return {
    inputPerMillion: providerPricing.inputPerMillion,
    outputPerMillion: providerPricing.outputPerMillion,
    cacheReadPerMillion:
      providerPricing.cacheReadPerMillion ?? openRouterPricing.cacheReadPerMillion,
    cacheWritePerMillion:
      providerPricing.cacheWritePerMillion ?? openRouterPricing.cacheWritePerMillion,
    source: providerPricing.source ?? "provider-api"
  };
}

function normalizeModelAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^models\//u, "")
    .replace(/[:_\s]+/gu, "-");
}

// 在 Electron 运行时优先使用 net.fetch, 测试和浏览器回退到全局 fetch
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

// 判断当前是否在 Electron 主进程运行
function isElectronRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.electron);
}

// 从错误响应中提取短文本, JSON 和纯文本都尽量读出关键原因
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const detail = text.trim().slice(0, 300);

    return detail ? ` - ${detail}` : "";
  } catch {
    return "";
  }
}

// 读取并校验 JSON 响应体, 非 JSON 内容会返回结构化错误
async function readJsonBody(providerLabel: string, response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmedText = text.trim();

  if (!trimmedText) {
    throw new Error(formatEmptyProviderResponse(providerLabel));
  }

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    if (trimmedText.startsWith("<")) {
      throw new Error(formatHtmlInsteadOfJson(providerLabel, "model API compatibility"));
    }

    throw new Error(formatInvalidJson(providerLabel, "model API compatibility"));
  }
}
