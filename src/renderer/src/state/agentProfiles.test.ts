import { beforeEach, describe, expect, it } from "vitest";
import {
  createDefaultAgentProfiles,
  getActiveAgentProfileContext,
  loadAgentProfiles,
  updateAgentProfile,
  type AgentProfile
} from "./agentProfiles";

beforeEach(() => {
  window.localStorage.clear();
});

describe("agent profiles", () => {
  it("includes a plan step limit in the active runtime context", () => {
    const profiles = createDefaultAgentProfiles();

    expect(getActiveAgentProfileContext(profiles, "en-US").planStepLimit).toBe(6);
  });

  it("clamps plan step limits when updating a profile", () => {
    const profiles = updateAgentProfile(createDefaultAgentProfiles(), "build", {
      planStepLimit: 99
    });

    expect(profiles.find((profile) => profile.id === "build")?.planStepLimit).toBe(12);
  });

  it("migrates older stored profiles without a plan step limit", () => {
    const [buildProfile] = createDefaultAgentProfiles();
    const legacyProfile = {
      ...buildProfile,
      planStepLimit: undefined
    } as unknown as Omit<AgentProfile, "planStepLimit">;

    window.localStorage.setItem("forge.agentProfiles", JSON.stringify([legacyProfile]));

    expect(loadAgentProfiles(window.localStorage)[0].planStepLimit).toBe(6);
  });
});
