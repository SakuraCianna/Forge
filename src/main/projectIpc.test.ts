// 本文件说明: 主进程 项目 IPC 通道测试
import { describe, expect, it } from "vitest";
import { projectChannels, registerProjectHandlers } from "./projectIpc";

describe("projectIpc", () => {
  it("registers a project directory picker handler", async () => {
    const handlers = new Map<string, (_event: unknown) => Promise<unknown>>();

    registerProjectHandlers(
      async () => "E:\\CodeHome\\Forge",
      async () => ({ rootPath: "E:\\CodeHome\\Forge", files: [], truncated: false }),
      (channel, handler) => handlers.set(channel, handler)
    );

    const result = await handlers.get(projectChannels.pickDirectory)?.(null);

    expect(result).toBe("E:\\CodeHome\\Forge");
  });

  it("registers a project scan handler", async () => {
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();

    registerProjectHandlers(
      async () => null,
      async (rootPath) => ({
        rootPath,
        files: [{ relativePath: "package.json", size: 2 }],
        truncated: false
      }),
      (channel, handler) => handlers.set(channel, handler)
    );

    const result = await handlers.get(projectChannels.scan)?.(null, "E:\\CodeHome\\Forge");

    expect(result).toEqual({
      rootPath: "E:\\CodeHome\\Forge",
      files: [{ relativePath: "package.json", size: 2 }],
      truncated: false
    });
  });
});
