// 本文件说明: 根据当前工作区状态生成首页建议和输入提示
import type { Language } from "@shared/modelTypes";

export type ContextSuggestionInput = {
  language: Language;
  contextSuggestionsEnabled: boolean;
  projectName?: string | null;
  indexedFileCount?: number;
  changedFileCount?: number;
  pendingChangeCount?: number;
  hasRunningThread?: boolean;
  hasBlockedThread?: boolean;
  missingProject?: boolean;
};

const zhBaseHeroPrompts = [
  "我们该做什么？",
  "要修复哪个问题？",
  "想实现什么功能？",
  "需要解释哪段代码？",
  "今天要锻造哪个想法？",
  "要把哪个报错处理掉？",
  "想让 Forge 先读哪里？",
  "需要补哪一组测试？",
  "要重构哪个模块？",
  "想检查哪次变更？",
  "要生成什么实现计划？",
  "想优化哪个页面？",
  "要排查哪个接口？",
  "需要整理哪段逻辑？",
  "想让代码更清晰吗？",
  "要给项目加什么能力？",
  "今天从哪个文件开始？",
  "想验证哪个命令？",
  "要修复构建还是类型？",
  "需要写一份变更说明吗？",
  "想比较哪两种方案？",
  "要找出性能瓶颈吗？",
  "需要生成提交信息吗？",
  "要检查 Git 改动吗？",
  "想让 Forge 先规划吗？",
  "要把需求拆小吗？",
  "需要补充文档吗？",
  "想处理哪个 TODO？",
  "要让界面更顺手吗？",
  "准备锻造下一步了吗？"
];

const enBaseHeroPrompts = [
  "What should we build?",
  "What should we fix?",
  "What feature is next?",
  "What code should we explain?",
  "What idea should we forge today?",
  "Which error should we clear?",
  "Where should Forge read first?",
  "Which tests should we add?",
  "Which module needs refactoring?",
  "Which change should we review?",
  "What plan should we generate?",
  "Which screen should we improve?",
  "Which API should we debug?",
  "Which logic needs cleanup?",
  "Should we make this code clearer?",
  "What capability should this project gain?",
  "Which file should we start with?",
  "Which command should we verify?",
  "Build issue or type issue?",
  "Need a change summary?",
  "Which two approaches should we compare?",
  "Should we look for a performance bottleneck?",
  "Need a commit message?",
  "Should we inspect Git changes?",
  "Should Forge plan first?",
  "Should we break this down?",
  "Need documentation updates?",
  "Which TODO should we handle?",
  "Should we make the UI smoother?",
  "Ready to forge the next step?"
];

// 把静态建议和项目状态组合, 让首页更像当前工作区的入口
export function createHeroPromptSuggestions(input: ContextSuggestionInput): string[] {
  const basePrompts = getBaseHeroPrompts(input.language);

  if (!input.contextSuggestionsEnabled) {
    return basePrompts;
  }

  return dedupeStrings([...createContextPrompts(input), ...basePrompts]);
}

// 根据当前状态生成输入框提示, 没有明确上下文时使用现有兜底文案
export function createHeroComposerPlaceholder(
  input: ContextSuggestionInput,
  fallback: string
): string {
  if (!input.contextSuggestionsEnabled) {
    return fallback;
  }

  if (input.missingProject) {
    return input.language === "zh-CN" ? "重新打开项目或选择新的本地目录" : "Reopen the project or choose a new local folder";
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

function getBaseHeroPrompts(language: Language): string[] {
  return language === "zh-CN" ? zhBaseHeroPrompts : enBaseHeroPrompts;
}

function createContextPrompts(input: ContextSuggestionInput): string[] {
  const isChinese = input.language === "zh-CN";
  const prompts: string[] = [];
  const changedFileCount = input.changedFileCount ?? 0;
  const pendingChangeCount = input.pendingChangeCount ?? 0;
  const indexedFileCount = input.indexedFileCount ?? 0;
  const projectName = input.projectName?.trim();

  if (input.missingProject) {
    prompts.push(isChinese ? "项目路径丢失了吗？" : "Is the project path missing?");
  }

  if (pendingChangeCount > 0) {
    prompts.push(
      isChinese
        ? `审查 ${pendingChangeCount} 个待处理修改`
        : `Review ${pendingChangeCount} pending change${pendingChangeCount === 1 ? "" : "s"}`
    );
  }

  if (changedFileCount > 0) {
    prompts.push(
      isChinese
        ? `检查 ${changedFileCount} 个 Git 改动`
        : `Inspect ${changedFileCount} Git change${changedFileCount === 1 ? "" : "s"}`
    );
  }

  if (input.hasBlockedThread) {
    prompts.push(isChinese ? "修复当前阻塞的任务" : "Fix the blocked task");
  }

  if (input.hasRunningThread) {
    prompts.push(isChinese ? "继续推进正在运行的任务" : "Continue the running task");
  }

  if (projectName && indexedFileCount > 0) {
    prompts.push(
      isChinese
        ? `基于 ${projectName} 的 ${indexedFileCount} 个文件规划下一步`
        : `Plan the next step from ${indexedFileCount} indexed files in ${projectName}`
    );
  } else if (projectName) {
    prompts.push(isChinese ? `继续打磨 ${projectName}` : `Keep improving ${projectName}`);
  }

  return prompts;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
