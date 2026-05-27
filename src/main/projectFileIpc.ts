import { fileChannels } from "../shared/ipcChannels.js";
import type { ProjectTextFile } from "../shared/fileTypes.js";

export type ReadProjectTextFileRequest = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

type ReadProjectTextFile = (request: ReadProjectTextFileRequest) => Promise<ProjectTextFile>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { fileChannels };

export function registerProjectFileHandlers(
  readProjectTextFile: ReadProjectTextFile,
  registerHandler: RegisterHandler
): void {
  registerHandler(fileChannels.readText, async (_event, request) =>
    readProjectTextFile(assertReadRequest(request))
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
