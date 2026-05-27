import { describe, expect, it } from "vitest";
import { projectChannels, registerProjectHandlers } from "./projectIpc";

describe("projectIpc", () => {
  it("registers a project directory picker handler", async () => {
    const handlers = new Map<string, (_event: unknown) => Promise<unknown>>();

    registerProjectHandlers(
      async () => "E:\\CodeHome\\Forge",
      (channel, handler) => handlers.set(channel, handler)
    );

    const result = await handlers.get(projectChannels.pickDirectory)?.(null);

    expect(result).toBe("E:\\CodeHome\\Forge");
  });
});
