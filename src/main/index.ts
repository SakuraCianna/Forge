import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { join } from "node:path";
import { registerAgentHandlers } from "./agentIpc.js";
import { generateAgentPlan } from "./agentPlanService.js";
import { registerCommandHandlers } from "./commandIpc.js";
import { runProjectCommand } from "./commandRunner.js";
import { registerGitHandlers } from "./gitIpc.js";
import { commitProjectChanges, getProjectGitStatus } from "./gitService.js";
import { createKeyVault } from "./keyVault.js";
import { registerKeyVaultHandlers } from "./keyVaultIpc.js";
import { registerProjectHandlers } from "./projectIpc.js";
import { registerProjectFileHandlers } from "./projectFileIpc.js";
import {
  previewProjectTextFileUpdate,
  readProjectTextFile,
  writeProjectTextFile
} from "./projectFileService.js";
import { pickProjectDirectory } from "./projectPicker.js";
import { scanProjectFiles } from "./projectScanner.js";
import { fetchModelsForProvider } from "./providerModelService.js";
import { registerProviderModelHandlers } from "./providerModelsIpc.js";

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: "Forge",
    backgroundColor: "#101114",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  const keyVault = createKeyVault({
    directory: join(app.getPath("userData"), "secrets"),
    codec: {
      encryptString: (value) => {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("Secure storage is not available on this system");
        }

        return safeStorage.encryptString(value);
      },
      decryptString: (value) => safeStorage.decryptString(value)
    }
  });

  registerKeyVaultHandlers(keyVault, (channel, handler) => {
    ipcMain.handle(channel, handler);
  });

  registerProviderModelHandlers(
    (provider) => fetchModelsForProvider({ provider, keyVault }),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  registerAgentHandlers(
    (request) => generateAgentPlan({ request, keyVault }),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  registerProjectHandlers(
    () => pickProjectDirectory(() => dialog.showOpenDialog({ properties: ["openDirectory"] })),
    (rootPath) => scanProjectFiles(rootPath),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  registerCommandHandlers(
    (request) => runProjectCommand(request),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  registerGitHandlers(
    (request) => getProjectGitStatus(request),
    (request) => commitProjectChanges(request),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  registerProjectFileHandlers(
    (request) => readProjectTextFile(request),
    (request) => previewProjectTextFileUpdate(request),
    (request) => writeProjectTextFile(request),
    (channel, handler) => {
      ipcMain.handle(channel, handler);
    }
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
