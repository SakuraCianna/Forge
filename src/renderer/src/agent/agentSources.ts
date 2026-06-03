// 本文件说明: 从线程事件中提取网页来源, 并追加到 Agent 最终总结
import type { Language } from "@shared/modelTypes";
import type { TaskThreadEvent } from "@/state/taskThreads";

// 最终总结把隐藏流水中的网页来源补出来, 保持主屏简洁但不丢引用
export function appendSourceUrlsToAgentSummary(
  message: string,
  sourceUrls: string[],
  language: Language
): string {
  const urls = mergeUniqueStrings(sourceUrls).slice(0, 8);

  if (urls.length === 0) {
    return message;
  }

  const heading = language === "zh-CN" ? "参考资料:" : "Sources:";
  const lines = urls.map((url) => `- ${url}`);

  return `${message}\n\n${heading}\n${lines.join("\n")}`;
}

export function extractSourceUrlsFromThreadEvents(events: TaskThreadEvent[]): string[] {
  return mergeUniqueStrings(
    events
      .filter((event) => event.kind !== "user")
      .flatMap((event) => extractSourceUrlsFromText(event.message))
  );
}

export function extractSourceUrlsFromText(value: string): string[] {
  const sourceText = stripCodeLikeSourceNoise(value);
  const matches = sourceText.match(/https?:\/\/[^\s<>)\]]+/giu) ?? [];

  return mergeUniqueStrings(
    matches
      .map((url) => url.replace(/[.,;:，。；：]+$/u, ""))
      .filter(isUsefulSourceUrl)
  );
}

// 来源只来自自然语言引用, 代码/命令里的 schema 和 localhost 不应被当作资料来源
function stripCodeLikeSourceNoise(value: string): string {
  const withoutFencedCode = value.replace(/```[\s\S]*?```/gu, "");

  return withoutFencedCode
    .split(/\r?\n/u)
    .filter((line) => !isCodeLikeSourceLine(line.trim()))
    .join("\n");
}

function isCodeLikeSourceLine(line: string): boolean {
  return (
    /^<\/?[A-Za-z][\w:-]*(?:\s|>|$)/u.test(line) ||
    /^<\?xml\b/iu.test(line) ||
    /(?:xmlns|schemaLocation|xsi:)/iu.test(line) ||
    /^(?:运行命令\s+)?(?:powershell|pwsh|cmd|npm|pnpm|yarn|mvn|gradle|git|New-Item|Set-Content|Get-Content)\b/iu.test(line) ||
    /^\$[A-Za-z_][\w-]*\s*=/u.test(line)
  );
}

function isUsefulSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return false;
    }

    if (
      (hostname === "www.w3.org" && /^\/(?:2000|2001)\//u.test(parsed.pathname)) ||
      (hostname === "maven.apache.org" &&
        /^\/(?:POM\/4\.0\.0|xsd\/maven-4\.0\.0\.xsd)/u.test(parsed.pathname))
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
