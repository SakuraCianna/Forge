/// <reference types="vite/client" />
// 本文件说明: Vite 类型声明

import type { CommandOutputChunk } from "@shared/commandTypes";
import type {
  AgentFileChangeResult,
  AgentAskStreamChunk,
  AgentAskResult,
  AgentPlanStreamChunk,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "@shared/agentTypes";
import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";
import type {
  LocalSkillFileContent,
  LocalSkillScanResult
} from "@shared/pluginSkillTypes";
import type {
  ProjectDirectoryListResult,
  ProjectFileChangePreview,
  ProjectFileDeleteResult,
  ProjectFileGlobResult,
  ProjectFilePreview,
  ProjectTextFile,
  ProjectTextSearchResult
} from "@shared/fileTypes";
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitPushRequest,
  ProjectGitPushResult,
  ProjectGitStatus,
  ProjectGitStatusRequest,
  ProjectGitWorktreeRequest,
  ProjectGitWorktreeResult
} from "@shared/gitTypes";
import type { ProjectScanResult } from "@shared/projectTypes";

declare global {
  interface Window {
    forge: {
      appName: string;
      windowControls: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        close: () => Promise<void>;
      };
      secrets: {
        saveProviderKey: (providerId: string, apiKey: string) => Promise<void>;
        getProviderKeyStatus: (
          providerId: string
        ) => Promise<{ hasKey: boolean; last4: string | null }>;
        deleteProviderKey: (providerId: string) => Promise<void>;
        clearAllProviderKeys: () => Promise<void>;
      };
      models: {
        fetchProviderModels: (provider: ForgeProvider) => Promise<ForgeModel[]>;
        refreshOpenRouterCatalog: () => Promise<ForgeModel[]>;
      };
      skills: {
        scanLocal: () => Promise<LocalSkillScanResult>;
        readFile: (filePath: string) => Promise<LocalSkillFileContent>;
      };
      system: {
        openExternal: (url: string) => Promise<boolean>;
      };
      agent: {
        generatePlan: (request: GenerateAgentPlanRequest) => Promise<AgentPlanResult>;
        generatePlanStream: (
          requestId: string,
          request: GenerateAgentPlanRequest
        ) => Promise<AgentPlanResult>;
        cancelPlanStream: (requestId: string) => Promise<{ ok: boolean; requestId: string }>;
        onPlanStreamChunk: (listener: (chunk: AgentPlanStreamChunk) => void) => () => void;
        generateFileChange: (
          request: GenerateAgentFileChangeRequest
        ) => Promise<AgentFileChangeResult>;
        generateAsk: (request: GenerateAgentAskRequest) => Promise<AgentAskResult>;
        generateAskStream: (
          requestId: string,
          request: GenerateAgentAskRequest
        ) => Promise<AgentAskResult>;
        cancelAskStream: (requestId: string) => Promise<{ ok: boolean; requestId: string }>;
        onAskStreamChunk: (listener: (chunk: AgentAskStreamChunk) => void) => () => void;
      };
      projects: {
        pickDirectory: () => Promise<string | null>;
        scan: (rootPath: string) => Promise<ProjectScanResult>;
      };
      commands: {
        run: (request: {
          runId?: string;
          projectRoot: string;
          cwd: string;
          command: string;
          timeoutMs?: number;
          runtime?: "windows-native" | "wsl";
          shell?: "powershell" | "cmd" | "git-bash";
          shellExecutable?: string;
        }) => Promise<{
          runId?: string;
          command: string;
          cwd: string;
          exitCode: number | null;
          stdout: string;
          stderr: string;
          timedOut: boolean;
          cancelled?: boolean;
        }>;
        cancel: (request: { runId: string }) => Promise<{ ok: boolean; runId: string }>;
        onOutput: (listener: (chunk: CommandOutputChunk) => void) => () => void;
      };
      git: {
        status: (request: ProjectGitStatusRequest) => Promise<ProjectGitStatus>;
        commit: (request: ProjectGitCommitRequest) => Promise<ProjectGitCommitResult>;
        push: (request: ProjectGitPushRequest) => Promise<ProjectGitPushResult>;
        createWorktree: (
          request: ProjectGitWorktreeRequest
        ) => Promise<ProjectGitWorktreeResult>;
      };
      files: {
        readText: (request: {
          projectRoot: string;
          relativePath: string;
          maxBytes?: number;
        }) => Promise<ProjectTextFile>;
        preview: (request: {
          projectRoot: string;
          relativePath: string;
          maxBytes?: number;
        }) => Promise<ProjectFilePreview>;
        listDirectory: (request: {
          includeGitIgnored?: boolean;
          projectRoot: string;
          relativePath?: string;
          limit?: number;
          offset?: number;
        }) => Promise<ProjectDirectoryListResult>;
        globFiles: (request: {
          projectRoot: string;
          pattern: string;
          limit?: number;
        }) => Promise<ProjectFileGlobResult>;
        searchText: (request: {
          projectRoot: string;
          query: string;
          limit?: number;
          maxFileBytes?: number;
        }) => Promise<ProjectTextSearchResult>;
        previewTextUpdate: (request: {
          projectRoot: string;
          relativePath: string;
          nextContent: string;
          maxBytes?: number;
        }) => Promise<ProjectFileChangePreview>;
        writeText: (request: {
          projectRoot: string;
          relativePath: string;
          nextContent: string;
          maxBytes?: number;
        }) => Promise<ProjectTextFile>;
        delete: (request: {
          projectRoot: string;
          relativePath: string;
          maxBytes?: number;
        }) => Promise<ProjectFileDeleteResult>;
      };
    };
  }
}

export {};
