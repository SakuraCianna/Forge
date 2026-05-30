// 本文件说明: 注册项目文件 IPC, 读取和写入都经过路径边界检查
import { fileChannels } from "../shared/ipcChannels.js";
import type { ProjectFileChangePreview, ProjectTextFile } from "../shared/fileTypes.js";

export type ReadProjectTextFileRequest = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

export type UpdateProjectTextFileRequest = ReadProjectTextFileRequest & {
  nextContent: string;
};

type ReadProjectTextFile = (request: ReadProjectTextFileRequest) => Promise<ProjectTextFile>;

type PreviewProjectTextFileUpdate = (
  request: UpdateProjectTextFileRequest
) => Promise<ProjectFileChangePreview>;

type WriteProjectTextFile = (request: UpdateProjectTextFileRequest) => Promise<ProjectTextFile>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { fileChannels };

// 暴露读取, 预览修改和写入文本文件的受控入口
export function registerProjectFileHandlers(
  readProjectTextFile: ReadProjectTextFile,
  previewProjectTextFileUpdate: PreviewProjectTextFileUpdate,
  writeProjectTextFile: WriteProjectTextFile,
  registerHandler: RegisterHandler
): void {
  registerHandler(fileChannels.readText, async (_event, request) =>
    readProjectTextFile(assertReadRequest(request))
  );

  registerHandler(fileChannels.previewTextUpdate, async (_event, request) =>
    previewProjectTextFileUpdate(assertUpdateRequest(request))
  );

  registerHandler(fileChannels.writeText, async (_event, request) =>
    writeProjectTextFile(assertUpdateRequest(request))
  );
}

// 校验文件读取请求, 项目根路径和相对路径都必须明确
function assertReadRequest(value: unknown): ReadProjectTextFileRequest {
  if (
    !isRecord(value) ||
    typeof value.projectRoot !== "string" ||
    typeof value.relativePath !== "string"
  ) {
    throw new Error("Invalid file read request");
  }

  return {
    projectRoot: value.projectRoot,
    relativePath: value.relativePath,
    maxBytes: typeof value.maxBytes === "number" ? value.maxBytes : undefined
  };
}

// 校验文件更新请求, nextContent 必须是渲染层传来的完整文本
function assertUpdateRequest(value: unknown): UpdateProjectTextFileRequest {
  const readRequest = assertReadRequest(value);

  if (!isRecord(value) || typeof value.nextContent !== "string") {
    throw new Error("Invalid file update request");
  }

  return {
    ...readRequest,
    nextContent: value.nextContent
  };
}

// 缩窄 IPC 入参, 避免直接访问 unknown 上的字段
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
