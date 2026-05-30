// 本文件说明: 注册供应商模型拉取 IPC, 远端请求统一在主进程发起
import type { ForgeModel, ForgeProvider } from "../shared/modelTypes.js";
import { providerModelChannels } from "../shared/ipcChannels.js";

type ProviderModelFetcher = (provider: ForgeProvider) => Promise<ForgeModel[]>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { providerModelChannels };

// 暴露模型列表拉取入口, 渲染层只传供应商配置
export function registerProviderModelHandlers(
  fetchModels: ProviderModelFetcher,
  registerHandler: RegisterHandler
): void {
  registerHandler(providerModelChannels.fetch, async (_event, provider) =>
    fetchModels(assertProvider(provider))
  );
}

// 校验供应商配置的核心字段, Base URL 和 Key 由服务层继续处理
function assertProvider(value: unknown): ForgeProvider {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    throw new Error("无效的模型提供商参数。");
  }

  return value as ForgeProvider;
}

// 将 IPC 入参缩窄为对象, 让字段判断保持类型安全
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
