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
    expect(getActiveAgentProfileContext(profiles, "en-US").failureRecoveryPolicy).toBe("auto");
  });

  it("clamps plan step limits and persists agent policies when updating a profile", () => {
    const profiles = updateAgentProfile(createDefaultAgentProfiles(), "build", {
      planStepLimit: 99,
      verificationPolicy: "skip",
      failureRecoveryPolicy: "manual"
    });

    const buildProfile = profiles.find((profile) => profile.id === "build");

    expect(buildProfile?.planStepLimit).toBe(12);
    expect(buildProfile?.verificationPolicy).toBe("skip");
    expect(buildProfile?.failureRecoveryPolicy).toBe("manual");
  });

  it("migrates older stored profiles without new agent control fields", () => {
    const [buildProfile] = createDefaultAgentProfiles();
    const legacyProfile = {
      ...buildProfile,
      planStepLimit: undefined,
      verificationPolicy: undefined,
      failureRecoveryPolicy: undefined
    } as unknown as Omit<
      AgentProfile,
      "planStepLimit" | "verificationPolicy" | "failureRecoveryPolicy"
    >;

    window.localStorage.setItem("forge.agentProfiles", JSON.stringify([legacyProfile]));

    const migratedProfile = loadAgentProfiles(window.localStorage)[0];

    expect(migratedProfile.planStepLimit).toBe(6);
    expect(migratedProfile.verificationPolicy).toBe("require");
    expect(migratedProfile.failureRecoveryPolicy).toBe("auto");
  });
});
