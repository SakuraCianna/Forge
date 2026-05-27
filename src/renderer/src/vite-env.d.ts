/// <reference types="vite/client" />

import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";
import type { ProjectScanResult } from "@shared/projectTypes";

declare global {
  interface Window {
    forge: {
      appName: string;
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
    };
  }
}

export {};
