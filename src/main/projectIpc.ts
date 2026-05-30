// 本文件说明: 主进程 项目 IPC 通道
import { projectChannels } from "../shared/ipcChannels.js";
import type { ProjectScanResult } from "../shared/projectTypes.js";

type PickProjectDirectory = () => Promise<string | null>;

type ScanProjectFiles = (rootPath: string) => Promise<ProjectScanResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { projectChannels };

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

function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid project path argument");
  }

  return value;
}
