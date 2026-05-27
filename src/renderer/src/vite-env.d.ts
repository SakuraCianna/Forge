/// <reference types="vite/client" />

import type { ForgeModel, ForgeProvider } from "@shared/modelTypes";

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
      };
    };
  }
}

export {};
