// 本文件说明: 覆盖通用偏好的默认值, 持久化和权限迁移
import { describe, expect, it } from "vitest";
import {
  createDefaultGeneralPreferences,
  loadGeneralPreferences,
  saveGeneralPreferences,
  updateGeneralPreferences
} from "./generalPreferences";

// 构造内存版 Storage, 让偏好测试不依赖浏览器环境
function createMemoryStorage(initialValue?: string): Storage {
  const values = new Map<string, string>();

  if (initialValue) {
    values.set("forge.generalPreferences", initialValue);
  }

  return {
    // 让被测代码可以读取当前键数量
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
      telemetry: false,
      backgroundImageDataUrl: null,
      backgroundOpacity: 0.18
    });
  });

  it("persists supported general preferences", () => {
    const storage = createMemoryStorage();
    const preferences = updateGeneralPreferences(createDefaultGeneralPreferences(), {
      workMode: "daily",
      terminalShell: "cmd",
      backgroundImageDataUrl: "data:image/png;base64,abc",
      backgroundOpacity: 0.24
    });

    saveGeneralPreferences(storage, preferences);

    expect(loadGeneralPreferences(storage)).toMatchObject({
      workMode: "daily",
      autoReview: true,
      terminalShell: "cmd",
      backgroundImageDataUrl: "data:image/png;base64,abc",
      backgroundOpacity: 0.24
    });
  });

  it("normalizes old permission data to auto review or full access only", () => {
    expect(
      loadGeneralPreferences(
        createMemoryStorage(
          JSON.stringify({
            defaultPermission: false,
            autoReview: false,
            fullAccess: false
          })
        )
      )
    ).toMatchObject({
      defaultPermission: true,
      autoReview: true,
      fullAccess: false
    });
  });

  it("falls back when persisted data is invalid", () => {
    expect(loadGeneralPreferences(createMemoryStorage("{ bad json"))).toEqual(
      createDefaultGeneralPreferences()
    );
  });
});
