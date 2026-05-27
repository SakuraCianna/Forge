import { contextBridge, ipcRenderer } from "electron";
import {
  agentChannels,
  commandChannels,
  fileChannels,
  gitChannels,
  keyVaultChannels,
  projectChannels,
  providerModelChannels
} from "../shared/ipcChannels.js";
import type {
  AgentFileChangeResult,
  AgentPlanResult,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "../shared/agentTypes.js";
import type { ForgeProvider } from "../shared/modelTypes.js";
import type { ProjectFileChangePreview, ProjectTextFile } from "../shared/fileTypes.js";
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitStatus,
  ProjectGitStatusRequest
} from "../shared/gitTypes.js";
import type { ProjectScanResult } from "../shared/projectTypes.js";

contextBridge.exposeInMainWorld("forge", {
  appName: "Forge",
  secrets: {
    saveProviderKey: (providerId: string, apiKey: string) =>
      ipcRenderer.invoke(keyVaultChannels.save, providerId, apiKey),
    getProviderKeyStatus: (providerId: string) =>
      ipcRenderer.invoke(keyVaultChannels.status, providerId),
    deleteProviderKey: (providerId: string) => ipcRenderer.invoke(keyVaultChannels.delete, providerId)
  },
  models: {
    fetchProviderModels: (provider: ForgeProvider) =>
      ipcRenderer.invoke(providerModelChannels.fetch, provider)
  },
  agent: {
    generatePlan: (request: GenerateAgentPlanRequest): Promise<AgentPlanResult> =>
      ipcRenderer.invoke(agentChannels.generatePlan, request),
    generateFileChange: (
      request: GenerateAgentFileChangeRequest
    ): Promise<AgentFileChangeResult> =>
      ipcRenderer.invoke(agentChannels.generateFileChange, request)
  },
  projects: {
    pickDirectory: () => ipcRenderer.invoke(projectChannels.pickDirectory),
    scan: (rootPath: string): Promise<ProjectScanResult> =>
      ipcRenderer.invoke(projectChannels.scan, rootPath)
  },
  commands: {
    run: (request: {
      projectRoot: string;
      cwd: string;
      command: string;
      timeoutMs?: number;
    }) => ipcRenderer.invoke(commandChannels.run, request)
  },
  git: {
    status: (request: ProjectGitStatusRequest): Promise<ProjectGitStatus> =>
      ipcRenderer.invoke(gitChannels.status, request),
    commit: (request: ProjectGitCommitRequest): Promise<ProjectGitCommitResult> =>
      ipcRenderer.invoke(gitChannels.commit, request)
  },
  files: {
    readText: (request: {
      projectRoot: string;
      relativePath: string;
      maxBytes?: number;
    }): Promise<ProjectTextFile> => ipcRenderer.invoke(fileChannels.readText, request),
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
