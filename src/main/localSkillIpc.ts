// 本文件说明: 注册本机 skill 扫描 IPC
import { localSkillChannels } from "../shared/ipcChannels.js";
import type { LocalSkillScanResult } from "../shared/pluginSkillTypes.js";

type IpcHandle = (
  channel: string,
  handler: () => Promise<LocalSkillScanResult>
) => void;

export function registerLocalSkillHandlers(
  scanLocalSkills: () => Promise<LocalSkillScanResult>,
  handle: IpcHandle
): void {
  handle(localSkillChannels.scan, () => scanLocalSkills());
}
