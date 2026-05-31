// 本文件说明: 把受控 IPC API 暴露给渲染层, 屏蔽 Electron 内部对象
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  agentChannels,
  commandChannels,
  fileChannels,
  gitChannels,
  keyVaultChannels,
  projectChannels,
  providerModelChannels,
  windowChannels
} from "../shared/ipcChannels.js";
import type {
  AgentFileChangeResult,
  AgentAskStreamChunk,
  AgentAskResult,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import type { ForgeProvider } from "../shared/modelTypes.js";
import type { CommandOutputChunk } from "../shared/commandTypes.js";
import type {
  ProjectDirectoryListResult,
  ProjectFileChangePreview,
  ProjectFileGlobResult,
  ProjectTextFile,
  ProjectTextSearchResult
} from "../shared/fileTypes.js";
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitStatus,
  ProjectGitStatusRequest,
  ProjectGitWorktreeRequest,
  ProjectGitWorktreeResult
} from "../shared/gitTypes.js";
import type { ProjectScanResult } from "../shared/projectTypes.js";

contextBridge.exposeInMainWorld("forge", {
  appName: "Forge",
  windowControls: {
    minimize: () => {
      ipcRenderer.send(windowChannels.minimize);
      return Promise.resolve();
    },
    toggleMaximize: () => {
      ipcRenderer.send(windowChannels.toggleMaximize);
      return Promise.resolve();
    },
    close: () => {
      ipcRenderer.send(windowChannels.close);
      return Promise.resolve();
    }
  },
  secrets: {
    saveProviderKey: (providerId: string, apiKey: string) =>
      ipcRenderer.invoke(keyVaultChannels.save, providerId, apiKey),
    getProviderKeyStatus: (providerId: string) =>
      ipcRenderer.invoke(keyVaultChannels.status, providerId),
    deleteProviderKey: (providerId: string) => ipcRenderer.invoke(keyVaultChannels.delete, providerId)
  },
  models: {
    fetchProviderModels: (provider: ForgeProvider) =>
      ipcRenderer.invoke(providerModelChannels.fetch, provider),
    refreshOpenRouterCatalog: () =>
      ipcRenderer.invoke(providerModelChannels.refreshOpenRouterCatalog)
  },
  agent: {
    generatePlan: (request: GenerateAgentPlanRequest): Promise<AgentPlanResult> =>
      ipcRenderer.invoke(agentChannels.generatePlan, request),
    generateFileChange: (
      request: GenerateAgentFileChangeRequest
    ): Promise<AgentFileChangeResult> =>
      ipcRenderer.invoke(agentChannels.generateFileChange, request),
    generateAsk: (request: GenerateAgentAskRequest): Promise<AgentAskResult> =>
      ipcRenderer.invoke(agentChannels.generateAsk, request),
    generateAskStream: (
      requestId: string,
      request: GenerateAgentAskRequest
    ): Promise<AgentAskResult> =>
      ipcRenderer.invoke(agentChannels.generateAskStream, requestId, request),
    cancelAskStream: (requestId: string): Promise<{ ok: boolean; requestId: string }> =>
      ipcRenderer.invoke(agentChannels.cancelAskStream, requestId),
    onAskStreamChunk: (listener: (chunk: AgentAskStreamChunk) => void) => {
      // 把主进程的回答增量转给渲染层监听器, 卸载时同步移除事件
      const handler = (_event: IpcRendererEvent, chunk: AgentAskStreamChunk) => listener(chunk);
      ipcRenderer.on(agentChannels.askStreamChunk, handler);

      return () => ipcRenderer.removeListener(agentChannels.askStreamChunk, handler);
    }
  },
  projects: {
    pickDirectory: () => ipcRenderer.invoke(projectChannels.pickDirectory),
    scan: (rootPath: string): Promise<ProjectScanResult> =>
      ipcRenderer.invoke(projectChannels.scan, rootPath)
  },
  commands: {
    run: (request: {
      runId?: string;
      projectRoot: string;
      cwd: string;
      command: string;
      timeoutMs?: number;
    }) => ipcRenderer.invoke(commandChannels.run, request),
    cancel: (request: { runId: string }): Promise<{ ok: boolean; runId: string }> =>
      ipcRenderer.invoke(commandChannels.cancel, request),
    onOutput: (listener: (chunk: CommandOutputChunk) => void) => {
      // 把命令输出流转给渲染层监听器, 返回清理函数防止重复订阅
      const handler = (_event: IpcRendererEvent, chunk: CommandOutputChunk) => listener(chunk);
      ipcRenderer.on(commandChannels.output, handler);

      return () => ipcRenderer.removeListener(commandChannels.output, handler);
    }
  },
  git: {
    status: (request: ProjectGitStatusRequest): Promise<ProjectGitStatus> =>
      ipcRenderer.invoke(gitChannels.status, request),
    commit: (request: ProjectGitCommitRequest): Promise<ProjectGitCommitResult> =>
      ipcRenderer.invoke(gitChannels.commit, request),
    createWorktree: (
      request: ProjectGitWorktreeRequest
    ): Promise<ProjectGitWorktreeResult> =>
      ipcRenderer.invoke(gitChannels.createWorktree, request)
  },
  files: {
    readText: (request: {
      projectRoot: string;
      relativePath: string;
      maxBytes?: number;
    }): Promise<ProjectTextFile> => ipcRenderer.invoke(fileChannels.readText, request),
    listDirectory: (request: {
      projectRoot: string;
      relativePath?: string;
      limit?: number;
    }): Promise<ProjectDirectoryListResult> =>
      ipcRenderer.invoke(fileChannels.listDirectory, request),
    globFiles: (request: {
      projectRoot: string;
      pattern: string;
      limit?: number;
    }): Promise<ProjectFileGlobResult> => ipcRenderer.invoke(fileChannels.globFiles, request),
    searchText: (request: {
      projectRoot: string;
      query: string;
      limit?: number;
      maxFileBytes?: number;
    }): Promise<ProjectTextSearchResult> => ipcRenderer.invoke(fileChannels.searchText, request),
    previewTextUpdate: (request: {
      projectRoot: string;
      relativePath: string;
      nextContent: string;
      maxBytes?: number;
    }): Promise<ProjectFileChangePreview> =>
      ipcRenderer.invoke(fileChannels.previewTextUpdate, request),
    writeText: (request: {
      projectRoot: string;
      relativePath: string;
      nextContent: string;
      maxBytes?: number;
    }): Promise<ProjectTextFile> => ipcRenderer.invoke(fileChannels.writeText, request)
  }
});
