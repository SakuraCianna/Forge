// 本文件说明: 主进程 密钥保险库 IPC 通道测试
import { describe, expect, it } from "vitest";
import { keyVaultChannels, registerKeyVaultHandlers } from "./keyVaultIpc";
import type { ProviderKeyStatus } from "./keyVault";

describe("keyVaultIpc", () => {
  it("registers save, status, and delete handlers", async () => {
    const calls: string[] = [];
    const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const status: ProviderKeyStatus = { hasKey: true, last4: "3456" };

    registerKeyVaultHandlers(
      {
        saveProviderKey: async (providerId, apiKey) => {
          calls.push(`save:${providerId}:${apiKey}`);
        },
        getProviderKeyStatus: async (providerId) => {
          calls.push(`status:${providerId}`);
          return status;
        },
        deleteProviderKey: async (providerId) => {
          calls.push(`delete:${providerId}`);
        },
        readProviderKey: async () => null
      },
      (channel, handler) => handlers.set(channel, handler)
    );

    await handlers.get(keyVaultChannels.save)?.(null, "openai", "sk-secret-123456");
    const returnedStatus = await handlers.get(keyVaultChannels.status)?.(null, "openai");
    await handlers.get(keyVaultChannels.delete)?.(null, "openai");

    expect(returnedStatus).toEqual(status);
    expect(calls).toEqual([
      "save:openai:sk-secret-123456",
      "status:openai",
      "delete:openai"
    ]);
  });
});
