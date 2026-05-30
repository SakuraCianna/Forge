// 本文件说明: 注册密钥保险库 IPC, API Key 只在主进程读写
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

// 暴露保存, 状态查询和删除密钥的受控入口
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

// 校验 IPC 字符串参数, 防止 providerId 或 apiKey 为空类型
function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("无效的 IPC 参数。");
  }

  return value;
}
