// 本文件说明: 注册项目文件 IPC, 读取和写入都经过路径边界检查
import { fileChannels } from "../shared/ipcChannels.js";
import type {
  ProjectDirectoryListRequest,
  ProjectDirectoryListResult,
  ProjectFileChangePreview,
  ProjectFileDeleteResult,
  ProjectFileGlobRequest,
  ProjectFileGlobResult,
  ProjectFilePreview,
  ProjectTextFile,
  ProjectTextSearchRequest,
  ProjectTextSearchResult
} from "../shared/fileTypes.js";

type ReadProjectTextFileRequest = {
  projectRoot: string;
  relativePath: string;
  maxBytes?: number;
};

type UpdateProjectTextFileRequest = ReadProjectTextFileRequest & {
  nextContent: string;
};

type ReadProjectTextFile = (request: ReadProjectTextFileRequest) => Promise<ProjectTextFile>;

type PreviewProjectFile = (request: ReadProjectTextFileRequest) => Promise<ProjectFilePreview>;

type ListProjectDirectory = (
  request: ProjectDirectoryListRequest
) => Promise<ProjectDirectoryListResult>;

type GlobProjectFiles = (
  request: ProjectFileGlobRequest
) => Promise<ProjectFileGlobResult>;

type SearchProjectTextFiles = (
  request: ProjectTextSearchRequest
) => Promise<ProjectTextSearchResult>;

type PreviewProjectTextFileUpdate = (
  request: UpdateProjectTextFileRequest
) => Promise<ProjectFileChangePreview>;

type WriteProjectTextFile = (request: UpdateProjectTextFileRequest) => Promise<ProjectTextFile>;

type DeleteProjectFile = (request: ReadProjectTextFileRequest) => Promise<ProjectFileDeleteResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { fileChannels };

// 暴露读取, 预览修改和写入文本文件的受控入口
export function registerProjectFileHandlers(
  readProjectTextFile: ReadProjectTextFile,
  previewProjectFile: PreviewProjectFile,
  previewProjectTextFileUpdate: PreviewProjectTextFileUpdate,
  writeProjectTextFile: WriteProjectTextFile,
  deleteProjectFile: DeleteProjectFile,
  listProjectDirectory: ListProjectDirectory,
  globProjectFiles: GlobProjectFiles,
  searchProjectTextFiles: SearchProjectTextFiles,
  registerHandler: RegisterHandler
): void {
  registerHandler(fileChannels.readText, async (_event, request) =>
    readProjectTextFile(assertReadRequest(request))
  );

  registerHandler(fileChannels.preview, async (_event, request) =>
    previewProjectFile(assertReadRequest(request))
  );

  registerHandler(fileChannels.listDirectory, async (_event, request) =>
    listProjectDirectory(assertListDirectoryRequest(request))
  );

  registerHandler(fileChannels.globFiles, async (_event, request) =>
    globProjectFiles(assertGlobRequest(request))
  );

  registerHandler(fileChannels.searchText, async (_event, request) =>
    searchProjectTextFiles(assertSearchRequest(request))
  );

  registerHandler(fileChannels.previewTextUpdate, async (_event, request) =>
    previewProjectTextFileUpdate(assertUpdateRequest(request))
  );

  registerHandler(fileChannels.writeText, async (_event, request) =>
    writeProjectTextFile(assertUpdateRequest(request))
  );

  registerHandler(fileChannels.deleteFile, async (_event, request) =>
    deleteProjectFile(assertReadRequest(request))
  );
}

// 校验项目目录列表请求, 路径可省略但必须由服务层归一化
function assertListDirectoryRequest(value: unknown): ProjectDirectoryListRequest {
  if (!isRecord(value) || typeof value.projectRoot !== "string") {
    throw new Error("Invalid directory list request");
  }

  return {
    projectRoot: value.projectRoot,
    relativePath: typeof value.relativePath === "string" ? value.relativePath : undefined,
    limit: typeof value.limit === "number" ? value.limit : undefined
  };
}

// 校验项目 glob 请求, 只允许明确的项目根目录和匹配模式
function assertGlobRequest(value: unknown): ProjectFileGlobRequest {
  if (
    !isRecord(value) ||
    typeof value.projectRoot !== "string" ||
    typeof value.pattern !== "string"
  ) {
    throw new Error("Invalid file glob request");
  }

  return {
    projectRoot: value.projectRoot,
    pattern: value.pattern,
    limit: typeof value.limit === "number" ? value.limit : undefined
  };
}

// 校验项目搜索请求, 只允许明确的项目根目录和搜索关键词
function assertSearchRequest(value: unknown): ProjectTextSearchRequest {
  if (
    !isRecord(value) ||
    typeof value.projectRoot !== "string" ||
    typeof value.query !== "string"
  ) {
    throw new Error("Invalid file search request");
  }

  return {
    projectRoot: value.projectRoot,
    query: value.query,
    limit: typeof value.limit === "number" ? value.limit : undefined,
    maxFileBytes: typeof value.maxFileBytes === "number" ? value.maxFileBytes : undefined
  };
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
