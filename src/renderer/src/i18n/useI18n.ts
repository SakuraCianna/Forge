import type { Language } from "@shared/modelTypes";
import { getMessage, type MessageKey } from "./messages";

export function useI18n(language: Language): { t: (key: MessageKey) => string } {
  return {
    t: (key) => getMessage(language, key)
  };
}
