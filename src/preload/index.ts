// 本文件说明: 把受控 IPC API 暴露给渲染层, 屏蔽 Electron 内部对象
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  agentChannels,
  builtInToolChannels,
  commandChannels,
  extensionChannels,
  fileChannels,
  gitChannels,
  keyVaultChannels,
  localSkillChannels,
  projectChannels,
  providerModelChannels,
  systemChannels,
  webSearchChannels,
  windowChannels
} from "../shared/ipcChannels.js";
import type {
  AgentFileChangeResult,
  AgentAskStreamChunk,
  AgentAskResult,
  AgentPlanStreamChunk,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import type { ForgeProvider } from "../shared/modelTypes.js";
import type {
  AgentQualityMetricSnapshot,
  AgentQualityObservation
} from "../shared/agentQualityMetrics.js";
import type {
  BuiltInToolCallLogRecord,
  BuiltInToolCatalogSnapshot,
  BuiltInToolExecutionRequest
} from "../shared/builtInToolTypes.js";
import type {
  ExtensionConfirmInvocationRequest,
  ExtensionCreateRequest,
  ExtensionCreateResult,
  ExtensionDeleteResult,
  ExtensionInvocationLogRecord,
  ExtensionInvocationRequest,
  ExtensionInvocationResult,
  ExtensionRegistrySnapshot,
  ExtensionSecretSaveRequest,
  ExtensionSettingsPatch,
  ExtensionUpdateRequest,
  ExtensionUpdateResult
} from "../shared/extensionTypes.js";
import type {
  LocalSkillFileContent,
  LocalPluginSkillCreateRequest,
  LocalPluginSkillCreateResult,
  LocalPluginSkillDeleteRequest,
  LocalPluginSkillDeleteResult,
  LocalPluginSkillUpdateRequest,
  LocalPluginSkillUpdateResult,
  LocalSkillScanResult
} from "../shared/pluginSkillTypes.js";
import type { CommandOutputChunk } from "../shared/commandTypes.js";
import type {
  ProjectDirectoryListResult,
  ProjectFileChangePreview,
  ProjectFileDeleteResult,
  ProjectFileGlobResult,
  ProjectFilePreview,
  ProjectTextFile,
  ProjectTextSearchResult
} from "../shared/fileTypes.js";
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitPushRequest,
  ProjectGitPushResult,
  ProjectGitStatus,
  ProjectGitStatusRequest,
  ProjectGitWorktreeRequest,
  ProjectGitWorktreeResult
} from "../shared/gitTypes.js";
import type { ProjectScanResult } from "../shared/projectTypes.js";
import type { WebSearchRequest, WebSearchResult } from "../shared/webSearchTypes.js";

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
    deleteProviderKey: (providerId: string) => ipcRenderer.invoke(keyVaultChannels.delete, providerId),
    clearAllProviderKeys: () => ipcRenderer.invoke(keyVaultChannels.clearAll)
  },
  models: {
    fetchProviderModels: (provider: ForgeProvider) =>
      ipcRenderer.invoke(providerModelChannels.fetch, provider),
    refreshOpenRouterCatalog: () =>
      ipcRenderer.invoke(providerModelChannels.refreshOpenRouterCatalog)
  },
  skills: {
    scanLocal: (): Promise<LocalSkillScanResult> =>
      ipcRenderer.invoke(localSkillChannels.scan),
    readFile: (filePath: string): Promise<LocalSkillFileContent> =>
      ipcRenderer.invoke(localSkillChannels.readFile, filePath),
    create: (request: LocalPluginSkillCreateRequest): Promise<LocalPluginSkillCreateResult> =>
      ipcRenderer.invoke(localSkillChannels.create, request),
    update: (request: LocalPluginSkillUpdateRequest): Promise<LocalPluginSkillUpdateResult> =>
      ipcRenderer.invoke(localSkillChannels.update, request),
    delete: (request: LocalPluginSkillDeleteRequest): Promise<LocalPluginSkillDeleteResult> =>
      ipcRenderer.invoke(localSkillChannels.delete, request)
  },
  extensions: {
    getRegistry: (): Promise<ExtensionRegistrySnapshot> =>
      ipcRenderer.invoke(extensionChannels.registry),
    create: (request: ExtensionCreateRequest): Promise<ExtensionCreateResult> =>
      ipcRenderer.invoke(extensionChannels.create, request),
    update: (request: ExtensionUpdateRequest): Promise<ExtensionUpdateResult> =>
      ipcRenderer.invoke(extensionChannels.update, request),
    delete: (extensionId: string): Promise<ExtensionDeleteResult> =>
      ipcRenderer.invoke(extensionChannels.delete, extensionId),
    updateSettings: (patch: ExtensionSettingsPatch): Promise<ExtensionRegistrySnapshot> =>
      ipcRenderer.invoke(extensionChannels.updateSettings, patch),
    saveSecret: (request: ExtensionSecretSaveRequest): Promise<ExtensionRegistrySnapshot> =>
      ipcRenderer.invoke(extensionChannels.saveSecret, request),
    deleteSecret: (extensionId: string, fieldId: string): Promise<ExtensionRegistrySnapshot> =>
      ipcRenderer.invoke(extensionChannels.deleteSecret, extensionId, fieldId),
    invoke: (request: ExtensionInvocationRequest): Promise<ExtensionInvocationResult> =>
      ipcRenderer.invoke(extensionChannels.invoke, request),
    confirmInvocation: (
      request: ExtensionConfirmInvocationRequest
    ): Promise<ExtensionInvocationResult> =>
      ipcRenderer.invoke(extensionChannels.confirmInvocation, request),
    listLogs: (limit?: number): Promise<ExtensionInvocationLogRecord[]> =>
      ipcRenderer.invoke(extensionChannels.logs, limit)
  },
  builtInTools: {
    getCatalog: (): Promise<BuiltInToolCatalogSnapshot> =>
      ipcRenderer.invoke(builtInToolChannels.catalog),
    execute: (request: BuiltInToolExecutionRequest): Promise<unknown> =>
      ipcRenderer.invoke(builtInToolChannels.execute, request),
    listLogs: (limit?: number): Promise<BuiltInToolCallLogRecord[]> =>
      ipcRenderer.invoke(builtInToolChannels.logs, limit),
    getMetrics: (): Promise<AgentQualityMetricSnapshot> =>
      ipcRenderer.invoke(builtInToolChannels.metrics),
    recordMetric: (observation: AgentQualityObservation) =>
      ipcRenderer.invoke(builtInToolChannels.recordMetric, observation)
  },
  system: {
    openExternal: (url: string): Promise<boolean> =>
      ipcRenderer.invoke(systemChannels.openExternal, url)
  },
  web: {
    search: (request: WebSearchRequest): Promise<WebSearchResult> =>
      ipcRenderer.invoke(webSearchChannels.search, request)
  },
  agent: {
    generatePlan: (request: GenerateAgentPlanRequest): Promise<AgentPlanResult> =>
      ipcRenderer.invoke(agentChannels.generatePlan, request),
    generatePlanStream: (
      requestId: string,
      request: GenerateAgentPlanRequest
    ): Promise<AgentPlanResult> =>
      ipcRenderer.invoke(agentChannels.generatePlanStream, requestId, request),
    cancelPlanStream: (requestId: string): Promise<{ ok: boolean; requestId: string }> =>
      ipcRenderer.invoke(agentChannels.cancelPlanStream, requestId),
    onPlanStreamChunk: (listener: (chunk: AgentPlanStreamChunk) => void) => {
      const handler = (_event: IpcRendererEvent, chunk: AgentPlanStreamChunk) => listener(chunk);
      ipcRenderer.on(agentChannels.planStreamChunk, handler);

      return () => ipcRenderer.removeListener(agentChannels.planStreamChunk, handler);
    },
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
    push: (request: ProjectGitPushRequest): Promise<ProjectGitPushResult> =>
      ipcRenderer.invoke(gitChannels.push, request),
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
    preview: (request: {
      projectRoot: string;
      relativePath: string;
      maxBytes?: number;
    }): Promise<ProjectFilePreview> => ipcRenderer.invoke(fileChannels.preview, request),
    listDirectory: (request: {
      includeGitIgnored?: boolean;
      projectRoot: string;
      relativePath?: string;
      limit?: number;
      offset?: number;
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
    }): Promise<ProjectTextFile> => ipcRenderer.invoke(fileChannels.writeText, request),
    delete: (request: {
      projectRoot: string;
      relativePath: string;
      maxBytes?: number;
    }): Promise<ProjectFileDeleteResult> => ipcRenderer.invoke(fileChannels.deleteFile, request)
  }
});
