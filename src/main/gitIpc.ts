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

function assertStatusRequest(value: unknown): ProjectGitStatusRequest {
  if (!isRecord(value) || typeof value.projectRoot !== "string") {
    throw new Error("Invalid Git status request");
  }

  return { projectRoot: value.projectRoot };
}

function assertCommitRequest(value: unknown): ProjectGitCommitRequest {
  if (!isRecord(value) || typeof value.projectRoot !== "string" || typeof value.message !== "string") {
    throw new Error("Invalid Git commit request");
  }

  return { projectRoot: value.projectRoot, message: value.message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
