// 本文件说明: 主进程 供应商模型 IPC 通道
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import { providerModelChannels } from "../shared/ipcChannels.js";

type ProviderModelFetcher = (provider: ForgeProvider) => Promise<ForgeModel[]>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { providerModelChannels };

export function registerProviderModelHandlers(
  fetchModels: ProviderModelFetcher,
  registerHandler: RegisterHandler
): void {
  registerHandler(providerModelChannels.fetch, async (_event, provider) =>
    fetchModels(assertProvider(provider))
  );
}

function assertProvider(value: unknown): ForgeProvider {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    throw new Error("Invalid provider argument");
  }

  return value as ForgeProvider;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
