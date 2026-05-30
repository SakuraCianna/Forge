// 本文件说明: 构造供应商模型列表请求并筛选适合编码的模型
import type {
  ForgeModel,
  ForgeProvider,
  ModelPricing,
  ReasoningControl,
  SpeedMode
} from "./modelTypes.js";
import {
  formatHeaderLineBreaks,
  formatHeaderNonAscii,
  formatMissingBaseUrl
} from "./userFacingErrors.js";

type ModelListRequest = {
  url: string;
  headers: Record<string, string>;
};

type FetchedModel = {
  id: string;
  label: string;
  contextWindow?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  pricing?: ModelPricing;
  supportedParameters?: string[];
};

type UnknownRecord = Record<string, unknown>;

// 根据供应商类型拼出模型列表请求, 鉴权头在这里统一处理
export function buildModelListRequest(provider: ForgeProvider, apiKey: string): ModelListRequest {
  const baseUrl = trimTrailingSlash(provider.baseUrl ?? "");
  const headerApiKey = normalizeApiKeyForHeader(apiKey);
  const extraHeaders = validateHeaders(provider.requestHeaders ?? {});

  if (!baseUrl && !provider.modelListUrl) {
    throw new Error(formatMissingBaseUrl(provider.label));
  }

  if (provider.kind === "anthropic") {
    return {
      url: provider.modelListUrl ?? `${baseUrl}/v1/models`,
      headers: {
        ...extraHeaders,
        "x-api-key": assertHeaderValue("x-api-key", headerApiKey),
        "anthropic-version": "2023-06-01"
      }
    };
  }

  if (provider.kind === "gemini") {
    return {
      url: `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      headers: extraHeaders
    };
  }

  const headers = applyAuthHeader({ ...extraHeaders }, provider, headerApiKey);

  return {
    url: provider.modelListUrl ?? `${baseUrl}/models`,
    headers
  };
}

// 把不同供应商返回解析成 ForgeModel 列表
export function parseProviderModelList(provider: ForgeProvider, response: unknown): FetchedModel[] {
  // 先保留适合编码的模型, 避免下拉框塞入语音图片模型
  const filterCodingModels = (models: FetchedModel[]): FetchedModel[] =>
    models.filter((model) => isUsableCodingModel(provider, model.id, model));

  if (Array.isArray(response)) {
    return filterCodingModels(parseModelItems(response, provider.kind === "anthropic"));
  }

  if (!isRecord(response)) {
    return [];
  }

  if (provider.kind === "gemini") {
    return filterCodingModels(parseGeminiModels(response));
  }

  return filterCodingModels(parseOpenAICompatibleModels(response, provider.kind === "anthropic"));
}

// 把远端模型条目转换成 Forge 内部模型结构
export function toForgeModel(provider: ForgeProvider, fetchedModel: FetchedModel): ForgeModel {
  const capabilities = inferFetchedModelCapabilities(provider, fetchedModel.id, fetchedModel);

  return {
    id: `${provider.id}:${fetchedModel.id}`,
    providerId: provider.id,
    label: fetchedModel.label,
    modelName: fetchedModel.id,
    enabled: false,
    capabilities: {
      reasoning: capabilities.reasoning,
      toolCalling: capabilities.toolCalling,
      streaming: capabilities.streaming,
      vision: capabilities.vision,
      contextWindow: fetchedModel.contextWindow,
      speedModes: capabilities.speedModes
    },
    pricing: fetchedModel.pricing,
    capabilitySource: "provider-api"
  };
}

// 清理 Key 空白和换行, 防止无效请求头
export function normalizeApiKeyForHeader(apiKey: string): string {
  return apiKey.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
}

// 阻止控制字符进入请求头, 避免 fetch 直接抛错
export function assertHeaderValue(headerName: string, value: string): string {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (codePoint > 255) {
      throw new Error(formatHeaderNonAscii(headerName));
    }

    if (character === "\r" || character === "\n") {
      throw new Error(formatHeaderLineBreaks(headerName));
    }
  }

  return value;
}

// 从模型名推断基础能力, 供应商未返回能力时使用
function inferFetchedModelCapabilities(
  provider: ForgeProvider,
  modelName: string,
  metadata?: Pick<FetchedModel, "inputModalities" | "supportedParameters">
): {
  reasoning: ReasoningControl;
  speedModes?: SpeedMode[];
  toolCalling: boolean | "unknown";
  streaming: boolean | "unknown";
  vision: boolean | "unknown";
} {
  const normalizedModelName = modelName.toLowerCase();
  const speedModes = inferSpeedModes(provider, normalizedModelName, metadata);
  const toolCalling = inferToolCalling(metadata);
  const streaming = inferStreaming(metadata);
  const vision = inferVision(metadata);

  if (provider.reasoningStyle === "mimo-thinking" && isMimoThinkingModel(normalizedModelName)) {
    return {
      reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
      speedModes,
      toolCalling,
      streaming,
      vision
    };
  }

  if (provider.kind === "gemini" && /(^|[-.])2\.5([-_.]|$)/.test(normalizedModelName)) {
    return {
      reasoning: { type: "budget", min: 0, max: 32768 },
      speedModes,
      toolCalling,
      streaming,
      vision
    };
  }

  if (provider.id === "deepseek" && /(^|[-_])(reasoner|r1)([-_]|$)/.test(normalizedModelName)) {
    return {
      reasoning: { type: "effort", values: ["low", "medium", "high", "xhigh"] },
      speedModes,
      toolCalling,
      streaming,
      vision
    };
  }

  return { reasoning: { type: "none" }, speedModes, toolCalling, streaming, vision };
}

// 排除非文本或非编码模型, 保留通用对话和代码模型
export function isUsableCodingModel(
  provider: ForgeProvider,
  modelName: string,
  metadata?: Pick<FetchedModel, "outputModalities">
): boolean {
  const normalizedModelName = modelName.toLowerCase();

  if (
    metadata?.outputModalities?.length &&
    !metadata.outputModalities.some((modality) => modality.toLowerCase() === "text")
  ) {
    return false;
  }

  if (provider.reasoningStyle === "mimo-thinking" && normalizedModelName.includes("tts")) {
    return false;
  }

  return !isNonCodingModelName(normalizedModelName);
}

// 根据供应商鉴权方式写入 Authorization 或自定义请求头
// 从供应商模型元数据里探测工具调用能力, 未返回字段时保持 unknown
function inferToolCalling(
  metadata?: Pick<FetchedModel, "supportedParameters">
): boolean | "unknown" {
  if (!metadata?.supportedParameters) {
    return "unknown";
  }

  return metadata.supportedParameters.some((parameter) =>
    ["tools", "tool_choice", "functions", "function_call"].includes(parameter.toLowerCase())
  );
}

// 从供应商参数列表判断是否声明流式输出能力
function inferStreaming(
  metadata?: Pick<FetchedModel, "supportedParameters">
): boolean | "unknown" {
  if (!metadata?.supportedParameters) {
    return "unknown";
  }

  return metadata.supportedParameters.some((parameter) => parameter.toLowerCase() === "stream");
}

// 从输入模态判断视觉输入能力, 未暴露模态时不做猜测
function inferVision(metadata?: Pick<FetchedModel, "inputModalities">): boolean | "unknown" {
  if (!metadata?.inputModalities) {
    return "unknown";
  }

  return metadata.inputModalities.some((modality) => modality.toLowerCase() === "image");
}

// 根据供应商鉴权方式写入 Authorization 或自定义请求头
function applyAuthHeader(
  headers: Record<string, string>,
  provider: ForgeProvider,
  apiKey: string
): Record<string, string> {
  if (provider.requiresApiKey === false) {
    return headers;
  }

  if (provider.authHeader === "api-key") {
    headers["api-key"] = assertHeaderValue("api-key", apiKey);
    return headers;
  }

  headers.Authorization = `Bearer ${assertHeaderValue("Authorization", apiKey)}`;
  return headers;
}

// 识别 Mimo 思考模型, 给推理能力设置更准确标签
function isMimoThinkingModel(normalizedModelName: string): boolean {
  if (normalizedModelName.includes("tts")) {
    return false;
  }

  return /^mimo-v(2|2\.5)(-(pro|omni|flash))?$/.test(normalizedModelName);
}

// 识别语音, 图像和嵌入模型名, 不放进编码模型列表
function isNonCodingModelName(normalizedModelName: string): boolean {
  return /(^|[-_.:/])(tts|voiceclone|voicedesign|speech|audio|whisper|embedding|embed|rerank|image|video|moderation|guard)([-_.:/]|$)/.test(
    normalizedModelName
  );
}

// 根据模型名推断速度档位, 前端模型选择器用它显示模式
function inferSpeedModes(
  provider: ForgeProvider,
  normalizedModelName: string,
  metadata?: Pick<FetchedModel, "supportedParameters">
): SpeedMode[] | undefined {
  if (provider.kind === "openai") {
    return ["balanced", "fast"];
  }

  if (provider.kind === "anthropic" && !normalizedModelName.includes("mythos")) {
    return ["balanced", "fast"];
  }

  if (
    provider.id === "openrouter" &&
    metadata?.supportedParameters?.some((parameter) => parameter.toLowerCase() === "service_tier")
  ) {
    return ["balanced", "fast"];
  }

  return undefined;
}

// 验证请求头值, 在真正发请求前给出明确错误
function validateHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, assertHeaderValue(name, value)])
  );
}

// 解析 OpenAI compatible 的模型列表格式
function parseOpenAICompatibleModels(response: UnknownRecord, preferDisplayName: boolean): FetchedModel[] {
  if (Array.isArray(response.data)) {
    return parseModelItems(response.data, preferDisplayName);
  }

  if (Array.isArray(response.models)) {
    return parseModelItems(response.models, preferDisplayName);
  }

  return [];
}

// 兼容数组和 data.items 结构, 提取可能的模型条目
function parseModelItems(items: unknown[], preferDisplayName: boolean): FetchedModel[] {
  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = readModelId(item);

    if (!id) {
      return [];
    }

    const label =
      (preferDisplayName && typeof item.display_name === "string" ? item.display_name : undefined) ??
      (typeof item.displayName === "string" ? item.displayName : undefined) ??
      (typeof item.name === "string" && item.name !== id ? item.name : undefined) ??
      id;
    const architecture = isRecord(item.architecture) ? item.architecture : undefined;
    const inputModalities =
      readStringArray(item.input_modalities) ?? readStringArray(architecture?.input_modalities);
    const outputModalities =
      readStringArray(item.output_modalities) ?? readStringArray(architecture?.output_modalities);
    const pricing = readPricing(item);
    const supportedParameters = readStringArray(item.supported_parameters);
    const contextWindow = readContextWindow(item);

    return [
      {
        id,
        label,
        ...(contextWindow ? { contextWindow } : {}),
        ...(inputModalities ? { inputModalities } : {}),
        ...(outputModalities ? { outputModalities } : {}),
        ...(pricing ? { pricing } : {}),
        ...(supportedParameters ? { supportedParameters } : {})
      }
    ];
  });
}

// 读取供应商返回的字符串数组字段
function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }

  return value;
}

// 从多种字段名读取模型 id
function readModelId(item: UnknownRecord): string | null {
  if (typeof item.id === "string") {
    return item.id;
  }

  if (typeof item.model === "string") {
    return item.model;
  }

  if (typeof item.name === "string") {
    return item.name.replace(/^models\//, "");
  }

  return null;
}

// 解析 Gemini 模型列表并去掉 models/ 前缀
function parseGeminiModels(response: UnknownRecord): FetchedModel[] {
  if (!Array.isArray(response.models)) {
    return [];
  }

  return response.models.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== "string") {
      return [];
    }

    const id = item.name.replace(/^models\//, "");
    const label = typeof item.displayName === "string" ? item.displayName : id;
    const contextWindow = readContextWindow(item);
    const inputModalities = readStringArray(item.inputModalities) ?? readStringArray(item.input_modalities);
    return [
      {
        id,
        label,
        ...(contextWindow ? { contextWindow } : {}),
        ...(inputModalities ? { inputModalities } : {})
      }
    ];
  });
}

// 读取模型价格字段, 不存在时保持 undefined
function readPricing(item: UnknownRecord): ModelPricing | undefined {
  const pricing = isRecord(item.pricing) ? item.pricing : item;
  const inputPerMillion =
    readNumber(pricing.inputPerMillion) ??
    readNumber(pricing.input_price_per_million) ??
    readNumber(pricing.prompt_per_million) ??
    readPerTokenPricePerMillion(pricing.prompt) ??
    readPerTokenPricePerMillion(pricing.input);
  const outputPerMillion =
    readNumber(pricing.outputPerMillion) ??
    readNumber(pricing.output_price_per_million) ??
    readNumber(pricing.completion_per_million) ??
    readPerTokenPricePerMillion(pricing.completion) ??
    readPerTokenPricePerMillion(pricing.output);

  if (inputPerMillion === undefined || outputPerMillion === undefined) {
    return undefined;
  }

  return {
    inputPerMillion,
    outputPerMillion
  };
}

// 读取上下文窗口大小, 兼容不同供应商字段名
function readContextWindow(item: UnknownRecord): number | undefined {
  const topProvider = isRecord(item.top_provider) ? item.top_provider : undefined;
  const limits = isRecord(item.limits) ? item.limits : undefined;
  const inputTokenLimit = isRecord(item.inputTokenLimit) ? item.inputTokenLimit : undefined;
  const outputTokenLimit = isRecord(item.outputTokenLimit) ? item.outputTokenLimit : undefined;
  const tokenLimit =
    readNumber(item.context_length) ??
    readNumber(item.contextWindow) ??
    readNumber(item.context_window) ??
    readNumber(item.max_context_tokens) ??
    readNumber(item.maxInputTokens) ??
    readNumber(item.inputTokenLimit) ??
    readNumber(inputTokenLimit?.max) ??
    readNumber(outputTokenLimit?.max) ??
    readNumber(topProvider?.context_length) ??
    readNumber(limits?.max_context_tokens) ??
    readNumber(limits?.max_input_tokens);

  if (tokenLimit === undefined) {
    return undefined;
  }

  return Math.round(tokenLimit);
}

// 把 token 级价格转换成每百万 token 价格
function readPerTokenPricePerMillion(value: unknown): number | undefined {
  const perTokenPrice = readNumber(value);

  return perTokenPrice === undefined ? undefined : perTokenPrice * 1_000_000;
}

// 从 unknown 中读取有限数字
function readNumber(value: unknown): number | undefined {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : undefined;
}

// 安全缩窄普通对象
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

// 去掉 Base URL 尾部斜杠, 拼接路径时避免双斜杠
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
