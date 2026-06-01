// 本文件说明: 集中生成会直接展示给用户的运行时错误文案
// 生成供应商缺少 API Key 时的稳定英文错误, 渲染层再按界面语言本地化
export function formatMissingApiKey(providerLabel: string): string {
  return `${providerLabel} API Key is not configured.`;
}

// 生成供应商缺少 Base URL 时的稳定英文错误
export function formatMissingBaseUrl(providerLabel: string): string {
  return `${providerLabel} Base URL is not configured.`;
}

// 说明请求头里包含不能发送的非 ASCII 字符
export function formatHeaderNonAscii(headerName: string): string {
  return `${headerName} contains non-ASCII characters.`;
}

// 说明请求头里包含换行符
export function formatHeaderLineBreaks(headerName: string): string {
  return `${headerName} contains line breaks.`;
}

// 生成模型列表网络错误, 并保留目标 URL 方便用户核对
export function formatModelFetchNetworkError(
  providerLabel: string,
  url: string,
  error: unknown
): string {
  const detail = error instanceof Error ? error.message : String(error);

  return [
    `${providerLabel} model fetch failed: network request failed`,
    detail ? `(${detail})` : "",
    `Check Base URL, Electron proxy/network access, and whether the provider exposes ${url}.`
  ]
    .filter(Boolean)
    .join(" ");
}

// 生成模型列表 HTTP 状态错误
export function formatModelFetchHttpError(
  providerLabel: string,
  status: number,
  statusText: string,
  detail = ""
): string {
  return `${providerLabel} model fetch failed: ${status} ${statusText}${detail}`;
}

// 生成通用供应商请求 HTTP 状态错误
export function formatProviderHttpError(
  providerLabel: string,
  requestLabel: string,
  status: number,
  statusText: string
): string {
  return `${providerLabel} ${requestLabel} failed: ${status} ${statusText}`;
}

// 生成供应商返回空响应时的提示
export function formatEmptyProviderResponse(providerLabel: string): string {
  return `${providerLabel} returned an empty response.`;
}

// 生成供应商返回空业务结果时的提示
export function formatEmptyProviderResult(providerLabel: string, resultLabel: string): string {
  return `${providerLabel} returned an empty ${resultLabel}.`;
}

// 生成接口返回 HTML 而非 JSON 时的提示
export function formatHtmlInsteadOfJson(providerLabel: string, compatibilityLabel: string): string {
  return `${providerLabel} returned HTML instead of JSON. Check Base URL and ${compatibilityLabel}.`;
}

// 生成接口返回非预期 JSON 时的提示
export function formatInvalidJson(providerLabel: string, compatibilityLabel: string): string {
  return `${providerLabel} returned invalid JSON. Check Base URL and ${compatibilityLabel}.`;
}

// 生成流式响应体缺失时的提示
export function formatStreamingBodyUnavailable(): string {
  return "Streaming response body is not available";
}
