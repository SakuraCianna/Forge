import { describe, expect, it } from "vitest";
import { fileChannels, registerProjectFileHandlers } from "./projectFileIpc";

describe("projectFileIpc", () => {
  it("registers a text file read handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();

    registerProjectFileHandlers(
      async (request) => ({
        relativePath: request.relativePath,
        content: "hello",
        size: 5
      }),
      (channel, handler) => handlers.set(channel, handler)
    );

    const result = await handlers.get(fileChannels.readText)?.(null, {
      projectRoot: "E:\\CodeHome\\Forge",
      relativePath: "README.md"
    });

    expect(result).toEqual({
      relativePath: "README.md",
      content: "hello",
      size: 5
    });
  });
});
