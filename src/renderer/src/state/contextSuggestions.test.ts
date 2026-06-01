import { beforeEach, describe, expect, it } from "vitest";
import {
  createHeroComposerPlaceholder,
  createHeroPromptSuggestions,
} from "./contextSuggestions";
import { loadPersonalizationSettings } from "./personalization";

beforeEach(() => {
  window.localStorage.clear();
});

describe("context suggestions", () => {
  it("keeps base prompts when context suggestions are disabled", () => {
    const prompts = createHeroPromptSuggestions({
      language: "en-US",
      contextSuggestionsEnabled: false,
      projectName: "Forge",
      changedFileCount: 2,
      pendingChangeCount: 1,
    });

    expect(prompts[0]).toBe("What should we build?");
    expect(prompts).not.toContain("Review 1 pending change");
  });

  it("prioritizes project context without showing file-count planning prompts", () => {
    const prompts = createHeroPromptSuggestions({
      language: "zh-CN",
      contextSuggestionsEnabled: true,
      projectName: "Forge",
      indexedFileCount: 120,
      changedFileCount: 2,
      pendingChangeCount: 1,
    });

    expect(prompts.slice(0, 3)).toEqual([
      "审查 1 个待处理修改",
      "检查 2 个 Git 改动",
      "继续打磨 Forge",
    ]);
    expect(prompts).not.toContain("基于 Forge 的 120 个文件规划下一步");
  });

  it("uses pending reviews for the hero input placeholder", () => {
    expect(
      createHeroComposerPlaceholder(
        {
          language: "en-US",
          contextSuggestionsEnabled: true,
          projectName: "Forge",
          pendingChangeCount: 2,
        },
        "Ask anything",
      ),
    ).toBe("Describe how to handle 2 pending changes");
  });

  it("uses the fallback placeholder when context suggestions are disabled", () => {
    expect(
      createHeroComposerPlaceholder(
        {
          language: "zh-CN",
          contextSuggestionsEnabled: false,
          projectName: "Forge",
          changedFileCount: 3,
        },
        "今天想让 Forge 做什么？",
      ),
    ).toBe("今天想让 Forge 做什么？");
  });
});

describe("personalization settings", () => {
  it("enables context suggestions for existing stored settings by default", () => {
    window.localStorage.setItem(
      "forge.personalization",
      JSON.stringify({
        replyTone: "technical",
        customInstructions: "Keep strict types",
      }),
    );

    expect(loadPersonalizationSettings(window.localStorage)).toEqual({
      replyTone: "technical",
      customInstructions: "Keep strict types",
      contextSuggestionsEnabled: true,
    });
  });
});
