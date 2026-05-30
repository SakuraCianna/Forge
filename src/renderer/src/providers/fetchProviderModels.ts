// 本文件说明: 从渲染层发起模型列表请求并统一错误文案
import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";
import {
  buildModelListRequest,
  parseProviderModelList,
  toForgeModel
} from "@shared/providerModels";
import {
  formatModelFetchHttpError,
  formatModelFetchNetworkError
} from "@shared/userFacingErrors";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

type FetchProviderModelsOptions = {
  provider: ForgeProvider;
  apiKey: string;
  fetcher?: Fetcher;
};

// 调用主进程模型接口, 失败时返回中文错误而不是抛到界面
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
    throw new Error(formatModelFetchNetworkError(provider.label, request.url, error), {
      cause: error
    });
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      formatModelFetchHttpError(provider.label, response.status, response.statusText, detail)
    );
  }

  const body = (await response.json()) as unknown;
  return parseProviderModelList(provider, body).map((model) => toForgeModel(provider, model));
}

// 从错误对象里提取短原因, 没有内容时给出通用提示
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const detail = text.trim().slice(0, 300);

    return detail ? ` - ${detail}` : "";
  } catch {
    return "";
  }
}
