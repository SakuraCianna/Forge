// 本文件说明: 注册项目选择和扫描 IPC, 文件系统访问集中在主进程
import { projectChannels } from "../shared/ipcChannels.js";
import type { ProjectScanResult } from "../shared/projectTypes.js";

type PickProjectDirectory = () => Promise<string | null>;

type ScanProjectFiles = (rootPath: string) => Promise<ProjectScanResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { projectChannels };

// 暴露选择目录和扫描项目两个入口, 渲染层只接收结果数据
export function registerProjectHandlers(
  pickProjectDirectory: PickProjectDirectory,
  scanProjectFiles: ScanProjectFiles,
  registerHandler: RegisterHandler
): void {
  registerHandler(projectChannels.pickDirectory, async () => pickProjectDirectory());

  registerHandler(projectChannels.scan, async (_event, rootPath) =>
    scanProjectFiles(assertString(rootPath))
  );
}

// 校验项目路径字符串, 避免扫描器收到无效 IPC 参数
function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("无效的项目路径参数。");
  }

  return value;
}
