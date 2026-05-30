// 本文件说明: 注册 Git 状态和提交 IPC, 渲染层不直接碰本地 Git 命令
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitStatus,
  ProjectGitStatusRequest
} from "../shared/gitTypes.js";
import { gitChannels } from "../shared/ipcChannels.js";

type GitStatusReader = (request: ProjectGitStatusRequest) => Promise<ProjectGitStatus>;

type GitCommitter = (request: ProjectGitCommitRequest) => Promise<ProjectGitCommitResult>;

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

type RegisterHandler = (channel: string, handler: IpcHandler) => void;

export { gitChannels };

// 绑定 Git 状态查询和提交处理器, 所有请求都先检查项目路径
export function registerGitHandlers(
  getStatus: GitStatusReader,
  commit: GitCommitter,
  registerHandler: RegisterHandler
): void {
  registerHandler(gitChannels.status, async (_event, request) =>
    getStatus(assertStatusRequest(request))
  );
  registerHandler(gitChannels.commit, async (_event, request) =>
    commit(assertCommitRequest(request))
  );
}

// 校验 Git 状态请求, 防止空路径传入命令层
function assertStatusRequest(value: unknown): ProjectGitStatusRequest {
  if (!isRecord(value) || typeof value.projectRoot !== "string") {
    throw new Error("Invalid Git status request");
  }

  return { projectRoot: value.projectRoot };
}

// 校验提交请求, 项目路径和提交信息都必须由用户明确提供
function assertCommitRequest(value: unknown): ProjectGitCommitRequest {
  if (!isRecord(value) || typeof value.projectRoot !== "string" || typeof value.message !== "string") {
    throw new Error("Invalid Git commit request");
  }

  return { projectRoot: value.projectRoot, message: value.message };
}

// 将 unknown 转成可检查对象, 避免 IPC 参数直接信任
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
