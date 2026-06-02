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
  const matches = value.match(/https?:\/\/[^\s<>)\]]+/giu) ?? [];

  return mergeUniqueStrings(matches.map((url) => url.replace(/[.,;:，。；：]+$/u, "")));
}

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
