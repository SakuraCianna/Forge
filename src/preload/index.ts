import { contextBridge, ipcRenderer } from "electron";
import {
  keyVaultChannels,
  projectChannels,
  providerModelChannels
} from "../shared/ipcChannels.js";
import type { ForgeProvider } from "../shared/modelTypes.js";

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
  projects: {
    pickDirectory: () => ipcRenderer.invoke(projectChannels.pickDirectory)
  }
});
