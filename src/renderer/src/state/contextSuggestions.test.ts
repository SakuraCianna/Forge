import { beforeEach, describe, expect, it } from "vitest";
import { createHeroComposerPlaceholder } from "./contextSuggestions";
import { loadPersonalizationSettings } from "./personalization";

beforeEach(() => {
  window.localStorage.clear();
});

describe("context suggestions", () => {
  it("uses pending reviews for the hero input placeholder", () => {
    expect(
      createHeroComposerPlaceholder(
        {
          language: "en-US",
          contextSuggestionsEnabled: true,
          projectName: "Forge",
          pendingChangeCount: 2
        },
        "Ask anything"
      )
    ).toBe("Describe how to handle 2 pending changes");
  });

  it("uses the fallback placeholder when context suggestions are disabled", () => {
    expect(
      createHeroComposerPlaceholder(
        {
          language: "zh-CN",
          contextSuggestionsEnabled: false,
          projectName: "Forge",
          changedFileCount: 3
        },
        "今天想让 Forge 做什么？"
      )
    ).toBe("今天想让 Forge 做什么？");
  });
});

describe("personalization settings", () => {
  it("enables context suggestions for existing stored settings by default", () => {
    window.localStorage.setItem(
      "forge.personalization",
      JSON.stringify({ replyTone: "technical", customInstructions: "Keep strict types" })
    );

    expect(loadPersonalizationSettings(window.localStorage)).toEqual({
      replyTone: "technical",
      customInstructions: "Keep strict types",
      contextSuggestionsEnabled: true
    });
  });
});
