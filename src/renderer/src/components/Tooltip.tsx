// 本文件说明: 渲染统一样式悬停提示, 替代浏览器原生 title
import type { ReactElement, ReactNode } from "react";

type TooltipProps = {
  children: ReactNode;
  label: string;
};

// 使用统一样式渲染悬停提示, 避免浏览器原生 title 破坏界面一致性
export function Tooltip({ children, label }: TooltipProps): ReactElement {
  return (
    <span className="forge-tooltip-shell relative inline-flex">
      {children}
      {/* 统一悬停提示, 避免浏览器原生 title 黑框破坏工作台观感 */}
      <span role="tooltip" className="forge-tooltip">
        {label}
      </span>
    </span>
  );
}
