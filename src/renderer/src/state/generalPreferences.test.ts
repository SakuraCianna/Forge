// 本文件说明: 覆盖通用偏好的默认值, 持久化和权限迁移
import { describe, expect, it } from "vitest";
import {
  agentApprovedCommandRuleReason,
  appendCommandSafetyRule,
  createExactCommandAllowRule,
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
      readOnly: false,
      defaultPermission: true,
      telemetry: false,
      backgroundImageDataUrl: null,
      backgroundOpacity: 0.18,
      commandSafetyRules: []
    });
  });

  it("persists supported general preferences", () => {
    const storage = createMemoryStorage();
    const preferences = updateGeneralPreferences(createDefaultGeneralPreferences(), {
      workMode: "daily",
      terminalShell: "cmd",
      backgroundImageDataUrl: "data:image/png;base64,abc",
      backgroundOpacity: 0.24,
      readOnly: true
    });

    saveGeneralPreferences(storage, preferences);

    expect(loadGeneralPreferences(storage)).toMatchObject({
      workMode: "daily",
      autoReview: true,
      terminalShell: "cmd",
      backgroundImageDataUrl: "data:image/png;base64,abc",
      backgroundOpacity: 0.24,
      readOnly: true,
      fullAccess: false
    });
  });

  it("normalizes old permission data to guarded auto mode", () => {
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
      fullAccess: false,
      readOnly: false
    });
  });

  it("keeps full access stronger than read only when persisted data conflicts", () => {
    expect(
      loadGeneralPreferences(
        createMemoryStorage(
          JSON.stringify({
            fullAccess: true,
            readOnly: true
          })
        )
      )
    ).toMatchObject({
      fullAccess: true,
      readOnly: false
    });
  });

  it("persists and normalizes command safety rules", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        commandSafetyRules: [
          {
            id: " local-e2e ",
            pattern: " npm run e2e * ",
            level: "allow",
            reason: " local verification "
          },
          {
            id: "missing-pattern",
            pattern: "",
            level: "deny",
            reason: "no pattern"
          },
          {
            id: "bad-level",
            pattern: "npm run publish-*",
            level: "block",
            reason: "invalid level"
          },
          {
            id: "preview-publish",
            pattern: "npm run publish-*",
            level: "ask",
            reason: ""
          }
        ]
      })
    );

    expect(loadGeneralPreferences(storage).commandSafetyRules).toEqual([
      {
        id: "local-e2e",
        pattern: "npm run e2e *",
        level: "allow",
        reason: "local verification"
      },
      {
        id: "preview-publish",
        pattern: "npm run publish-*",
        level: "ask",
        reason: "matched configured command policy"
      }
    ]);
  });

  it("keeps command safety rules when updating general preferences", () => {
    expect(
      updateGeneralPreferences(createDefaultGeneralPreferences(), {
        commandSafetyRules: [
          {
            id: "preview-publish",
            pattern: "npm run publish-*",
            level: "ask",
            reason: "publishes preview"
          }
        ]
      }).commandSafetyRules
    ).toEqual([
      {
        id: "preview-publish",
        pattern: "npm run publish-*",
        level: "ask",
        reason: "publishes preview"
      }
    ]);
  });

  it("creates exact allow rules from approved agent commands", () => {
    expect(
      createExactCommandAllowRule(" npm   install ", { createId: () => "agent-allow-test" })
    ).toEqual({
      id: "agent-allow-test",
      pattern: "npm install",
      level: "allow",
      reason: agentApprovedCommandRuleReason
    });
  });

  it("does not create exact command rules for empty or overly long commands", () => {
    expect(createExactCommandAllowRule("   ")).toBeNull();
    expect(createExactCommandAllowRule("npm run " + "x".repeat(180))).toBeNull();
  });

  it("deduplicates appended command safety rules by pattern and level", () => {
    const preferences = updateGeneralPreferences(createDefaultGeneralPreferences(), {
      commandSafetyRules: [
        {
          id: "existing",
          pattern: "npm install",
          level: "allow",
          reason: "already allowed"
        }
      ]
    });
    const rule = createExactCommandAllowRule("npm install", { createId: () => "new-rule" });

    expect(rule).not.toBeNull();
    expect(appendCommandSafetyRule(preferences, rule!).commandSafetyRules).toEqual([
      {
        id: "existing",
        pattern: "npm install",
        level: "allow",
        reason: "already allowed"
      }
    ]);
  });

  it("falls back when persisted data is invalid", () => {
    expect(loadGeneralPreferences(createMemoryStorage("{ bad json"))).toEqual(
      createDefaultGeneralPreferences()
    );
  });
});
