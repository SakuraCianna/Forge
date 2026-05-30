// 本文件说明: 集中生成会直接展示给用户的运行时错误文案
// 生成供应商缺少 API Key 时的提示
export function formatMissingApiKey(providerLabel: string): string {
  return `${providerLabel} API Key 未配置，请先在 API 配置中保存密钥。`;
}

// 生成供应商缺少 Base URL 时的提示
export function formatMissingBaseUrl(providerLabel: string): string {
  return `${providerLabel} Base URL 未配置，请检查 API 配置。`;
}

// 说明请求头里包含不能发送的非 ASCII 字符
export function formatHeaderNonAscii(headerName: string): string {
  return `${headerName} 包含非 ASCII 字符，请只粘贴原始 API Key，不要包含标签、中文标点或额外说明。`;
}

// 说明请求头里包含换行符
export function formatHeaderLineBreaks(headerName: string): string {
  return `${headerName} 包含换行符，请把 API Key 放在同一行。`;
}

// 生成模型列表网络错误, 并保留目标 URL 方便用户核对
export function formatModelFetchNetworkError(
  providerLabel: string,
  url: string,
  error: unknown
): string {
  const detail = error instanceof Error ? error.message : String(error);

  return [
    `无法拉取 ${providerLabel} 模型列表：网络请求失败`,
    detail ? `(${detail})` : "",
    `请检查 Base URL、Electron 代理/网络访问权限，以及该提供商是否开放 ${url}。`
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
  return `无法拉取 ${providerLabel} 模型列表：${status} ${statusText}${detail}`;
}

// 生成通用供应商请求 HTTP 状态错误
export function formatProviderHttpError(
  providerLabel: string,
  requestLabel: string,
  status: number,
  statusText: string
): string {
  return `${providerLabel} ${requestLabel} 请求失败：${status} ${statusText}`;
}

// 生成供应商返回空响应时的提示
export function formatEmptyProviderResponse(providerLabel: string): string {
  return `${providerLabel} 返回了空响应。`;
}

// 生成供应商返回空业务结果时的提示
export function formatEmptyProviderResult(providerLabel: string, resultLabel: string): string {
  return `${providerLabel} 返回的${resultLabel}为空。`;
}

// 生成接口返回 HTML 而非 JSON 时的提示
export function formatHtmlInsteadOfJson(providerLabel: string, compatibilityLabel: string): string {
  return `${providerLabel} 返回了 HTML 而不是 JSON，请检查 Base URL 和${compatibilityLabel}。`;
}

// 生成接口返回非预期 JSON 时的提示
export function formatInvalidJson(providerLabel: string, compatibilityLabel: string): string {
  return `${providerLabel} 返回的 JSON 无法解析，请检查 Base URL 和${compatibilityLabel}。`;
}

// 生成流式响应体缺失时的提示
export function formatStreamingBodyUnavailable(): string {
  return "流式响应体不可用，请检查当前运行环境或供应商是否支持流式返回。";
}
