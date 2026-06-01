import { describe, expect, it } from "vitest";
import {
  countAutoFailureRecoveryAttempts,
  getFailureRecoveryAttemptsForAction
} from "./failureRecoveryAttempts";

describe("failure recovery attempts", () => {
  it("returns recovery attempts for one action with event timestamps", () => {
    const attempts = getFailureRecoveryAttemptsForAction(
      [
        {
          createdAt: "2026-06-01T00:00:00.000Z",
          failureRecoveryAttempt: {
            actionId: "action-1",
            label: "Run npm test",
            source: "auto",
            attempt: 1,
            limit: 2
          }
        },
        {
          createdAt: "2026-06-01T00:01:00.000Z",
          failureRecoveryAttempt: {
            actionId: "action-2",
            label: "Run lint",
            source: "manual"
          }
        }
      ],
      "action-1"
    );

    expect(attempts).toEqual([
      {
        actionId: "action-1",
        label: "Run npm test",
        source: "auto",
        attempt: 1,
        limit: 2,
        createdAt: "2026-06-01T00:00:00.000Z"
      }
    ]);
  });

  it("counts automatic attempts globally or by action", () => {
    const events = [
      { failureRecoveryAttempt: { actionId: "action-1", label: "manual", source: "manual" as const } },
      { failureRecoveryAttempt: { actionId: "action-1", label: "auto", source: "auto" as const } },
      { failureRecoveryAttempt: { actionId: "action-2", label: "auto", source: "auto" as const } }
    ];

    expect(countAutoFailureRecoveryAttempts(events, "action-1")).toBe(1);
    expect(countAutoFailureRecoveryAttempts(events)).toBe(2);
  });
});
