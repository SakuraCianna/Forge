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

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

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
      name: "Build agent",
      permissionMode: "auto",
      enabledTools: ["read", "edit", "command", "git"],
      contextBudget: 12000
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
