// 本文件说明: 渲染国际化 国际化 Hook
import type { Language } from "@shared/modelTypes";
import { getMessage, type MessageKey } from "./messages";

export function useI18n(language: Language): { t: (key: MessageKey) => string } {
  return {
    t: (key) => getMessage(language, key)
  };
}
