// 根据当前工作区状态生成首页输入框提示
import type { Language } from "@shared/modelTypes";

export type ContextSuggestionInput = {
  language: Language;
  contextSuggestionsEnabled: boolean;
  projectName?: string | null;
  changedFileCount?: number;
  pendingChangeCount?: number;
  missingProject?: boolean;
};

export function createHeroComposerPlaceholder(
  input: ContextSuggestionInput,
  fallback: string
): string {
  if (!input.contextSuggestionsEnabled) {
    return fallback;
  }

  if (input.missingProject) {
    return input.language === "zh-CN"
      ? "重新打开项目或选择新的本地目录"
      : "Reopen the project or choose a new local folder";
  }

  const pendingChangeCount = input.pendingChangeCount ?? 0;
  if (pendingChangeCount > 0) {
    return input.language === "zh-CN"
      ? `描述要如何处理 ${pendingChangeCount} 个待审查修改`
      : `Describe how to handle ${pendingChangeCount} pending change${pendingChangeCount === 1 ? "" : "s"}`;
  }

  const changedFileCount = input.changedFileCount ?? 0;
  if (changedFileCount > 0) {
    return input.language === "zh-CN"
      ? `描述要如何处理 ${changedFileCount} 个 Git 改动`
      : `Describe how to handle ${changedFileCount} Git change${changedFileCount === 1 ? "" : "s"}`;
  }

  if (input.projectName) {
    return input.language === "zh-CN"
      ? `描述 Forge 要在 ${input.projectName} 中推进的下一步`
      : `Describe the next step Forge should take in ${input.projectName}`;
  }

  return fallback;
}
