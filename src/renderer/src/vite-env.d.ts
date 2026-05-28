/// <reference types="vite/client" />

import type {
  AgentFileChangeResult,
  AgentPlanResult,
  GenerateAgentFileChangeRequest,
  GenerateAgentPlanRequest
} from "@shared/agentTypes";
import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";
import type { ProjectFileChangePreview, ProjectTextFile } from "@shared/fileTypes";
import type {
  ProjectGitCommitRequest,
  ProjectGitCommitResult,
  ProjectGitStatus,
  ProjectGitStatusRequest
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
      };
      projects: {
        pickDirectory: () => Promise<string | null>;
        scan: (rootPath: string) => Promise<ProjectScanResult>;
      };
      commands: {
        run: (request: {
          projectRoot: string;
          cwd: string;
          command: string;
          timeoutMs?: number;
        }) => Promise<{
          command: string;
          cwd: string;
          exitCode: number | null;
          stdout: string;
          stderr: string;
          timedOut: boolean;
        }>;
      };
      git: {
        status: (request: ProjectGitStatusRequest) => Promise<ProjectGitStatus>;
        commit: (request: ProjectGitCommitRequest) => Promise<ProjectGitCommitResult>;
      };
      files: {
        readText: (request: {
          projectRoot: string;
          relativePath: string;
          maxBytes?: number;
        }) => Promise<ProjectTextFile>;
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
