// 本文件说明: 渲染按需加载中的占位面板, 避免切换视图时出现空白
import type { ReactElement } from "react";
import type { Language } from "@shared/modelTypes";

type LazyPanelFallbackProps = {
  compact?: boolean;
  language: Language;
};

export function LazyPanelFallback({
  compact = false,
  language
}: LazyPanelFallbackProps): ReactElement {
  return (
    <div
      className={`flex min-h-0 items-center justify-center rounded-[16px] border border-[#ececf1] bg-white text-[12px] text-[#6e6e80] ${
        compact ? "h-full" : "h-full min-h-[220px]"
      }`}
    >
      {language === "zh-CN" ? "正在加载..." : "Loading..."}
    </div>
  );
}
