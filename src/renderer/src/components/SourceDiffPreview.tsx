// 本文件说明: 源代码管理页的 diff 预览, 按需加载 Shiki 高亮并限制超大 diff 的首屏渲染成本。
import { lazy, Suspense } from "react";
import type { ReactElement } from "react";

type SourceDiffPreviewProps = {
  diff: string;
};

const maxRenderedDiffLines = 600;
const LazyCodePreview = lazy(() =>
  import("./FilePreviewRenderer").then((module) => ({ default: module.CodePreview }))
);

export function SourceDiffPreview({ diff }: SourceDiffPreviewProps): ReactElement {
  const visibleDiff = createVisibleDiff(diff);

  return (
    <div className="h-[calc(100%-58px)] min-h-[520px] overflow-hidden">
      <Suspense
        fallback={
          <pre className="h-full min-h-0 overflow-auto bg-[#fafafa] p-4 font-mono text-[12px] leading-6 text-[#202123]">
            <code>{visibleDiff}</code>
          </pre>
        }
      >
        <LazyCodePreview content={visibleDiff} frame="embedded" path="changes.diff" />
      </Suspense>
    </div>
  );
}

function createVisibleDiff(diff: string): string {
  const lines = diff.split(/\r?\n/u);

  if (lines.length <= maxRenderedDiffLines) {
    return diff;
  }

  return `${lines.slice(0, maxRenderedDiffLines).join("\n")}\n... diff truncated`;
}
