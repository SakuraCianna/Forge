// 本文件说明: 提供按当前界面语言读取文案的 Hook
import type { Language } from "@shared/modelTypes";
import { getMessage, type MessageKey } from "./messages";

// 绑定当前语言的消息读取函数, 组件不用直接访问消息表
export function useI18n(language: Language): { t: (key: MessageKey) => string } {
  return {
    t: (key) => getMessage(language, key)
  };
}
