// 本文件说明: 主进程 密钥保险库 IPC 通道
import type { ProviderKeyStatus } from "./keyVault.js";
import { keyVaultChannels } from "../shared/ipcChannels.js";

type KeyVault = {
  saveProviderKey: (providerId: string, apiKey: string) => Promise<void>;
  getProviderKeyStatus: (providerId: string) => Promise<ProviderKeyStatus>;
  deleteProviderKey: (providerId: string) => Promise<void>;
  readProviderKey: (providerId: string) => Promise<string | null>;
};

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { keyVaultChannels };

export function registerKeyVaultHandlers(vault: KeyVault, registerHandler: RegisterHandler): void {
  registerHandler(keyVaultChannels.save, async (_event, providerId, apiKey) => {
    await vault.saveProviderKey(assertString(providerId), assertString(apiKey));
  });

  registerHandler(keyVaultChannels.status, async (_event, providerId) =>
    vault.getProviderKeyStatus(assertString(providerId))
  );

  registerHandler(keyVaultChannels.delete, async (_event, providerId) => {
    await vault.deleteProviderKey(assertString(providerId));
  });
}

function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid IPC argument");
  }

  return value;
}
