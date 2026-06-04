// 本文件说明: 渲染对话区 Markdown 输出; 代码块按需加载 Shiki 预览以控制首包体积
import { lazy, Suspense } from "react";
import type { ReactElement } from "react";
import type { MarkdownBlock } from "./MarkdownContent";
import { MarkdownContent } from "./MarkdownContent";

const LazyCodePreview = lazy(() =>
  import("./FilePreviewRenderer").then((module) => ({ default: module.CodePreview }))
);

export function MarkdownPreview({
  compact = false,
  content
}: {
  compact?: boolean;
  content: string;
}): ReactElement {
  return (
    <MarkdownContent
      compact={compact}
      content={content}
      detectLooseCodeBlocks
      renderCodeBlock={renderChatCodeBlock}
    />
  );
}

function renderChatCodeBlock(
  block: Extract<MarkdownBlock, { kind: "code" }>,
  index: number
): ReactElement {
  return (
    <Suspense
      key={index}
      fallback={
        <pre className="min-h-0 overflow-auto rounded-[14px] border border-[#ececf1] bg-white p-3 font-mono text-[12px] leading-6 text-[#202123]">
          <code>{block.content}</code>
        </pre>
      }
    >
      <LazyCodePreview
        compact
        content={block.content}
        path={`preview.${block.language || "txt"}`}
      />
    </Suspense>
  );
}
