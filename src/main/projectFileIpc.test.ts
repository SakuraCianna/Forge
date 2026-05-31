// 本文件说明: 主进程 项目文件 IPC 通道测试
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
      async (request) => ({
        pattern: request.pattern,
        matches: [],
        truncated: false
      }),
      async (request) => ({
        query: request.query,
        matches: [],
        truncated: false
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
      async (request) => ({ pattern: request.pattern, matches: [], truncated: false }),
      async (request) => ({ query: request.query, matches: [], truncated: false }),
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

  it("registers a project text search handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();

    registerProjectFileHandlers(
      async (request) => ({ relativePath: request.relativePath, content: "", size: 0 }),
      async (request) => ({
        relativePath: request.relativePath,
        currentContent: "",
        nextContent: request.nextContent,
        diff: []
      }),
      async (request) => ({ relativePath: request.relativePath, content: request.nextContent, size: 0 }),
      async (request) => ({ pattern: request.pattern, matches: [], truncated: false }),
      async (request) => ({
        query: request.query,
        matches: [
          {
            relativePath: "src/App.tsx",
            lineNumber: 7,
            preview: "const target = true;"
          }
        ],
        truncated: false
      }),
      (channel, handler) => handlers.set(channel, handler)
    );

    await expect(
      handlers.get(fileChannels.searchText)?.(null, {
        projectRoot: "E:\\CodeHome\\Forge",
        query: "target"
      })
    ).resolves.toEqual({
      query: "target",
      matches: [
        {
          relativePath: "src/App.tsx",
          lineNumber: 7,
          preview: "const target = true;"
        }
      ],
      truncated: false
    });
  });

  it("registers a project file glob handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();

    registerProjectFileHandlers(
      async (request) => ({ relativePath: request.relativePath, content: "", size: 0 }),
      async (request) => ({
        relativePath: request.relativePath,
        currentContent: "",
        nextContent: request.nextContent,
        diff: []
      }),
      async (request) => ({ relativePath: request.relativePath, content: request.nextContent, size: 0 }),
      async (request) => ({
        pattern: request.pattern,
        matches: [
          {
            relativePath: "src/App.tsx",
            size: 128
          }
        ],
        truncated: false
      }),
      async (request) => ({ query: request.query, matches: [], truncated: false }),
      (channel, handler) => handlers.set(channel, handler)
    );

    await expect(
      handlers.get(fileChannels.globFiles)?.(null, {
        projectRoot: "E:\\CodeHome\\Forge",
        pattern: "src/**/*.tsx"
      })
    ).resolves.toEqual({
      pattern: "src/**/*.tsx",
      matches: [
        {
          relativePath: "src/App.tsx",
          size: 128
        }
      ],
      truncated: false
    });
  });
});
