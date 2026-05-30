// 本文件说明: 主进程 项目文件 IPC 通道
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
