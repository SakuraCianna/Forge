import { describe, expect, it, vi } from "vitest";
import type { ProjectGitCommitResult, ProjectGitStatus } from "../shared/gitTypes.js";
import { gitChannels, registerGitHandlers } from "./gitIpc.js";

describe("gitIpc", () => {
  it("registers status and commit handlers", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const status: ProjectGitStatus = {
      isRepo: true,
      changedFiles: ["src/App.tsx"],
      changes: [{ path: "src/App.tsx", status: "M", diff: "+changed\n" }],
      rawStatus: " M src/App.tsx\n"
    };
    const commitResult: ProjectGitCommitResult = {
      output: "[main abc] update",
      status: { isRepo: true, changedFiles: [], changes: [], rawStatus: "" }
    };
    const getStatus = vi.fn(async () => status);
    const commit = vi.fn(async () => commitResult);

    registerGitHandlers(getStatus, commit, (channel, handler) => handlers.set(channel, handler));

    await expect(
      handlers.get(gitChannels.status)?.(null, { projectRoot: "E:\\CodeHome\\Forge" })
    ).resolves.toEqual(status);
    await expect(
      handlers.get(gitChannels.commit)?.(null, {
        projectRoot: "E:\\CodeHome\\Forge",
        message: "update"
      })
    ).resolves.toEqual(commitResult);
  });
});
