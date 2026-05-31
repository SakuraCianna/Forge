/// <reference types="vite/client" />
// 本文件说明: Vite 类型声明

import type { CommandOutputChunk } from "@shared/commandTypes";
import type {
  AgentFileChangeResult,
  AgentAskStreamChunk,
  AgentAskResult,
  AgentPlanResult,
  GenerateAgentAskRequest,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "@shared/agentTypes";
import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";
import type {
  ProjectFileChangePreview,
  ProjectTextFile,
  ProjectTextSearchResult
} from "@shared/fileTypes";
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
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
      };
      models: {
        fetchProviderModels: (provider: ForgeProvider) => Promise<ForgeModel[]>;
      };
      agent: {
        generatePlan: (request: GenerateAgentPlanRequest) => Promise<AgentPlanResult>;
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
      };
    };
  }
}

export {};
