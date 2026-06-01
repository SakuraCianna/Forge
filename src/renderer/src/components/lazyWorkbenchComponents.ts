// 本文件说明: 集中声明按需加载的工作台重组件, 降低 App 入口包体积
import { lazy } from "react";

export const LazyFilePreviewRenderer = lazy(() =>
  import("./FilePreviewRenderer").then((module) => ({
    default: module.FilePreviewRenderer
  }))
);

export const LazySettingsPanel = lazy(() =>
  import("./SettingsPanel").then((module) => ({ default: module.SettingsPanel }))
);

export const LazyThreadWorkspace = lazy(() =>
  import("./ThreadWorkspace").then((module) => ({ default: module.ThreadWorkspace }))
);
