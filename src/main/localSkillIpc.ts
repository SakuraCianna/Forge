// 本文件说明: 注册本机 skill 扫描 IPC
import { localSkillChannels } from "../shared/ipcChannels.js";
import type {
  LocalSkillFileContent,
  LocalSkillScanResult
} from "../shared/pluginSkillTypes.js";

type IpcHandle = (
  channel: string,
  handler: (event: unknown, ...args: unknown[]) => Promise<unknown>
) => void;

export function registerLocalSkillHandlers(
  scanLocalSkills: () => Promise<LocalSkillScanResult>,
  readLocalSkillFileContent: (filePath: string) => Promise<LocalSkillFileContent>,
  handle: IpcHandle
): void {
  handle(localSkillChannels.scan, () => scanLocalSkills());
  handle(localSkillChannels.readFile, (_event, filePath) =>
    readLocalSkillFileContent(assertString(filePath))
  );
}

function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected string argument");
  }

  return value;
}
