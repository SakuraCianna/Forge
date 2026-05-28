import { describe, expect, it } from "vitest";
import {
  createDefaultGeneralPreferences,
  loadGeneralPreferences,
  saveGeneralPreferences,
  updateGeneralPreferences
} from "./generalPreferences";

function createMemoryStorage(initialValue?: string): Storage {
  const values = new Map<string, string>();

  if (initialValue) {
    values.set("forge.generalPreferences", initialValue);
  }

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("generalPreferences", () => {
  it("starts with Codex-like Windows defaults", () => {
    expect(createDefaultGeneralPreferences()).toMatchObject({
      workMode: "code",
      defaultOpenTarget: "recent-project",
      agentRuntime: "windows-native",
      terminalShell: "powershell",
      autoReview: true,
      fullAccess: false,
      defaultPermission: true,
      telemetry: false
    });
  });

  it("persists supported general preferences", () => {
    const storage = createMemoryStorage();
    const preferences = updateGeneralPreferences(createDefaultGeneralPreferences(), {
      workMode: "daily",
      autoReview: false,
      terminalShell: "cmd"
    });

    saveGeneralPreferences(storage, preferences);

    expect(loadGeneralPreferences(storage)).toMatchObject({
      workMode: "daily",
      autoReview: false,
      terminalShell: "cmd"
    });
  });

  it("falls back when persisted data is invalid", () => {
    expect(loadGeneralPreferences(createMemoryStorage("{ bad json"))).toEqual(
      createDefaultGeneralPreferences()
    );
  });
});
