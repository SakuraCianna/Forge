import { describe, expect, it } from "vitest";
import {
  formatGitStatus,
  formatProjectFileReadResultMessage,
  formatProjectGitStatusMessage,
  formatProjectSearchResultMessage
} from "./projectToolResultMessages";

describe("project tool result messages", () => {
  it("summarizes file reads with a bounded preview", () => {
    const content = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join("\n");
    const message = formatProjectFileReadResultMessage("en-US", {
      relativePath: "src/App.tsx",
      content,
      size: content.length
    });

    expect(message).toContain("File read complete: src/App.tsx");
    expect(message).toContain("truncated");
    expect(message).toContain("Content preview:");
    expect(message).not.toContain("line 100");
  });

  it("summarizes empty search results in the selected language", () => {
    expect(
      formatProjectSearchResultMessage("zh-CN", {
        query: "missingSymbol",
        matches: [],
        truncated: false
      })
    ).toContain("未找到匹配项。");
  });

  it("formats git status without exposing raw shell output", () => {
    const message = formatProjectGitStatusMessage("en-US", {
      isRepo: true,
      changedFiles: ["src/App.tsx"],
      changes: [
        {
          path: "src/App.tsx",
          status: " M",
          diff: "diff --git a/src/App.tsx b/src/App.tsx\n+added line"
        }
      ],
      rawStatus: " M src/App.tsx"
    });

    expect(message).toContain("Git status complete: 1 file changed");
    expect(message).toContain("- src/App.tsx (modified)");
    expect(message).toContain("Diff summary:");
    expect(message).not.toContain("rawStatus");
  });

  it("translates compact git status labels", () => {
    expect(formatGitStatus("??", "zh-CN")).toBe("未跟踪");
    expect(formatGitStatus("D ", "en-US")).toBe("deleted");
  });
});
