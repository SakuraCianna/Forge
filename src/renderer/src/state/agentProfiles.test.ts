// 本文件说明: 覆盖 Agent 配置的默认值, 持久化和迁移
import { describe, expect, it } from "vitest";
import {
  createDefaultAgentProfiles,
  getActiveAgentProfileContext,
  loadAgentProfiles,
  saveAgentProfiles,
  selectAgentProfile,
  updateAgentProfile,
  type AgentProfile
} from "./agentProfiles";

class ProfileStorage implements Storage {
  private readonly values = new Map<string, string>();

  // 让被测逻辑可以像真实 localStorage 一样读取键数量
  get length(): number {
    return this.values.size;
  }

  // 清空测试存储, 每个用例都能独立运行
  clear(): void {
    this.values.clear();
  }

  // 按 Storage 接口返回字符串或 null
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  // 支持按索引读取键名, 补齐 Storage 接口契约
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  // 删除单个键, 模拟 localStorage 的移除行为
  removeItem(key: string): void {
    this.values.delete(key);
  }

  // 写入字符串值, 保持和 localStorage 一样的序列化边界
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("agentProfiles", () => {
  it("starts with a configurable build profile as the active profile", () => {
    const profiles = createDefaultAgentProfiles();
    const activeProfile = getActiveAgentProfileContext(profiles);

    expect(activeProfile).toMatchObject({
      id: "build",
      name: "编码 Agent",
      permissionMode: "auto",
      enabledTools: ["read", "edit", "command", "git"],
      contextBudget: 12000
    });

    expect(profiles.map((profile) => profile.name)).toEqual([
      "编码 Agent",
      "审查 Agent",
      "文档 Agent"
    ]);
    expect(activeProfile.instructions).toContain("先阅读项目");
  });

  it("migrates legacy English built-in profiles to Chinese defaults", () => {
    const storage = new ProfileStorage();

    storage.setItem(
      "forge.agentProfiles",
      JSON.stringify([
        {
          id: "build",
          name: "Build agent",
          description: "Full coding work with guarded edits and verification",
          systemPrompt:
            "Implement requested code changes with small, reviewable steps. Read the project first, preserve local style, and verify with relevant commands.",
          permissionMode: "auto",
          tools: {
            read: true,
            edit: true,
            command: true,
            git: true
          },
          contextBudget: 12000,
          active: true,
          builtIn: true,
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z"
        }
      ])
    );

    const [profile] = loadAgentProfiles(storage);

    expect(profile).toMatchObject({
      name: "编码 Agent",
      description: "完整编码任务, 包含受控编辑和验证",
      systemPrompt: expect.stringContaining("先阅读项目")
    });
  });

  it("persists profiles and repairs a missing active profile", () => {
    const storage = new ProfileStorage();
    const profiles = createDefaultAgentProfiles().map((profile) => ({
      ...profile,
      active: false
    }));

    saveAgentProfiles(storage, profiles);

    expect(loadAgentProfiles(storage).filter((profile) => profile.active)).toHaveLength(1);
  });

  it("selects and updates agent profiles without dropping tool permissions", () => {
    const profiles = createDefaultAgentProfiles();
    const selected = selectAgentProfile(profiles, "review");
    const updated = updateAgentProfile(selected, "review", {
      systemPrompt: "Review code for risky behavior",
      permissionMode: "auto",
      contextBudget: 16000
    });
    const reviewProfile = updated.find((profile): profile is AgentProfile => profile.id === "review");

    expect(reviewProfile).toMatchObject({
      active: true,
      systemPrompt: "Review code for risky behavior",
      permissionMode: "auto",
      contextBudget: 16000,
      tools: expect.objectContaining({
        read: true,
        edit: false,
        command: false
      })
    });
  });
});
