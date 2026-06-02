import { describe, expect, it } from "vitest";
import type { TaskThreadEvent } from "@/state/taskThreads";
import {
  appendSourceUrlsToAgentSummary,
  extractSourceUrlsFromThreadEvents
} from "./agentSources";

describe("agent sources", () => {
  it("extracts unique non-user source urls and trims trailing punctuation", () => {
    const events: TaskThreadEvent[] = [
      {
        id: "user-1",
        kind: "user",
        message: "Read https://ignored.example.com",
        createdAt: "2026-06-02T00:00:00.000Z"
      },
      {
        id: "result-1",
        kind: "result",
        message: "See https://example.com/docs, and https://example.com/docs.",
        createdAt: "2026-06-02T00:00:01.000Z"
      }
    ];

    expect(extractSourceUrlsFromThreadEvents(events)).toEqual(["https://example.com/docs"]);
  });

  it("appends localized source sections to summaries", () => {
    expect(
      appendSourceUrlsToAgentSummary(
        "完成",
        ["https://example.com/a", "https://example.com/a", "https://example.com/b"],
        "zh-CN"
      )
    ).toBe("完成\n\n参考资料:\n- https://example.com/a\n- https://example.com/b");
  });
});
