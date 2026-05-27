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
      async (request) => ({
        relativePath: request.relativePath,
        currentContent: "",
        nextContent: request.nextContent,
        diff: []
      }),
      async (request) => ({
        relativePath: request.relativePath,
        content: request.nextContent,
        size: request.nextContent.length
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

  it("registers preview and write handlers", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();

    registerProjectFileHandlers(
      async (request) => ({ relativePath: request.relativePath, content: "old", size: 3 }),
      async (request) => ({
        relativePath: request.relativePath,
        currentContent: "old",
        nextContent: request.nextContent,
        diff: []
      }),
      async (request) => ({ relativePath: request.relativePath, content: request.nextContent, size: 3 }),
      (channel, handler) => handlers.set(channel, handler)
    );

    await expect(
      handlers.get(fileChannels.previewTextUpdate)?.(null, {
        projectRoot: "E:\\CodeHome\\Forge",
        relativePath: "README.md",
        nextContent: "new"
      })
    ).resolves.toMatchObject({ nextContent: "new" });

    await expect(
      handlers.get(fileChannels.writeText)?.(null, {
        projectRoot: "E:\\CodeHome\\Forge",
        relativePath: "README.md",
        nextContent: "new"
      })
    ).resolves.toMatchObject({ content: "new" });
  });
});
