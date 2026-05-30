// 本文件说明: 渲染组件 统一悬停提示
import type { ReactElement, ReactNode } from "react";

type TooltipProps = {
  children: ReactNode;
  label: string;
};

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
