// 本文件说明: 注册本机 skill 扫描 IPC
import { localSkillChannels } from "../shared/ipcChannels.js";
import type {
  LocalSkillFileContent,
  LocalPluginSkillCreateRequest,
  LocalPluginSkillCreateResult,
  LocalSkillScanResult
} from "../shared/pluginSkillTypes.js";

type IpcHandle = (
  channel: string,
  handler: (event: unknown, ...args: unknown[]) => Promise<unknown>
) => void;

export function registerLocalSkillHandlers(
  scanLocalSkills: () => Promise<LocalSkillScanResult>,
  readLocalSkillFileContent: (filePath: string) => Promise<LocalSkillFileContent>,
  createLocalPluginSkill: (
    request: LocalPluginSkillCreateRequest
  ) => Promise<LocalPluginSkillCreateResult>,
  handle: IpcHandle
): void {
  handle(localSkillChannels.scan, () => scanLocalSkills());
  handle(localSkillChannels.readFile, (_event, filePath) =>
    readLocalSkillFileContent(assertString(filePath))
  );
  handle(localSkillChannels.create, (_event, request) =>
    createLocalPluginSkill(assertCreateRequest(request))
  );
}

function assertCreateRequest(value: unknown): LocalPluginSkillCreateRequest {
  if (!isRecord(value) || (value.kind !== "plugin" && value.kind !== "skill")) {
    throw new Error("Invalid local plugin or skill create request");
  }

  if (typeof value.name !== "string") {
    throw new Error("Local plugin or skill name is required");
  }

  return {
    kind: value.kind,
    name: value.name,
    description: typeof value.description === "string" ? value.description : undefined
  };
}

function assertString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected string argument");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
