// 本文件说明: 提供 MEMORY.md 写入和注入前共用的敏感信息脱敏规则
export function redactSensitiveMemoryContent(content: string): string {
  return content
    .replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu,
      "[redacted private key]"
    )
    .replace(
      /\b(api[_-]?key|token|secret|password|cookie)\b(\s*[:=]\s*)(["']?)[^\s"'`,;]+/giu,
      (_match, key: string, separator: string, quote: string) =>
        `${key}${separator}${quote}[redacted]${quote}`
    )
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs]?)-[A-Za-z0-9_-]{8,}\b/gu, "[redacted token]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, "[redacted aws access key]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/giu, "Bearer [redacted]");
}
