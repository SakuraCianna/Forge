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
    expect(getActiveAgentProfileContext(profiles, "en-US").verificationPolicy).toBe("require");
  });

  it("clamps plan step limits and persists verification policy when updating a profile", () => {
    const profiles = updateAgentProfile(createDefaultAgentProfiles(), "build", {
      planStepLimit: 99,
      verificationPolicy: "skip"
    });

    const buildProfile = profiles.find((profile) => profile.id === "build");

    expect(buildProfile?.planStepLimit).toBe(12);
    expect(buildProfile?.verificationPolicy).toBe("skip");
  });

  it("migrates older stored profiles without new agent control fields", () => {
    const [buildProfile] = createDefaultAgentProfiles();
    const legacyProfile = {
      ...buildProfile,
      planStepLimit: undefined,
      verificationPolicy: undefined
    } as unknown as Omit<AgentProfile, "planStepLimit" | "verificationPolicy">;

    window.localStorage.setItem("forge.agentProfiles", JSON.stringify([legacyProfile]));

    const migratedProfile = loadAgentProfiles(window.localStorage)[0];

    expect(migratedProfile.planStepLimit).toBe(6);
    expect(migratedProfile.verificationPolicy).toBe("require");
  });
});
