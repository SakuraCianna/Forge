// 本文件说明: 维护 OpenRouter 模型元数据缓存, 用作跨供应商价格和能力参考
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ForgeModel } from "../shared/modelTypes.js";
import { hydrateProviderFromCatalog, providerCatalog } from "../shared/providerCatalog.js";
import { parseProviderModelList, toForgeModel } from "../shared/providerModels.js";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type OpenRouterCatalogFile = {
  updatedAt: string;
  source: "openrouter";
  models: ForgeModel[];
};

export type OpenRouterModelCatalog = {
  refresh: () => Promise<ForgeModel[]>;
  read: () => Promise<ForgeModel[]>;
};

const openRouterModelsUrl = "https://openrouter.ai/api/v1/models";
const openRouterCatalogFileName = "models.json";

export function createOpenRouterModelCatalog({
  directory,
  fetcher = runtimeFetch
}: {
  directory: string;
  fetcher?: Fetcher;
}): OpenRouterModelCatalog {
  const filePath = join(directory, openRouterCatalogFileName);

  return {
    refresh: () => refreshOpenRouterModelCatalog(filePath, fetcher),
    read: () => readOpenRouterModelCatalog(filePath)
  };
}

async function refreshOpenRouterModelCatalog(
  filePath: string,
  fetcher: Fetcher
): Promise<ForgeModel[]> {
  try {
    const models = await fetchOpenRouterModels(fetcher);
    await writeOpenRouterModelCatalog(filePath, models);
    return models;
  } catch {
    return readOpenRouterModelCatalog(filePath);
  }
}

async function fetchOpenRouterModels(fetcher: Fetcher): Promise<ForgeModel[]> {
  const openRouterProvider = hydrateProviderFromCatalog(
    providerCatalog.find((provider) => provider.id === "openrouter")!
  );
  const headers: Record<string, string> = { Accept: "application/json" };
  const bootstrapKey = process.env.FORGE_OPENROUTER_BOOTSTRAP_KEY?.trim();

  if (bootstrapKey) {
    headers.Authorization = `Bearer ${bootstrapKey}`;
  }

  const response = await fetcher(openRouterModelsUrl, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models request failed: ${response.status}`);
  }

  const body = (await response.json()) as unknown;

  return parseProviderModelList(openRouterProvider, body).map((model) =>
    toForgeModel(openRouterProvider, model)
  );
}

async function readOpenRouterModelCatalog(filePath: string): Promise<ForgeModel[]> {
  try {
    const rawValue = await readFile(filePath, "utf8");
    const value = JSON.parse(rawValue) as unknown;

    if (!isOpenRouterCatalogFile(value)) {
      return [];
    }

    return value.models;
  } catch {
    return [];
  }
}

async function writeOpenRouterModelCatalog(
  filePath: string,
  models: ForgeModel[]
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const payload: OpenRouterCatalogFile = {
    updatedAt: new Date().toISOString(),
    source: "openrouter",
    models
  };

  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function runtimeFetch(url: string, init: RequestInit): Promise<Response> {
  if (typeof process !== "undefined" && process.versions?.electron) {
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

function isOpenRouterCatalogFile(value: unknown): value is OpenRouterCatalogFile {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as OpenRouterCatalogFile).models)
  );
}
